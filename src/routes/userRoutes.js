/**
 * User Routes
 * 
 * Admin-only route for user management:
 *   GET /api/users/members   → Get all users with 'Member' role
 */

const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const { verifyToken, isAdmin } = require("../middlewares/authMiddleware");

// ─── Admin-only Route ───────────────────────────────────────────────────────

router.get("/members", verifyToken, userController.getMembers);

module.exports = router;
