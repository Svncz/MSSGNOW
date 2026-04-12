const express = require("express");
const router = express.Router();
const chatController = require("../controllers/chatController");
const { requireUser } = require("../middleware/simpleAuth");

router.use(requireUser);

router.get("/", chatController.getUserChats);
router.post("/", chatController.createChat);
router.get("/:chatId/messages", chatController.getChatMessages);

module.exports = router;
