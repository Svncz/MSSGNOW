const API_URL = CONFIG.API_URL;

// Alternar entre login y registro
function toggleForm(formType) {
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');

  if (formType === 'register') {
    loginForm.classList.remove('active');
    setTimeout(() => registerForm.classList.add('active'), 150);
  } else {
    registerForm.classList.remove('active');
    setTimeout(() => loginForm.classList.add('active'), 150);
  }
}

// Manejar Login
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button');
  const originalText = btn.textContent;
  
  const emailOrUser = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;

  try {
    btn.textContent = "Conectando...";
    btn.disabled = true;

    const response = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usernameOrEmail: emailOrUser, password })
    });

    const data = await response.json();

    if (response.ok) {
      // Guardar datos localmente (Sin JWT)
      localStorage.setItem("mssgnow_user", JSON.stringify(data.user));
      window.location.href = "chat.html";
    } else {
      alert(data.message || "Error al iniciar sesión");
    }
  } catch (err) {
    console.error(err);
    alert("Error de conexión con el servidor");
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
});

// Manejar Registro
document.getElementById('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button');
  const originalText = btn.textContent;

  const username = document.getElementById('reg-username').value;
  const email = document.getElementById('reg-email').value;
  const password = document.getElementById('reg-password').value;

  try {
    btn.textContent = "Creando cuenta...";
    btn.disabled = true;

    const response = await fetch(`${API_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password })
    });

    const data = await response.json();

    if (response.ok) {
      // Al registrar, el servidor ya nos incluye automáticamente en el Chat Global!
      localStorage.setItem("mssgnow_user", JSON.stringify(data.user));
      alert("¡Cuenta creada! Ya estás unido al Chat Global.");
      window.location.href = "chat.html";
    } else {
      alert(data.message || "Error al registrarse");
    }
  } catch (err) {
    console.error(err);
    alert("Error de conexión con el servidor");
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
});

// Chequear si ya hay un usuario guardado
window.onload = () => {
  const user = localStorage.getItem("mssgnow_user");
  if (user) {
    window.location.href = "chat.html";
  }
};
