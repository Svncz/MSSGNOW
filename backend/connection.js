const mysql = require("mysql2");
require("dotenv").config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "chatuser",
  password: process.env.DB_PASS || "12345678",
  database: process.env.DB_NAME || "chat_app",
  waitForConnections: true,
  connectionLimit: 10
});

module.exports = pool.promise();