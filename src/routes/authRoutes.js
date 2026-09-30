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
const { rateLimit } = require("express-rate-limit");
const { validateRequest } = require("../middlewares/validate");
const { loginBody, registerBody } = require("../validators/schemas");

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    ok: false,
    error: { code: "RATE_LIMITED", message: "Too many login attempts. Try again later." },
  },
});

// ─── Public Routes (No authentication required) ─────────────────────────────

router.post("/register", validateRequest(registerBody), authController.register);
router.post("/login", loginLimiter, validateRequest(loginBody), authController.login);
router.post("/logout", authController.logout);

// ─── Protected Routes ───────────────────────────────────────────────────────

router.get("/me", verifyToken, authController.getMe);

module.exports = router;
