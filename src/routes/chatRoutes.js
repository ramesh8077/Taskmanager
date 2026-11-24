const express = require("express");
const { verifyToken } = require("../middlewares/authMiddleware");
const controller = require("../controllers/chatController");
const router = express.Router();
router.get("/messages", verifyToken, controller.listMessages);
router.post("/messages", verifyToken, controller.createMessage);
module.exports = router;
