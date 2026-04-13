const API_URL = CONFIG.API_URL;
const WS_URL  = CONFIG.WS_URL;
const BASE_URL = API_URL.replace('/api', ''); // for media files

let socket;
let currentUser = null;
let currentChatId = null;
let allChats = [];
let onlineUsers = new Set();
let activeContextMenu = null;

// UI Elements
const chatListContainer = document.getElementById("chat-list-container");
const activeChatScreen  = document.getElementById("active-chat-screen");
const noChatScreen      = document.getElementById("no-chat-screen");
const messagesContainer = document.getElementById("messages-container");
const messageInput      = document.getElementById("message-input");
const sendMsgBtn        = document.getElementById("send-msg-btn");
const attachBtn         = document.getElementById("attach-btn");
const fileInput         = document.getElementById("file-input");
const chatSearchInput   = document.getElementById("chat-search");

// ─────────────────────────────────
//  INIT
// ─────────────────────────────────
window.onload = () => {
  const raw = localStorage.getItem("mssgnow_user");
  if (!raw) { window.location.href = "index.html"; return; }

  currentUser = JSON.parse(raw);
  const avatarEl = document.getElementById("my-avatar");
  document.getElementById("my-username").textContent = currentUser.username;
  avatarEl.textContent = currentUser.username.charAt(0).toUpperCase();

  initWebSocket();
  loadChats();
};

document.getElementById("logout-btn").addEventListener("click", () => {
  localStorage.removeItem("mssgnow_user");
  if (socket) socket.close();
  window.location.href = "index.html";
});

// ─────────────────────────────────
//  WEBSOCKET
// ─────────────────────────────────
function initWebSocket() {
  socket = new WebSocket(WS_URL);

  socket.onopen = () => {
    socket.send(JSON.stringify({ type: "auth", userId: currentUser.id }));
  };

  socket.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    switch (msg.type) {
      case "auth_success":
        console.log("🔐 WS autenticado");
        break;

      case "receive_message":
        handleIncomingMessage(msg.data);
        break;

      case "online_users":
        onlineUsers = new Set(msg.userIds);
        updateOnlineStatus();
        break;

      case "message_status_update":
        updateMessageStatusUI(msg.data);
        break;

      case "error":
        console.error("WS error:", msg.message);
        break;
    }
  };

  socket.onclose = () => setTimeout(initWebSocket, 3000);
}

function handleIncomingMessage(data) {
  if (data.chatId === currentChatId) {
    appendMessage(data);
    scrollToBottom();
    if ((data.senderId || data.sender_id) !== currentUser.id) {
      socket.send(JSON.stringify({ type: "read", messageId: data.id }));
    }
  } else {
    if ((data.senderId || data.sender_id) !== currentUser.id) {
      socket.send(JSON.stringify({ type: "delivered", messageId: data.id }));
    }
  }
  
  // Reordenar chat en la lista local
  const chatIdx = allChats.findIndex(c => c.id === data.chatId);
  if (chatIdx > -1) {
    const chat = allChats.splice(chatIdx, 1)[0];
    allChats.unshift(chat); // Mover al principio
    renderChatList(allChats);
  } else {
    loadChats(); // Si no existe en la lista local, recargar de la API
  }
}

// ─────────────────────────────────
//  API helper
// ─────────────────────────────────
async function fetchSimpleAuth(url, options = {}) {
  const headers = { 'user-id': currentUser.id, ...options.headers };
  const res = await fetch(`${API_URL}${url}`, { ...options, headers });
  if (res.status === 401 || res.status === 403) {
    localStorage.removeItem("mssgnow_user");
    window.location.href = "index.html";
    throw new Error("No autenticado");
  }
  return res;
}

// ─────────────────────────────────
//  CHAT LIST
// ─────────────────────────────────
async function loadChats() {
  try {
    const res = await fetchSimpleAuth("/chats");
    allChats = await res.json();
    renderChatList(allChats);
  } catch (err) {
    console.error("Error al cargar chats:", err);
  }
}

