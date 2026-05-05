/**
 * Auth Routes
 * 
 * Defines authentication-related endpoints:
 *   POST /api/auth/register  → Create a new user account
 *   POST /api/auth/login     → Authenticate and receive JWT cookie
 *   POST /api/auth/logout    → Clear JWT cookie
 *   GET  /api/auth/me        → Get currently authenticated user (session check)
 */

const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const { verifyToken } = require("../middlewares/authMiddleware");

// ─── Public Routes (No authentication required) ─────────────────────────────

router.post("/register", authController.register);
router.post("/login", authController.login);
router.post("/logout", authController.logout);

// ─── Protected Routes ───────────────────────────────────────────────────────

router.get("/me", verifyToken, authController.getMe);

module.exports = router;
