/**
 * Auth Middleware
 * 
 * Provides two middleware functions for route protection:
 *   - verifyToken:  Extracts JWT from the HTTP-Only cookie, verifies it,
 *                   and attaches the decoded user payload to `req.user`.
 *   - isAdmin:      Checks if the authenticated user has the 'Admin' role.
 * 
 * Usage in routes:
 *   router.get("/protected", verifyToken, someController);
 *   router.post("/admin-only", verifyToken, isAdmin, someController);
 */

const jwt = require("jsonwebtoken");
const appConfig = require("../config/app.config");

// ─────────────────────────────────────────────────────────────────────────────
// VERIFY TOKEN
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @desc    Extracts the JWT from the `token` cookie, verifies it,
 *          and attaches the decoded payload to req.user.
 * @usage   Applied as middleware before any protected route.
 */
const verifyToken = (req, res, next) => {
  try {
    // ── Extract token from cookies or Authorization header ─────────────────
    let token = req.cookies?.token;
    if (!token && req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Access denied. No authentication token provided.",
      });
    }

    // ── Verify and decode the token ─────────────────────────────────────
    const decoded = jwt.verify(token, appConfig.JWT_SECRET);

    // ── Attach user payload to request object ───────────────────────────
    // decoded contains: { id, email, role, iat, exp }
    req.user = decoded;

    next();
  } catch (error) {
    // Handle specific JWT errors
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Authentication token has expired. Please log in again.",
      });
    }

    if (error.name === "JsonWebTokenError") {
      return res.status(403).json({
        success: false,
        message: "Invalid authentication token.",
      });
    }

    console.error("❌ Token Verification Error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error during authentication.",
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// IS ADMIN
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @desc    Checks if the authenticated user has the 'Admin' role.
 *          Must be used AFTER verifyToken middleware.
 * @usage   router.post("/admin-action", verifyToken, isAdmin, controller);
 */
const isAdmin = (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Access denied. User not authenticated.",
      });
    }

    if (req.user.role !== "Admin") {
      return res.status(403).json({
        success: false,
        message: "Forbidden. Admin access required.",
      });
    }

    next();
  } catch (error) {
    console.error("❌ Role Check Error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error during authorization.",
    });
  }
};

module.exports = {
  verifyToken,
  isAdmin,
};