function renderChatList(chats) {
  chatListContainer.innerHTML = '';
  if (chats.length === 0) {
    chatListContainer.innerHTML = '<div class="empty-chats">No hay chats disponibles.</div>';
    return;
  }

  chats.forEach(chat => {
    const el = document.createElement("div");
    el.className = "chat-item" + (chat.id === currentChatId ? " active" : "");
    const initial = (chat.name || "?").charAt(0).toUpperCase();
    const isGlobal = chat.type_name === 'global';
    const isOnline = chat.type_name === 'private' && onlineUsers.has(chat.other_user_id);

    el.innerHTML = `
      <div class="avatar${isGlobal ? ' avatar-global' : ''}">${initial}</div>
      <div class="chat-item-info">
        <div class="chat-item-top">
          <span class="chat-item-name">${chat.name || 'Chat'}</span>
          ${isGlobal ? '<span class="global-badge">🌎</span>' : ''}
          ${isOnline ? '<span class="online-dot-small"></span>' : ''}
        </div>
        <div class="chat-item-bottom">
          <span class="chat-item-msg">Toca para abrir</span>
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
}

// Chat search filter
chatSearchInput.addEventListener("input", () => {
  const q = chatSearchInput.value.toLowerCase().trim();
  renderChatList(q ? allChats.filter(c => (c.name || '').toLowerCase().includes(q)) : allChats);
});

// ─────────────────────────────────
//  OPEN CHAT
// ─────────────────────────────────
async function openChat(chat) {
  currentChatId = chat.id;

  document.getElementById("active-chat-name").textContent = chat.name || 'Chat';
  document.getElementById("active-chat-avatar").textContent = (chat.name || "C").charAt(0).toUpperCase();

  const statusEl = document.getElementById("active-chat-status");
  if (chat.type_name === 'global') {
    statusEl.textContent = `${onlineUsers.size} en línea`;
  } else {
    statusEl.textContent = chat.type_name === 'group' ? 'Grupo' : 'Chat privado';
  }

  noChatScreen.classList.add("hidden");
  activeChatScreen.classList.remove("hidden");

  messagesContainer.innerHTML = '<div style="text-align:center;padding:40px;color:rgba(255,255,255,0.4);">Cargando mensajes...</div>';

  try {
    const res = await fetchSimpleAuth(`/chats/${chat.id}/messages`);
    const messages = await res.json();
    messagesContainer.innerHTML = '';

    if (messages.length === 0) {
      messagesContainer.innerHTML = '<div class="empty-chats" style="color:rgba(255,255,255,0.4);">¡Sé el primero en escribir! 👋</div>';
    } else {
      messages.forEach(msg => {
        appendMessage(msg);
        // Si el mensaje es recibido y no está leído, marcarlo como leído ahora que abrimos el chat
        const senderId = msg.senderId ?? msg.sender_id;
        if (senderId !== currentUser.id && msg.status !== 'read') {
          socket?.send(JSON.stringify({ type: "read", messageId: msg.id }));
        }
      });
      scrollToBottom();
    }
  } catch (err) {
    messagesContainer.innerHTML = '<div style="color:#ff6b6b;text-align:center;padding:20px;">Error cargando mensajes.</div>';
  }
}

// ─────────────────────────────────
//  RENDER MESSAGE
// ─────────────────────────────────
function appendMessage(msg) {
  const senderId = msg.senderId ?? msg.sender_id;
  const isMine   = senderId === currentUser.id;

  // Remove empty placeholder
  messagesContainer.querySelector(".empty-chats")?.remove();

  const el = document.createElement("div");
  el.className = `message ${isMine ? 'msg-sent' : 'msg-received'}`;
  el.dataset.messageId = msg.id;

  let timeStr = "";
  const ts = msg.created_at || msg.createdAt;
  if (ts) {
    const d = new Date(ts);
    timeStr = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }

  if (msg.deleted_by || msg.isDeletedGlobal) {
    el.innerHTML = `<div class="msg-deleted"><i class="fas fa-ban"></i> Mensaje eliminado</div>`;
  } else {
    const senderDisplay = !isMine
      ? `<span class="msg-sender">${msg.sender_name || 'Usuario'}</span>`
      : '';

    // Fix: check both camelCase (from WS) and snake_case (from DB)
    const fileUrl = msg.fileUrl || msg.file_url;
    const msgType = msg.type || 'text';

    let contentHtml;
    if (msgType === 'image' && fileUrl) {
      const imgUrl = fileUrl.startsWith('http') ? fileUrl : `${BASE_URL}${fileUrl}`;
      contentHtml = `<img src="${imgUrl}" class="msg-image" alt="imagen" onclick="viewImage('${imgUrl}')">`;
    } else {
      contentHtml = `<span>${msg.content || ''}</span>`;
    }

    const statusHtml = getStatusIconHtml(msg.status || 'sent');

    el.innerHTML = `
      ${senderDisplay}
      <div class="msg-bubble">
        <div class="msg-content">${contentHtml}</div>
        <div class="msg-time">${timeStr}${isMine ? statusHtml : ''}</div>
      </div>
    `;
  }

  el.addEventListener('contextmenu', e => {
    e.preventDefault();
    showContextMenu(e, msg.id, isMine);
  });

  messagesContainer.appendChild(el);
}

function getStatusIconHtml(status) {
  switch (status) {
    case 'read':
      return '<i class="fas fa-check-double status-tick read" style="color:#53bdeb;font-size:10px;margin-left:4px;"></i>';
    case 'delivered':
      return '<i class="fas fa-check-double status-tick" style="color:var(--text-secondary);font-size:10px;margin-left:4px;"></i>';
    case 'sent':
    default:
      return '<i class="fas fa-check status-tick" style="color:var(--text-secondary);font-size:10px;margin-left:4px;"></i>';
  }
}

function updateMessageStatusUI(data) {
  const { messageId, status } = data;
  const msgEl = messagesContainer.querySelector(`[data-message-id="${messageId}"]`);
  if (!msgEl) return;

  const tickContainer = msgEl.querySelector(".msg-time");
  if (!tickContainer) return;

  // Reemplazar el icono existente
  const oldTick = tickContainer.querySelector(".status-tick");
  if (oldTick) oldTick.remove();
  
  tickContainer.insertAdjacentHTML('beforeend', getStatusIconHtml(status));
}

function viewImage(url) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.92);display:flex;align-items:center;justify-content:center;z-index:9999;cursor:zoom-out';
  overlay.innerHTML = `<img src="${url}" style="max-width:90vw;max-height:90vh;border-radius:10px;box-shadow:0 0 40px rgba(0,0,0,0.8)">`;
  overlay.addEventListener('click', () => overlay.remove());
  document.body.appendChild(overlay);
}

function scrollToBottom() {
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// ─────────────────────────────────
//  CONTEXT MENU (right-click on msg)
// ─────────────────────────────────
function closeContextMenu() {
  if (activeContextMenu) { activeContextMenu.remove(); activeContextMenu = null; }
}

function showContextMenu(e, messageId, isMine) {
  closeContextMenu();

  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.style.top  = `${Math.min(e.clientY, window.innerHeight - 120)}px`;
  menu.style.left = `${Math.min(e.clientX, window.innerWidth - 200)}px`;

  menu.innerHTML = isMine ? `
    <div class="ctx-item" onclick="deleteMsg(${messageId},false)"><i class="fas fa-trash-alt"></i> Eliminar para mí</div>
    <div class="ctx-item ctx-danger" onclick="deleteMsg(${messageId},true)"><i class="fas fa-ban"></i> Eliminar para todos</div>
  ` : `
    <div class="ctx-item" onclick="deleteMsg(${messageId},false)"><i class="fas fa-trash-alt"></i> Eliminar para mí</div>
  `;

  document.body.appendChild(menu);
  activeContextMenu = menu;

  setTimeout(() => document.addEventListener('click', closeContextMenu, { once: true }), 50);
}

async function deleteMsg(messageId, forEveryone) {
  closeContextMenu();
  try {
    const res = await fetchSimpleAuth(`/messages/${messageId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deleteForEveryone: forEveryone })
    });
    if (res.ok) {
      const el = messagesContainer.querySelector(`[data-message-id="${messageId}"]`);
      if (el) {
        if (forEveryone) {
          el.innerHTML = '<div class="msg-deleted"><i class="fas fa-ban"></i> Mensaje eliminado</div>';
        } else {
          el.remove();
        }
      }
    }
  } catch (err) { console.error("Error al eliminar:", err); }
}

