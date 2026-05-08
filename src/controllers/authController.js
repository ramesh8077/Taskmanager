/**
 * Auth Controller
 * 
 * Handles user authentication:
 *   - register: Creates a new user with hashed password.
 *   - login:    Validates credentials and sets JWT in HTTP-Only cookie.
 *   - logout:   Clears the authentication cookie.
 * 
 * SECURITY:
 *   - Passwords are hashed with bcryptjs (12 salt rounds).
 *   - JWT is stored in an HTTP-Only, Secure cookie — NOT in the JSON response body.
 *   - Password field is excluded from all response payloads.
 */

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../models");
const appConfig = require("../config/app.config");

const User = db.User;

// ─── Salt rounds for bcrypt hashing ─────────────────────────────────────────
const SALT_ROUNDS = 12;

// ─── Cookie configuration ───────────────────────────────────────────────────
const COOKIE_OPTIONS = {
    httpOnly: true,
    secure: true, 
    sameSite: "none", 
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

// ─────────────────────────────────────────────────────────────────────────────
// REGISTER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @desc    Register a new user
 * @route   POST /api/auth/register
 * @access  Public
 */
const register = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    // ── Validate required fields ──────────────────────────────────────────
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide name, email, and password.",
      });
    }

    // ── Check if user already exists ──────────────────────────────────────
    const existingUser = await User.findOne({ where: { email } });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "A user with this email already exists.",
      });
    }

    // ── Hash password ─────────────────────────────────────────────────────
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    // ── Create user ───────────────────────────────────────────────────────
    const newUser = await User.create({
      name,
      email,
      password: hashedPassword,
      role: role || "Member", // Default to 'Member' if not provided
    });

    // ── Return user data (exclude password) ───────────────────────────────
    const userData = {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      createdAt: newUser.createdAt,
    };

    return res.status(201).json({
      success: true,
      message: "User registered successfully.",
      data: { user: userData },
    });
  } catch (error) {
    // Handle Sequelize validation errors gracefully
    if (error.name === "SequelizeValidationError") {
      const messages = error.errors.map((e) => e.message);
      return res.status(400).json({
        success: false,
        message: "Validation failed.",
        errors: messages,
      });
    }

    if (error.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({
        success: false,
        message: "A user with this email already exists.",
      });
    }

    console.error("❌ Register Error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error during registration.",
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @desc    Authenticate user & set JWT cookie
 * @route   POST /api/auth/login
 * @access  Public
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // ── Validate required fields ──────────────────────────────────────────
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide email and password.",
      });
    }

    // ── Find user by email ────────────────────────────────────────────────
    const user = await User.findOne({ where: { email } });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    // ── Verify password ───────────────────────────────────────────────────
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    // ── Generate JWT ──────────────────────────────────────────────────────
    const tokenPayload = {
      id: user.id,
      email: user.email,
      role: user.role,
    };

    const token = jwt.sign(tokenPayload, appConfig.JWT_SECRET, {
      expiresIn: appConfig.JWT_EXPIRES_IN,
    });

    // ── Set JWT in HTTP-Only cookie ───────────────────────────────────────
    res.cookie("token", token, COOKIE_OPTIONS);

    // ── Return user data (exclude password) ───────────────────────────────
    const userData = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      data: { user: userData, token },
    });
  } catch (error) {
    console.error("❌ Login Error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error during login.",
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// LOGOUT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @desc    Clear the auth cookie to log the user out
 * @route   POST /api/auth/logout
 * @access  Public (cookie is cleared regardless)
 */
const logout = async (req, res) => {
  try {
    // Clear the token cookie by setting maxAge to 0
    res.cookie("token", "", {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: 0, // Expire immediately
    });

    return res.status(200).json({
      success: true,
      message: "Logged out successfully.",
    });
  } catch (error) {
    console.error("❌ Logout Error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error during logout.",
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET CURRENT USER (Session Verification)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @desc    Return the currently authenticated user from the JWT cookie
 * @route   GET /api/auth/me
 * @access  Private (requires valid JWT)
 */
const getMe = async (req, res) => {
  try {
    // req.user is set by the verifyToken middleware (contains id, email, role)
    const user = await User.findByPk(req.user.id, {
      attributes: ["id", "name", "email", "role", "createdAt"],
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Authenticated user fetched successfully.",
      data: { user },
    });
  } catch (error) {
    console.error("❌ Get Me Error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error while fetching user profile.",
    });
  }
};

module.exports = {
  register,
  login,
  logout,
  getMe,
};
