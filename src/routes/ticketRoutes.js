const express = require("express");
const router = express.Router();
const ticketController = require("../controllers/ticketController");
const { verifyToken, isAdmin } = require("../middlewares/authMiddleware");

// All ticket routes require authentication
router.use(verifyToken);

router.post("/", ticketController.createTicket);
router.get("/", ticketController.getTickets);
router.put("/:id/resolve", ticketController.resolveTicket);
router.post("/:id/comments", ticketController.addComment);

module.exports = router;
