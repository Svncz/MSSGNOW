const db = require("../connection");

// 📂 OBTENER CHATS DEL USUARIO (Listado principal)
async function getUserChats(req, res) {
  try {
    const userId = req.user.userId;

    // Obtiene los chats donde el usuario es participante
    const [chats] = await db.query(
      `SELECT c.id, c.type_id, c.name, c.avatar_url, c.created_at, c.last_message_at, ct.name as type_name
       FROM chats c
       JOIN chat_participants cp ON c.id = cp.chat_id
       JOIN chat_types ct ON c.type_id = ct.id
       WHERE cp.user_id = ?
       ORDER BY c.last_message_at DESC`,
      [userId]
    );

    // Para chats privados, podríamos querer enviar el nombre/avatar del OTRO usuario
    for (let chat of chats) {
      if (chat.type_name === 'private') {
        const [otherUser] = await db.query(
          `SELECT u.id, u.username, u.profile_pic_url, u.last_seen
           FROM chat_participants cp
           JOIN users u ON cp.user_id = u.id
           WHERE cp.id IN (
             SELECT id FROM chat_participants WHERE chat_id = ? AND user_id != ?
           )`,
          [chat.id, userId]
        );
        if (otherUser.length > 0) {
          chat.other_user_id = otherUser[0].id;
          chat.name = otherUser[0].username; // Reemplazamos nombre genérico por el del usuario
          chat.avatar_url = otherUser[0].profile_pic_url;
          chat.other_user_last_seen = otherUser[0].last_seen;
        }
      }
    }

    res.status(200).json(chats);
  } catch (error) {
    console.error("Error en getUserChats:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
}

// ➕ CREAR UN NUEVO CHAT (Privado o Grupo)
async function createChat(req, res) {
  try {
    const userId = req.user.userId;
    const { typeName, name, participants } = req.body; 
    // typeName: 'private' o 'group'
    // participants: array de IDs de usuario
    
    if (!typeName || !participants || !participants.length) {
      return res.status(400).json({ message: "Faltan datos obligatorios (typeName, participants)" });
    }

    // Obtener ID del tipo de chat
    const [types] = await db.query("SELECT id FROM chat_types WHERE name = ?", [typeName]);
    if (types.length === 0) {
      return res.status(400).json({ message: "Tipo de chat inválido" });
    }
    const typeId = types[0].id;

    // Validación extra para chat privado: Verificar si ya existe el chat entre ambos
    if (typeName === 'private' && participants.length === 1) {
      const targetUserId = participants[0];
      const [existingChat] = await db.query(
        `SELECT c.id 
         FROM chats c
         JOIN chat_participants cp1 ON c.id = cp1.chat_id
         JOIN chat_participants cp2 ON c.id = cp2.chat_id
         WHERE c.type_id = ? AND cp1.user_id = ? AND cp2.user_id = ?`,
        [typeId, userId, targetUserId]
      );

      if (existingChat.length > 0) {
        return res.status(200).json({ message: "El chat privado ya existe", chatId: existingChat[0].id });
      }
    }

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      // 1. Crear el registro general del chat
      const [chatResult] = await conn.query(
        "INSERT INTO chats (type_id, name, created_by) VALUES (?, ?, ?)",
        [typeId, name || null, userId]
      );
      const chatId = chatResult.insertId;

      // 2. Agregar al creador como participante (y admin si es grupo)
      await conn.query(
        "INSERT INTO chat_participants (chat_id, user_id, is_admin) VALUES (?, ?, ?)",
        [chatId, userId, typeName === 'group' ? true : false]
      );

      // 3. Agregar a los demás participantes
      for (const participantId of participants) {
        if (participantId !== userId) {
          await conn.query(
            "INSERT INTO chat_participants (chat_id, user_id, is_admin) VALUES (?, ?, false)",
            [chatId, participantId]
          );
        }
      }

      await conn.commit();
      res.status(201).json({ message: "Chat creado exitosamente", chatId });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

  } catch (error) {
    console.error("Error en createChat:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
}

// 📄 OBTENER HISTORIAL DE MENSAJES DE UN CHAT
async function getChatMessages(req, res) {
  try {
    const userId = req.user.userId;
    const { chatId } = req.params;

    // Verificar si el usuario pertenece al chat
    const [membership] = await db.query(
      "SELECT id FROM chat_participants WHERE chat_id = ? AND user_id = ?",
      [chatId, userId]
    );

    if (membership.length === 0) {
      return res.status(403).json({ message: "No tienes acceso a este chat" });
    }

    // Obtener mensajes - LEFT JOIN para no fallar si falta algún registro en message_status
    const [messages] = await db.query(
      `SELECT m.id, m.chat_id, m.sender_id, m.content, m.type, m.file_url, m.reply_to_id,
              m.created_at, m.deleted_at, m.deleted_by, u.username as sender_name,
              (SELECT CASE 
                        WHEN COUNT(mr.read_at) > 0 THEN 'read'
                        WHEN COUNT(mr.delivered_at) > 0 THEN 'delivered'
                        ELSE 'sent'
                      END
               FROM message_reads mr
               WHERE mr.message_id = m.id AND mr.user_id != m.sender_id
              ) as status
       FROM messages m
       JOIN users u ON m.sender_id = u.id
       LEFT JOIN message_deletions md ON m.id = md.message_id AND md.user_id = ?
       WHERE m.chat_id = ? AND md.id IS NULL
       ORDER BY m.created_at ASC`,
      [userId, chatId]
    );

    // Ocultar contenido si fue borrado globalmente
    const sanitizedMessages = messages.map(msg => {
      if (msg.deleted_by !== null) {
        return {
          ...msg,
          content: "Este mensaje fue eliminado",
          file_url: null,
          isDeletedGlobal: true
        };
      }
      return msg;
    });

    res.status(200).json(sanitizedMessages);
  } catch (error) {
    console.error("Error en getChatMessages:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
}

module.exports = {
  getUserChats,
  createChat,
  getChatMessages
};
