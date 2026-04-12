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

// Archivos estáticos del backend (uploads)
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ✅ Servir el Frontend desde el mismo servidor
// Accede en: http://localhost:3000 (desde Ubuntu) o http://IP_VM:3000 (desde Windows si hay red)
app.use(express.static(path.join(__dirname, "../frontend")));

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
    // Verificar conexión a la DB
    await db.query("SELECT 1");
    console.log("✅ Conectado a MySQL correctamente");

    // Asegurar que el tipo 'global' existe (por nombre, no por ID fijo)
    await db.query("INSERT IGNORE INTO chat_types (name) VALUES ('private'), ('group'), ('global')");

    // Buscar el type_id de 'global'
    const [types] = await db.query("SELECT id FROM chat_types WHERE name = 'global'");
    if (types.length > 0) {
      const globalTypeId = types[0].id;
      // Crear el Chat Global si no existe (usa el type_id real)
      await db.query(
        "INSERT IGNORE INTO chats (id, type_id, name, created_by) VALUES (1, ?, 'Chat Global 🌎', NULL)",
        [globalTypeId]
      );

      // Agregar TODOS los usuarios existentes al Chat Global (por si se registraron antes)
      await db.query(
        "INSERT IGNORE INTO chat_participants (chat_id, user_id, is_admin) SELECT 1, id, 0 FROM users"
      );

      console.log("✅ Chat Global verificado (ID=1)");
    }

    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
      console.log(`🚀 MSSGNOW corriendo en http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("❌ Error iniciando servidor:", err.message);
    console.error("→ Verifica que MySQL está corriendo y que el .env tiene los datos correctos");
    process.exit(1);
  }
}

startServer();