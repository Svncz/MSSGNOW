const db = require("../connection");

// 📨 CREAR MENSAJE
async function createMessage(data) {
  const { chatId, senderId, content, type, fileUrl, replyToId } = data;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.query(
      `INSERT INTO messages (chat_id, sender_id, content, type, file_url, reply_to_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [chatId, senderId, content, type, fileUrl, replyToId || null]
    );

    const messageId = result.insertId;

    // Actualizar el timestamp del chat para el reordenamiento de la lista
    await conn.query(
      "UPDATE chats SET last_message_at = NOW() WHERE id = ?",
      [chatId]
    );

    // Opcional: Podríamos aquí registrar explícitamente en message_reads para el remitente (como leído/entregado)
    await conn.query(
      `INSERT INTO message_reads (message_id, user_id, delivered_at, read_at) 
       VALUES (?, ?, NOW(), NOW())`,
      [messageId, senderId]
    );

    await conn.commit();
    return {
      id: messageId,
      chatId,
      senderId,
      content,
      type,
      fileUrl,
      replyToId,
      createdAt: new Date().toISOString()
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// 🌐 ELIMINAR MENSAJE (Global o Local)
async function deleteMessage(req, res) {
  try {
    const userId = req.user.userId;
    const { messageId } = req.params;
    const { deleteForEveryone } = req.body; // boolean

    // Verificar quién envió el mensaje
    const [messages] = await db.query("SELECT sender_id FROM messages WHERE id = ?", [messageId]);
    if (messages.length === 0) {
      return res.status(404).json({ message: "Mensaje no encontrado" });
    }

    const message = messages[0];

    if (deleteForEveryone) {
      // Borrado global: Solo el remitente puede hacerlo
      if (message.sender_id !== userId) {
        return res.status(403).json({ message: "No puedes eliminar este mensaje para todos" });
      }

      await db.query(
        "UPDATE messages SET deleted_at = NOW(), deleted_by = ? WHERE id = ?",
        [userId, messageId]
      );

      res.status(200).json({ message: "Mensaje eliminado para todos", global: true });
    } else {
      // Borrado local: Para mí
      await db.query(
        "INSERT IGNORE INTO message_deletions (message_id, user_id) VALUES (?, ?)",
        [messageId, userId]
      );
      res.status(200).json({ message: "Mensaje eliminado para ti", global: false });
    }

  } catch (error) {
    console.error("Error en deleteMessage:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
}

// 👥 OBTENER PARTICIPANTES DEL CHAT
async function getChatParticipants(chatId) {
  const [rows] = await db.query(
    `SELECT user_id FROM chat_participants WHERE chat_id = ?`,
    [chatId]
  );
  return rows;
}

// 📥 MARCAR COMO ENTREGADO
async function markDelivered(messageId, userId) {
  await db.query(
    `INSERT INTO message_reads (message_id, user_id, delivered_at)
     VALUES (?, ?, NOW())
     ON DUPLICATE KEY UPDATE delivered_at = COALESCE(delivered_at, NOW())`,
    [messageId, userId]
  );
}

// 👁️ MARCAR COMO LEÍDO
async function markRead(messageId, userId) {
  await db.query(
    `INSERT INTO message_reads (message_id, user_id, delivered_at, read_at)
     VALUES (?, ?, NOW(), NOW())
     ON DUPLICATE KEY UPDATE 
     delivered_at = COALESCE(delivered_at, NOW()),
     read_at = COALESCE(read_at, NOW())`,
    [messageId, userId]
  );
}

module.exports = {
  createMessage,
  deleteMessage,
  getChatParticipants,
  markDelivered,
  markRead
};