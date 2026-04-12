const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const messageController = require("../controllers/messageController");
const { requireUser } = require("../middleware/simpleAuth");

// Configuración básica de Multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

router.use(requireUser);

router.delete("/:messageId", messageController.deleteMessage);

// Ruta para subir archivos
router.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No se subió ningún archivo" });
  }
  
  // Asumiendo que el prefijo del public path será "/uploads/"
  const fileUrl = `/uploads/${req.file.filename}`;
  res.status(200).json({ fileUrl });
});

module.exports = router;
