const bcrypt = require("bcrypt");
const db = require("../connection");

// 🆕 REGISTRO DE USUARIO
async function register(req, res) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ message: "Todos los campos son obligatorios" });
    }

    const [existingUsers] = await conn.query(
      "SELECT id FROM users WHERE username = ? OR email = ?",
      [username, email]
    );

    if (existingUsers.length > 0) {
      return res.status(409).json({ message: "El usuario o email ya está en uso" });
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const [result] = await conn.query(
      "INSERT INTO users (username, email, password) VALUES (?, ?, ?)",
      [username, email, hashedPassword]
    );
    const userId = result.insertId;

    // Asignar al chat global automáticamente (Chat ID 1)
    // Usamos INSERT IGNORE por si acaso el chat_participants ya lo tiene
    await conn.query(
      "INSERT IGNORE INTO chat_participants (chat_id, user_id, is_admin) VALUES (1, ?, 0)",
      [userId]
    );

    await conn.commit();
    res.status(201).json({
      message: "Usuario registrado con éxito",
      user: { id: userId, username, email }
    });
  } catch (error) {
    await conn.rollback();
    console.error("Error en register:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  } finally {
    conn.release();
  }
}

// 🔐 LOGIN DE USUARIO (Simple)
async function login(req, res) {
  try {
    const { usernameOrEmail, password } = req.body;

    if (!usernameOrEmail || !password) {
      return res.status(400).json({ message: "Credenciales requeridas" });
    }

    const [users] = await db.query(
      "SELECT * FROM users WHERE username = ? OR email = ?",
      [usernameOrEmail, usernameOrEmail]
    );

    if (users.length === 0) {
      return res.status(401).json({ message: "Credenciales inválidas" });
    }

    const user = users[0];
    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      return res.status(401).json({ message: "Credenciales inválidas" });
    }

    await db.query("UPDATE users SET last_seen = NOW() WHERE id = ?", [user.id]);

    // Asegurar que el usuario está siempre en el Chat Global (idempotente)
    await db.query(
      "INSERT IGNORE INTO chat_participants (chat_id, user_id, is_admin) VALUES (1, ?, 0)",
      [user.id]
    );

    // Retorna usuario sin la contraseña
    res.status(200).json({
      message: "Login exitoso",
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        profilePicUrl: user.profile_pic_url
      }
    });

  } catch (error) {
    console.error("Error en login:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
}

module.exports = {
  register,
  login
};
