const API_URL = CONFIG.API_URL;
const WS_URL  = CONFIG.WS_URL;

let socket;
let currentUser = null;
let currentChatId = null;

// UI Elements
const chatListContainer = document.getElementById("chat-list-container");
const activeChatScreen = document.getElementById("active-chat-screen");
const noChatScreen = document.getElementById("no-chat-screen");
const messagesContainer = document.getElementById("messages-container");
const messageInput = document.getElementById("message-input");
const sendMsgBtn = document.getElementById("send-msg-btn");
const attachBtn = document.getElementById("attach-btn");
const fileInput = document.getElementById("file-input");

// Init
window.onload = () => {
  const userDataString = localStorage.getItem("mssgnow_user");
  if (!userDataString) {
    window.location.href = "index.html";
    return;
  }
  
  currentUser = JSON.parse(userDataString);
  document.getElementById("my-username").textContent = currentUser.username;
  
  if (currentUser.profilePicUrl) {
    document.getElementById("my-avatar").style.backgroundImage = `url(${currentUser.profilePicUrl})`;
  } else {
    document.getElementById("my-avatar").textContent = currentUser.username.charAt(0).toUpperCase();
  }

  initWebSocket();
  loadChats();
};

function logout() {
  localStorage.removeItem("mssgnow_user");
  if (socket) socket.close();
  window.location.href = "index.html";
}

document.getElementById("logout-btn").addEventListener("click", logout);

// --- WEBSOCKET LOGIC ---
function initWebSocket() {
  socket = new WebSocket(WS_URL);

  socket.onopen = () => {
    console.log("Conectado a WS");
    socket.send(JSON.stringify({
      type: "auth",
      userId: currentUser.id
    }));
  };

  socket.onmessage = (event) => {
    const response = JSON.parse(event.data);

    switch (response.type) {
      case "auth_success":
        console.log("WebSocket autenticado");
        break;
      
      case "receive_message":
        const msg = response.data;
        if (msg.chatId === currentChatId) {
          appendMessage(msg);
          scrollToBottom();
          if (msg.senderId !== currentUser.id) {
            socket.send(JSON.stringify({ type: "read", messageId: msg.id }));
          }
        } else {
          if (msg.senderId !== currentUser.id) {
            socket.send(JSON.stringify({ type: "delivered", messageId: msg.id }));
          }
        }
        loadChats();
        break;
        
      case "error":
        console.error("WS Error:", response.message);
        break;
    }
  };

  socket.onclose = () => {
    console.log("WS Desconectado, intentando reconectar en 3s...");
    setTimeout(initWebSocket, 3000);
  };
}

// --- API ACTIONS ---
async function fetchSimpleAuth(url, options = {}) {
  const headers = {
    'user-id': currentUser.id,
    ...options.headers
  };
  
  const response = await fetch(`${API_URL}${url}`, { ...options, headers });
  
  if (response.status === 401 || response.status === 403) {
    logout();
    throw new Error('Authentication failed');
  }
  return response;
}

// Cargar lista de chats
async function loadChats() {
  try {
    const res = await fetchSimpleAuth("/chats");
    const chats = await res.json();
    
    chatListContainer.innerHTML = '';
    
    if (chats.length === 0) {
      chatListContainer.innerHTML = '<div class="empty-chats">No se encontraron chats.<br>Recarga la página o inicia sesión de nuevo.</div>';
      return;
    }

    chats.forEach(chat => {
      const el = document.createElement("div");
      el.className = "chat-item";
      if (chat.id === currentChatId) el.classList.add("active");
      
      const initial = chat.name ? chat.name.charAt(0).toUpperCase() : '?';
      
      el.innerHTML = `
        <div class="avatar">${initial}</div>
        <div class="chat-item-info">
          <div class="chat-item-top">
            <span class="chat-item-name">${chat.name}</span>
          </div>
          <div class="chat-item-bottom">
            <span class="chat-item-msg">Haz clic para ver los mensajes</span>
          </div>
        </div>
      `;
      
      el.addEventListener('click', () => {
        document.querySelectorAll(".chat-item").forEach(i => i.classList.remove("active"));
        el.classList.add("active");
        openChat(chat);
      });
      
      chatListContainer.appendChild(el);
    });
    
  } catch (err) {
    console.error("Error al cargar chats:", err);
  }
}