// ─────────────────────────────────
//  THREE DOTS MENU
// ─────────────────────────────────
document.getElementById("chat-options-btn").addEventListener("click", e => {
  e.stopPropagation();
  closeContextMenu();

  const btn  = e.currentTarget;
  const rect = btn.getBoundingClientRect();
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.style.top   = `${rect.bottom + 6}px`;
  menu.style.right = `${window.innerWidth - rect.right}px`;
  menu.style.left  = 'auto';

  menu.innerHTML = `
    <div class="ctx-item" onclick="clearView()"><i class="fas fa-eraser"></i> Limpiar vista</div>
    <div class="ctx-item" onclick="scrollToBottom()"><i class="fas fa-arrow-down"></i> Ir al final</div>
  `;

  document.body.appendChild(menu);
  activeContextMenu = menu;
  setTimeout(() => document.addEventListener('click', closeContextMenu, { once: true }), 50);
});

function clearView() {
  closeContextMenu();
  messagesContainer.innerHTML = '<div class="empty-chats" style="color:rgba(255,255,255,0.4);">Vista limpiada (mensajes siguen en el servidor).</div>';
}

// ─────────────────────────────────
//  SEND MESSAGE
// ─────────────────────────────────
sendMsgBtn.addEventListener("click", sendMessage);
messageInput.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) sendMessage(); });

