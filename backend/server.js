require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const db = require("./connection");
const initSocket = require("./websocket/socket");

// Crear carpeta uploads si no existe
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Importación de Rutas
const authRoutes = require("./routes/authRoutes");
const chatRoutes = require("./routes/chatRoutes");
const messageRoutes = require("./routes/messageRoutes");
const userRoutes = require("./routes/userRoutes");

const app = express();
const server = http.createServer(app);

// Middlewares
app.use(cors());
app.use(express.json());

// Archivos estáticos
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Rutas de la API
app.use("/api/auth", authRoutes);
app.use("/api/chats", chatRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/users", userRoutes);

// Iniciar WebSocket
initSocket(server);

// Inicializar DB básica y arrancar
async function startServer() {
  try {
    // Asegurar que el chat global (ID 1) existe en los tipos
    await db.query("INSERT IGNORE INTO chat_types (id, name) VALUES (3, 'global')");
    // Crear el chat global en sí
    await db.query("INSERT IGNORE INTO chats (id, type_id, name, created_by) VALUES (1, 3, 'Chat Global (Público)', NULL)");
    
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
      console.log(`🚀 Servidor Simplificado corriendo en http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("Error iniciando servidor:", err);
  }
}

startServer();