// Abrir chat
async function openChat(chat) {
  currentChatId = chat.id;
  document.getElementById("active-chat-name").textContent = chat.name;
  document.getElementById("active-chat-avatar").textContent = chat.name.charAt(0).toUpperCase();
  
  noChatScreen.classList.add("hidden");
  activeChatScreen.classList.remove("hidden");
  
  messagesContainer.innerHTML = '<div style="color:white;text-align:center;padding:20px;">Cargando mensajes...</div>';
  
  try {
    const res = await fetchSimpleAuth(`/chats/${chat.id}/messages`);
    const messages = await res.json();
    
    messagesContainer.innerHTML = '';
    
    if (messages.length === 0) {
      messagesContainer.innerHTML = '<div class="empty-chats" style="color:rgba(255,255,255,0.7);">Se el primero en decir hola.</div>';
    } else {
      messages.forEach(msg => appendMessage(msg));
      scrollToBottom();
    }
  } catch (err) {
    console.error(err);
    messagesContainer.innerHTML = '<div style="color:red;text-align:center;">Error cargando mensajes.</div>';
  }
}

// Renderizar un mensaje en la UI
function appendMessage(msg) {
  const isMine = msg.senderId === currentUser.id || msg.sender_id === currentUser.id;
  const el = document.createElement("div");
  el.className = `message ${isMine ? 'msg-sent' : 'msg-received'}`;
  
  let timeStr = "";
  if (msg.created_at || msg.createdAt) {
    const d = new Date(msg.created_at || msg.createdAt);
    timeStr = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  }

  const emptyDiv = messagesContainer.querySelector(".empty-chats");
  if(emptyDiv) emptyDiv.remove();

  if (msg.isDeletedGlobal) {
    el.innerHTML = `<div class="msg-deleted"><i class="fas fa-ban"></i> Mensaje eliminado</div>`;
  } else {
    let contentHtml = msg.content || "";
    
    if (msg.type === "image" && msg.file_url) {
      // El backend va a hostear publicamente las imagenes subidas a localhost:3000/uploads
      const url = msg.file_url.startsWith('http') ? msg.file_url : `http://localhost:3000${msg.file_url}`;
      contentHtml = `<img src="${url}" alt="imagen" style="max-width:200px; border-radius:8px;"><br>` + contentHtml;
    }

    let statusIcon = "";
    if (isMine) statusIcon = '<i class="fas fa-check status-sent"></i>';

    const senderName = (!isMine && msg.sender_name) ? `<strong style="font-size:12px;color:var(--accent-color);display:block;margin-bottom:4px;">${msg.sender_name}</strong>` : '';

    el.innerHTML = `
      ${senderName}
      <div class="msg-content">${contentHtml}</div>
      <div class="msg-time">${timeStr} <span class="msg-status">${statusIcon}</span></div>
    `;
  }
  
  messagesContainer.appendChild(el);
}

function scrollToBottom() {
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Enviar Mensaje (Texto Normal)
sendMsgBtn.addEventListener("click", sendMessage);
messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendMessage();
});

function sendMessage() {
  const content = messageInput.value.trim();
  if (!content || !currentChatId) return;
  messageInput.value = '';
  
  socket.send(JSON.stringify({
    type: "send_message",
    chatId: currentChatId,
    content: content,
    msgType: "text"
  }));
}

// Subir Archivo
attachBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file || !currentChatId) return;

  const formData = new FormData();
  formData.append("file", file);

  try {
    const response = await fetch(`${API_URL}/messages/upload`, {
      method: "POST",
      headers: { "user-id": currentUser.id },
      body: formData
    });
    
    const data = await response.json();
    if (response.ok && data.fileUrl) {
      // Notificamos via websocket usando la URL devuelta por nuestro server
      socket.send(JSON.stringify({
        type: "send_message",
        chatId: currentChatId,
        content: file.name,
        msgType: file.type.startsWith('image') ? 'image' : 'file',
        fileUrl: data.fileUrl
      }));
    }
  } catch (error) {
    console.error("Error subiendo archivo:", error);
    alert("Hubo un error subiendo la imagen.");
  }
});

// --- NEW CHAT MODAL LOGIC (Privado y Grupal) ---
const newChatBtn = document.getElementById("new-chat-btn");
const modal = document.getElementById("new-chat-modal");
const cancelModal = document.getElementById("cancel-new-chat");
const confirmModal = document.getElementById("confirm-new-chat");
const searchInput = document.getElementById("new-chat-username");
const searchResults = document.getElementById("user-search-results");
const selectedParticipantsEl = document.getElementById("selected-participants");

let chatMode = 'private'; // 'private' o 'group'
let selectedUsers = []; // Array de { id, username } para grupos
let searchDebounce;

