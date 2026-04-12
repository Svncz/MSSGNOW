const WebSocket = require("ws");
const db = require("../connection");
const messageController = require("../controllers/messageController");

let clients = new Map(); // userId → ws

function initSocket(server) {
  const wss = new WebSocket.Server({ server });

  wss.on("connection", (ws) => {
    console.log("🟢 Cliente conectado (Esperando auth simplificada...)");

    ws.on("message", async (msg) => {
      try {
        const data = JSON.parse(msg);

        switch (data.type) {

          // 🔐 IDENTIFICACIÓN POR WEBSOCKET (Simple sin JWT)
          case "auth":
            if (!data.userId) {
              return ws.send(JSON.stringify({ type: "error", message: "User ID requerido" }));
            }

            const userId = parseInt(data.userId, 10);
            clients.set(userId, ws);
            ws.userId = userId;

            // Actualizar last_seen
            await db.query("UPDATE users SET last_seen = NOW() WHERE id = ?", [userId]);

            ws.send(JSON.stringify({ type: "auth_success", userId }));
            console.log(`🔐 Usuario ${userId} autenticado en WebSocket`);
            break;

          // 📨 ENVIAR MENSAJE (texto, imagen, audio)
          case "send_message":
            if (!ws.userId) return ws.send(JSON.stringify({ type: "error", message: "No autenticado" }));
            
            // data debe tener { chatId, content, msgType (text/image/audio), fileUrl }
            data.senderId = ws.userId;
            data.type = data.msgType || 'text'; // mapear al campo DB
            const message = await messageController.createMessage(data);

            // Enviar a todos los participantes, incluyendo al remitente (para confirmar)
            const users = await messageController.getChatParticipants(data.chatId);

            users.forEach(user => {
              const client = clients.get(user.user_id);
              if (client && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                  type: "receive_message",
                  data: message
                }));
              }
            });
            break;

          // 📥 MENSAJE ENTREGADO
          case "delivered":
            if (!ws.userId) return;
            await messageController.markDelivered(data.messageId, ws.userId);
            break;

          // 👁️ MENSAJE LEÍDO
          case "read":
            if (!ws.userId) return;
            await messageController.markRead(data.messageId, ws.userId);
            break;
            
          default:
            console.warn("Tipo de mensaje no reconocido:", data.type);
        }
      } catch (error) {
        console.error("Error procesando mensaje de WS:", error);
        ws.send(JSON.stringify({ type: "error", message: "Error interno del servidor WS" }));
      }
    });

    ws.on("close", async () => {
      if (ws.userId) {
        clients.delete(ws.userId);
        console.log(`🔴 Usuario ${ws.userId} desconectado`);
        
        try {
          await db.query("UPDATE users SET last_seen = NOW() WHERE id = ?", [ws.userId]);
        } catch (err) {
          console.error("Error al actualizar last_seen:", err);
        }
      } else {
        console.log("🔴 Cliente anónimo desconectado");
      }
    });
  });
}

module.exports = initSocket;