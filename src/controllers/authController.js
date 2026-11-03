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
const crypto = require("node:crypto");
const { Op } = require("sequelize");
const db = require("../models");
const appConfig = require("../config/app.config");
const { permissionsForPosition } = require("../lib/permissions");
const {
  DEPARTMENTS,
  POSITIONS,
  REPORTING_POSITIONS,
} = require("../../shared/organization");

const User = db.User;

// ─── Salt rounds for bcrypt hashing ─────────────────────────────────────────
const SALT_ROUNDS = 12;

const getRegistrationOptions = (req, res) =>
  res.status(200).json({
    success: true,
    data: {
      departments: DEPARTMENTS,
      positions: POSITIONS,
    },
  });

const getReportingOptions = async (req, res) => {
  const { department, position } = req.validatedQuery;
  const allowedPositions = REPORTING_POSITIONS[position];
  const users = allowedPositions.length
    ? await User.findAll({
        where: {
          department,
          position: { [Op.in]: allowedPositions },
          status: "ACTIVE",
          isActive: true,
        },
        attributes: ["id", "name", "position"],
        order: [["name", "ASC"]],
      })
    : [];
  return res.status(200).json({ success: true, data: { users } });
};

// ─── Cookie configuration ───────────────────────────────────────────────────
const COOKIE_OPTIONS = {
    httpOnly: true,
    secure: appConfig.NODE_ENV === "production",
    sameSite: "lax",
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
    const {
      name,
      email,
      password,
      department,
      position,
      reportsToId,
    } = req.body;

    // ── Validate required fields ──────────────────────────────────────────
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide name, email, and password.",
      });
    }

    const configuredManagerEmail = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
    if (position === "MANAGER" && (!configuredManagerEmail || email !== configuredManagerEmail)) {
      return res.status(403).json({
        success: false,
        message: "Manager registration is restricted to the configured SUPER_ADMIN_EMAIL.",
      });
    }

    let reportingManager = null;
    if (position !== "MANAGER") {
      const allowedPositions = REPORTING_POSITIONS[position];
      reportingManager = await User.findOne({
        where: {
          id: reportsToId,
          department,
          position: { [Op.in]: allowedPositions },
          status: "ACTIVE",
          isActive: true,
        },
        attributes: ["id", "reportsToId"],
      });
      if (!reportingManager) {
        return res.status(400).json({
          success: false,
          message: "Choose an active reporting manager in the same department with a higher position.",
        });
      }

      const visited = new Set();
      let ancestor = reportingManager;
      while (ancestor) {
        if (visited.has(Number(ancestor.id))) {
          return res.status(400).json({
            success: false,
            message: "The selected reporting chain contains a cycle.",
          });
        }
        visited.add(Number(ancestor.id));
        ancestor = ancestor.reportsToId
          ? await User.findByPk(ancestor.reportsToId, {
              attributes: ["id", "reportsToId"],
            })
          : null;
      }
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
      role: position === "MANAGER" ? "SUPER_ADMIN" : "EMPLOYEE",
      status: "ACTIVE",
      isActive: true,
      department,
      position,
      reportsToId: reportingManager?.id || null,
      employeeId: `EMP-${crypto.randomBytes(8).toString("hex").toUpperCase()}`,
      joinedAt: new Date(),
    });

    // ── Return user data (exclude password) ───────────────────────────────
    const userData = {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      department: newUser.department,
      position: newUser.position,
      reportsToId: newUser.reportsToId,
      employeeId: newUser.employeeId,
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

    if (user.status !== "ACTIVE") {
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

    const role = await db.Role.findOne({
      where: { name: user.role, isActive: true },
      include: [
        {
          model: db.Permission,
          as: "permissions",
          attributes: ["name"],
          through: { attributes: [] },
        },
      ],
    });
    if (!role) {
      return res.status(403).json({
        success: false,
        message: "This account role is not active.",
      });
    }

    // ── Generate JWT ──────────────────────────────────────────────────────
    const tokenPayload = { sub: String(user.id) };

    const token = jwt.sign(tokenPayload, appConfig.JWT_SECRET, {
      expiresIn: appConfig.JWT_EXPIRES_IN,
    });
    user.lastLoginAt = new Date();
    user.lastActivityAt = new Date();
    await user.save();

    // ── Set JWT in HTTP-Only cookie ───────────────────────────────────────
    res.cookie("token", token, COOKIE_OPTIONS);

    // ── Return user data (exclude password) ───────────────────────────────
    const userData = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department,
      position: user.position,
      reportsToId: user.reportsToId,
      employeeId: user.employeeId,
      isActive: user.isActive,
      joinedAt: user.joinedAt,
      lastActivityAt: user.lastActivityAt,
      permissions: permissionsForPosition(
        user,
        role.permissions.map((permission) => permission.name),
      ),
    };

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      data: { user: userData },
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
      ...COOKIE_OPTIONS,
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
      attributes: [
        "id",
        "name",
        "email",
        "role",
        "department",
        "position",
        "reportsToId",
        "employeeId",
        "isActive",
        "joinedAt",
        "lastActivityAt",
        "createdAt",
      ],
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
      data: { user: { ...user.get({ plain: true }), permissions: req.user.permissions } },
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
  getRegistrationOptions,
  getReportingOptions,
  register,
  login,
  logout,
  getMe,
};