function switchChatMode(mode) {
  chatMode = mode;
  document.getElementById("tab-private").classList.toggle("active", mode === 'private');
  document.getElementById("tab-group").classList.toggle("active", mode === 'group');
  document.getElementById("group-name-field").classList.toggle("hidden", mode === 'private');
  selectedParticipantsEl.classList.toggle("hidden", mode === 'private');
  document.getElementById("modal-hint").textContent = mode === 'group'
    ? "Busca y agrega varios usuarios al grupo."
    : "Escribe el nombre de usuario para buscarlo.";
  selectedUsers = [];
  renderSelectedChips();
  searchResults.classList.add("hidden");
  searchResults.innerHTML = '';
  searchInput.value = '';
}

function renderSelectedChips() {
  selectedParticipantsEl.innerHTML = selectedUsers.map(u => `
    <div class="participant-chip">
      ${u.username}
      <button onclick="removeParticipant(${u.id})" title="Eliminar">✕</button>
    </div>
  `).join('');
}

function removeParticipant(userId) {
  selectedUsers = selectedUsers.filter(u => u.id !== userId);
  renderSelectedChips();
}

newChatBtn.addEventListener("click", () => {
  modal.classList.remove("hidden");
  switchChatMode('private'); // reset al abrir
});

cancelModal.addEventListener("click", () => {
  modal.classList.add("hidden");
  searchInput.value = "";
  selectedUsers = [];
});

// Búsqueda con debounce (espera 400ms tras dejar de escribir)
searchInput.addEventListener("input", () => {
  clearTimeout(searchDebounce);
  const q = searchInput.value.trim();

  if (!q) {
    searchResults.classList.add("hidden");
    searchResults.innerHTML = '';
    return;
  }

  searchDebounce = setTimeout(async () => {
    try {
      const res = await fetchSimpleAuth(`/users/search?q=${encodeURIComponent(q)}`);
      const users = await res.json();

      // Filtrar al propio usuario y los ya seleccionados
      const filtered = users.filter(u =>
        u.id !== currentUser.id && !selectedUsers.find(s => s.id === u.id)
      );

      if (filtered.length === 0) {
        searchResults.innerHTML = '<div style="padding:12px;color:var(--text-secondary);font-size:14px;">Sin resultados</div>';
      } else {
        searchResults.innerHTML = filtered.map(u => `
          <div class="user-result-item" onclick="selectUser(${u.id}, '${u.username}')">
            <div class="avatar">${u.username.charAt(0).toUpperCase()}</div>
            <span>${u.username}</span>
          </div>
        `).join('');
      }

      searchResults.classList.remove("hidden");
    } catch (err) {
      console.error("Error en búsqueda:", err);
    }
  }, 400);
});

function selectUser(userId, username) {
  if (chatMode === 'private') {
    // En privado: selección directa y creamos el chat
    searchInput.value = username;
    searchResults.classList.add("hidden");
    selectedUsers = [{ id: userId, username }];
  } else {
    // En grupo: agrega el usuario al conjunto y limpia el input
    if (!selectedUsers.find(u => u.id === userId)) {
      selectedUsers.push({ id: userId, username });
      renderSelectedChips();
    }
    searchInput.value = '';
    searchResults.classList.add("hidden");
  }
}

confirmModal.addEventListener("click", async () => {
  if (chatMode === 'private') {
    if (selectedUsers.length === 0) return alert("Elige un usuario para chatear.");

    const targetUser = selectedUsers[0];
    try {
      const res = await fetchSimpleAuth(`/chats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ typeName: 'private', participants: [targetUser.id] })
      });
      const data = await res.json();
      if (res.ok) {
        modal.classList.add("hidden");
        loadChats();
      } else {
        alert("Error: " + data.message);
      }
    } catch (err) {
      console.error(err);
    }

  } else {
    // Grupal
    if (selectedUsers.length < 1) return alert("Agrega al menos un participante al grupo.");
    const groupName = document.getElementById("group-name-input").value.trim() || `Grupo de ${currentUser.username}`;

    try {
      const res = await fetchSimpleAuth(`/chats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          typeName: 'group',
          name: groupName,
          participants: selectedUsers.map(u => u.id)
        })
      });
      const data = await res.json();
      if (res.ok) {
        modal.classList.add("hidden");
        selectedUsers = [];
        loadChats();
      } else {
        alert("Error: " + data.message);
      }
    } catch (err) {
      console.error(err);
    }
  }
});

