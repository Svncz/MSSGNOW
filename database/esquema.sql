-- ========================
-- USERS
-- ========================
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  email VARCHAR(100) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  profile_pic_url VARCHAR(500),
  last_seen TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================
-- CHAT TYPES (CATÁLOGO)
-- ========================
CREATE TABLE chat_types (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(20) NOT NULL UNIQUE
);

INSERT INTO chat_types (name) VALUES 
('private'),
('group'),
('global');

-- ========================
-- CHATS
-- ========================
CREATE TABLE chats (
  id INT AUTO_INCREMENT PRIMARY KEY,
  type_id INT NOT NULL,
  name VARCHAR(100),
  avatar_url VARCHAR(500),
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (type_id) REFERENCES chat_types(id),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- ========================
-- PARTICIPANTES
-- ========================
CREATE TABLE chat_participants (
  id INT AUTO_INCREMENT PRIMARY KEY,
  chat_id INT NOT NULL,
  user_id INT NOT NULL,
  is_admin BOOLEAN DEFAULT FALSE,
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(chat_id, user_id)
);

-- ========================
-- MENSAJES
-- ========================
CREATE TABLE messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  chat_id INT NOT NULL,
  sender_id INT NOT NULL,
  content TEXT,
  type ENUM('text', 'image', 'audio') DEFAULT 'text',
  file_url VARCHAR(500),
  reply_to_id INT NULL,

  -- Eliminación global mejorada
  deleted_at TIMESTAMP NULL,
  deleted_by INT NULL,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT chk_content CHECK (
    (type = 'text' AND content IS NOT NULL) OR type != 'text'
  ),

  FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (reply_to_id) REFERENCES messages(id) ON DELETE SET NULL,
  FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL
);

-- ========================
-- MENSAJES ELIMINADOS (para mí)
-- ========================
CREATE TABLE message_deletions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  message_id INT NOT NULL,
  user_id INT NOT NULL,
  deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(message_id, user_id)
);

-- ========================
-- ESTADO GLOBAL DEL MENSAJE
-- ========================
CREATE TABLE message_status (
  id INT AUTO_INCREMENT PRIMARY KEY,
  message_id INT NOT NULL UNIQUE,

  -- Mejor que ENUM
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  failed_at TIMESTAMP NULL,

  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
);

-- ========================
-- LECTURAS POR USUARIO (MEJORADO)
-- ========================
CREATE TABLE message_reads (
  id INT AUTO_INCREMENT PRIMARY KEY,
  message_id INT NOT NULL,
  user_id INT NOT NULL,

  delivered_at TIMESTAMP NULL,
  read_at TIMESTAMP NULL,

  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,

  UNIQUE(message_id, user_id)
);

-- ========================
-- ÍNDICES (RENDIMIENTO 🚀)
-- ========================
CREATE INDEX idx_messages_chat ON messages(chat_id);
CREATE INDEX idx_messages_sender ON messages(sender_id);

CREATE INDEX idx_reads_message ON message_reads(message_id);
CREATE INDEX idx_reads_user ON message_reads(user_id);

CREATE INDEX idx_participants_chat ON chat_participants(chat_id);
CREATE INDEX idx_participants_user ON chat_participants(user_id);


-- ========================
-- DATOS INICIALES
-- ========================

-- Insertar tipos de chat si no existen
INSERT IGNORE INTO chat_types (id, name) VALUES (1, 'private');
INSERT IGNORE INTO chat_types (id, name) VALUES (2, 'group');
INSERT IGNORE INTO chat_types (id, name) VALUES (3, 'global');

-- Crear el Chat Global único (ID = 1, fijo para que todos sean asignados aquí)
INSERT IGNORE INTO chats (id, type_id, name, created_by) VALUES (1, 3, 'Chat Global 🌎', NULL);
