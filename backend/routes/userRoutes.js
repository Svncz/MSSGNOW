const express = require("express");
const router = express.Router();
const db = require("../connection");
const { requireUser } = require("../middleware/simpleAuth");

router.use(requireUser);

router.get("/search", async (req, res) => {
  try {
    const query = req.query.q;
    if (!query) return res.json([]);

    const [users] = await db.query(
      "SELECT id, username, profile_pic_url FROM users WHERE username LIKE ? LIMIT 10",
      [`%${query}%`]
    );

    res.json(users);
  } catch (error) {
    console.error("Error buscando usuarios:", error);
    res.status(500).json({ message: "Error del servidor" });
  }
});

module.exports = router;
