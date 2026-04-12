# MSSGNOW 💬

Aplicación de mensajería en tiempo real — Proyecto Universitario.

**Stack:** Node.js · Express · WebSockets · MySQL · HTML/CSS/JS Vanilla · Firebase Hosting

---

## 📁 Estructura del Proyecto

```
MSSGNOW/
├── backend/          → Node.js + Express + WebSocket
├── database/         → Esquema SQL
├── frontend/         → HTML, CSS, JS puro
├── firebase.json     → Config Firebase Hosting
└── .gitignore
```

---

## 🖥️ PARTE 1 — Despliegue Backend en Ubuntu

### Requisitos previos en Ubuntu
```bash
# Instalar Node.js (v18 o superior)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Instalar MySQL
sudo apt-get install mysql-server -y
sudo systemctl start mysql
sudo systemctl enable mysql

# Instalar PM2 (para mantener el servidor corriendo)
sudo npm install -g pm2

# Instalar Git
sudo apt-get install git -y
```

### 1. Configurar MySQL
```bash
sudo mysql -u root -p
```
```sql
CREATE DATABASE chat_app;
CREATE USER 'chatuser'@'localhost' IDENTIFIED BY 'TU_PASSWORD_SEGURA';
GRANT ALL PRIVILEGES ON chat_app.* TO 'chatuser'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

Luego ejecutar el esquema:
```bash
mysql -u chatuser -p chat_app < /ruta/al/proyecto/database/esquema.sql
```

### 2. Clonar el repositorio
```bash
git clone https://github.com/TU_USUARIO/MSSGNOW.git
cd MSSGNOW/backend
```

### 3. Instalar dependencias
```bash
npm install
```

### 4. Crear el archivo `.env`
```bash
nano .env
```
Pegar esto (editar con tus datos reales):
```
DB_HOST=localhost
DB_USER=chatuser
DB_PASS=TU_PASSWORD_SEGURA
DB_NAME=chat_app
PORT=3000
```
Guardar: `Ctrl+O`, `Enter`, `Ctrl+X`

### 5. Iniciar el servidor con PM2
```bash
pm2 start server.js --name mssgnow
pm2 save
pm2 startup
```

### 6. Abrir el puerto 3000 en el firewall
```bash
sudo ufw allow 3000
sudo ufw enable
```

### 7. Verificar que funciona
```bash
curl http://localhost:3000
# ó visita: http://TU_IP_PUBLICA:3000
```

---

## 🌐 PARTE 2 — Despliegue Frontend en Firebase Hosting

> El Frontend (HTML/CSS/JS) va en Firebase y se conecta al Backend en Ubuntu.

### Paso 1 — Obtén la IP pública de tu Ubuntu
En Ubuntu:
```bash
curl ifconfig.me
# Salida ejemplo: 123.45.67.89
```

### Paso 2 — Editar la URL del servidor en el Frontend

Abre el archivo `frontend/js/config.js` en tu computadora Windows y cambia:

```js
const CONFIG = {
  API_URL: "http://123.45.67.89:3000/api",   // ← Tu IP real aquí
  WS_URL:  "ws://123.45.67.89:3000"           // ← Y aquí
};
```

### Paso 3 — Instalar Firebase CLI (en Windows)
```powershell
npm install -g firebase-tools
firebase login
```

### Paso 4 — Crear el proyecto en Firebase
1. Ve a [https://console.firebase.google.com](https://console.firebase.google.com)
2. Haz clic en **"Crear un proyecto"**
3. Ponle el nombre **MSSGNOW** (o el que quieras)
4. Desactiva Google Analytics (no es necesario) → Crear proyecto

### Paso 5 — Vincular el proyecto al código
En `MSSGNOW/.firebaserc`, reemplaza `TU-PROYECTO-FIREBASE-ID` con el ID real de tu proyecto (lo encuentras en la consola de Firebase):

```json
{
  "projects": {
    "default": "mssgnow-12345"
  }
}
```

### Paso 6 — Desplegar

Desde la carpeta raíz de `MSSGNOW/` en tu PowerShell:
```powershell
firebase deploy --only hosting
```

✅ Al terminar, Firebase te dará una URL pública como:
```
https://mssgnow-12345.web.app
```

Esa URL es la que compartes con tus compañeros para que accedan al chat.

---

## 🔄 Flujo de Actualización

Cuando hagas cambios al código:

**Backend (Ubuntu):**
```bash
git pull
pm2 restart mssgnow
```

**Frontend (Firebase):**
```powershell
git add .
git commit -m "Actualización"
git push
firebase deploy --only hosting
```

---

## 📌 Comandos Útiles de PM2

```bash
pm2 list              # Ver estado del servidor
pm2 logs mssgnow      # Ver logs en tiempo real
pm2 restart mssgnow   # Reiniciar el servidor
pm2 stop mssgnow      # Detenerlo
```

---

## ⚠️ Notas Importantes

- El archivo `backend/.env` **NO se sube a GitHub** (está en `.gitignore`). Créalo manualmente en Ubuntu.
- La carpeta `uploads/` se crea automáticamente en el servidor. Las imágenes enviadas en los chats se guardan ahí.
- Si cambias la IP de tu servidor Ubuntu, solo edita `frontend/js/config.js` y vuelve a hacer `firebase deploy`.
