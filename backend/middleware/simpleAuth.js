function requireUser(req, res, next) {
  const userId = req.headers["user-id"];

  if (!userId) {
    return res.status(401).json({ message: "No autenticado (Falta user-id)" });
  }

  // Lo inyectamos en req.user para que los controllers no cambien mucho
  req.user = { userId: parseInt(userId, 10) };
  next();
}

module.exports = { requireUser };