function sendMessage() {
  const content = messageInput.value.trim();
  if (!content || !currentChatId || socket?.readyState !== WebSocket.OPEN) return;
  messageInput.value = '';
  socket.send(JSON.stringify({ type: "send_message", chatId: currentChatId, content, msgType: "text" }));
}

// ─────────────────────────────────
//  FILE UPLOAD
// ─────────────────────────────────
attachBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", async e => {
  const file = e.target.files[0];
  fileInput.value = '';
  if (!file || !currentChatId) return;

  // Show upload indicator
  const loadingEl = document.createElement('div');
  loadingEl.className = 'message msg-sent';
  loadingEl.innerHTML = '<div class="msg-bubble" style="opacity:0.6">Subiendo... <i class="fas fa-spinner fa-spin"></i></div>';
  messagesContainer.appendChild(loadingEl);
  scrollToBottom();

  try {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${API_URL}/messages/upload`, {
      method: "POST",
      headers: { "user-id": currentUser.id },
      body: formData
    });
    loadingEl.remove();

    const data = await res.json();
    if (res.ok && data.fileUrl) {
      socket.send(JSON.stringify({
        type: "send_message",
        chatId: currentChatId,
        content: file.name,
        msgType: file.type.startsWith('image') ? 'image' : 'file',
        fileUrl: data.fileUrl
      }));
    }
  } catch (err) {
    loadingEl.remove();
    console.error("Error subiendo archivo:", err);
  }
});

// ─────────────────────────────────
//  ONLINE USERS
// ─────────────────────────────────
function updateOnlineStatus() {
  const statusEl = document.getElementById("active-chat-status");
  if (statusEl && currentChatId) {
    const chat = allChats.find(c => c.id === currentChatId);
    if (chat?.type_name === 'global') {
      statusEl.textContent = `${onlineUsers.size} en línea`;
    }
  }
  
  // Refresh chat list to show/hide online dots
  renderChatList(allChats);
}

// ─────────────────────────────────
//  NEW CHAT MODAL
// ─────────────────────────────────
const newChatBtn            = document.getElementById("new-chat-btn");
const modal                 = document.getElementById("new-chat-modal");
const cancelModal           = document.getElementById("cancel-new-chat");
const confirmModal          = document.getElementById("confirm-new-chat");
const searchInput           = document.getElementById("new-chat-username");
const searchResults         = document.getElementById("user-search-results");
const selectedParticipantsEl = document.getElementById("selected-participants");

let chatMode = 'private';
let selectedUsers = [];
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
  searchResults.innerHTML = '';
  searchResults.classList.add("hidden");
  searchInput.value = '';
}

function renderSelectedChips() {
  selectedParticipantsEl.innerHTML = selectedUsers.map(u => `
    <div class="participant-chip">
      ${u.username}
      <button onclick="removeParticipant(${u.id})">✕</button>
    </div>
  `).join('');
}

function removeParticipant(userId) {
  selectedUsers = selectedUsers.filter(u => u.id !== userId);
  renderSelectedChips();
}

newChatBtn.addEventListener("click", () => { modal.classList.remove("hidden"); switchChatMode('private'); });
cancelModal.addEventListener("click", () => { modal.classList.add("hidden"); selectedUsers = []; searchInput.value = ''; });

searchInput.addEventListener("input", () => {
  clearTimeout(searchDebounce);
  const q = searchInput.value.trim();
  if (!q) { searchResults.classList.add("hidden"); searchResults.innerHTML = ''; return; }

  searchDebounce = setTimeout(async () => {
    try {
      const res = await fetchSimpleAuth(`/users/search?q=${encodeURIComponent(q)}`);
      const users = await res.json();
      const filtered = users.filter(u => u.id !== currentUser.id && !selectedUsers.find(s => s.id === u.id));

      searchResults.innerHTML = filtered.length === 0
        ? '<div style="padding:12px;color:var(--text-secondary);font-size:14px;">Sin resultados</div>'
        : filtered.map(u => `
            <div class="user-result-item" onclick="selectUser(${u.id}, '${u.username}')">
              <div class="avatar">${u.username.charAt(0).toUpperCase()}</div>
              <span>${u.username}</span>
              ${onlineUsers.has(u.id) ? '<span class="online-dot-small"></span>' : ''}
            </div>`).join('');

      searchResults.classList.remove("hidden");
    } catch (err) { console.error(err); }
  }, 350);
});

function selectUser(userId, username) {
  if (chatMode === 'private') {
    searchInput.value = username;
    searchResults.classList.add("hidden");
    selectedUsers = [{ id: userId, username }];
  } else {
    if (!selectedUsers.find(u => u.id === userId)) { selectedUsers.push({ id: userId, username }); renderSelectedChips(); }
    searchInput.value = '';
    searchResults.classList.add("hidden");
  }
}

confirmModal.addEventListener("click", async () => {
  if (chatMode === 'private') {
    if (!selectedUsers.length) return alert("Selecciona un usuario.");
    try {
      const res = await fetchSimpleAuth('/chats', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ typeName: 'private', participants: [selectedUsers[0].id] }) });
      const data = await res.json();
      if (res.ok) { modal.classList.add("hidden"); loadChats(); } else { alert(data.message); }
    } catch (err) { console.error(err); }
  } else {
    if (!selectedUsers.length) return alert("Agrega al menos un participante.");
    const groupName = document.getElementById("group-name-input").value.trim() || `Grupo de ${currentUser.username}`;
    try {
      const res = await fetchSimpleAuth('/chats', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ typeName: 'group', name: groupName, participants: selectedUsers.map(u => u.id) }) });
      const data = await res.json();
      if (res.ok) { modal.classList.add("hidden"); selectedUsers = []; loadChats(); } else { alert(data.message); }
    } catch (err) { console.error(err); }
  }
});
