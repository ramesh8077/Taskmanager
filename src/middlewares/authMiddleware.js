const jwt = require("jsonwebtoken");
const appConfig = require("../config/app.config");
const db = require("../models");
const { can, normalizedRole } = require("../lib/rbac");

const verifyToken = async (req, res, next) => {
  const token =
    req.cookies?.token ||
    (req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice("Bearer ".length)
      : null);

  if (!token) {
    return res.status(401).json({
      ok: false,
      error: { code: "UNAUTHENTICATED", message: "Authentication is required." },
      success: false,
      message: "Authentication is required.",
    });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, appConfig.JWT_SECRET);
  } catch (error) {
    const expired = error.name === "TokenExpiredError";
    return res.status(expired ? 401 : 403).json({
      ok: false,
      error: {
        code: expired ? "TOKEN_EXPIRED" : "INVALID_TOKEN",
        message: expired ? "Your session has expired." : "Invalid authentication token.",
      },
      success: false,
      message: expired ? "Your session has expired." : "Invalid authentication token.",
    });
  }

  try {
    const payload = typeof decoded === "object" && decoded !== null ? decoded : {};
    const userId = Number(payload.sub ?? payload.id);
    if (!Number.isSafeInteger(userId) || userId < 1) {
      return res.status(403).json({
        ok: false,
        error: { code: "INVALID_TOKEN", message: "Invalid authentication token." },
        success: false,
        message: "Invalid authentication token.",
      });
    }

    const user = await db.User.findByPk(userId, {
      attributes: ["id", "name", "email", "role", "status", "createdById"],
    });
    if (!user || user.status !== "ACTIVE") {
      return res.status(401).json({
        ok: false,
        error: { code: "INACTIVE_ACCOUNT", message: "This account is unavailable." },
        success: false,
        message: "This account is unavailable.",
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
        ok: false,
        error: { code: "ROLE_DISABLED", message: "This account role is not active." },
        success: false,
        message: "This account role is not active.",
      });
    }

    req.user = {
      ...user.get({ plain: true }),
      role: normalizedRole(user.role),
      permissions: role.permissions.map((permission) => permission.name),
    };
    return next();
  } catch (error) {
    console.error("Authentication lookup failed:", error);
    return res.status(500).json({
      ok: false,
      error: { code: "AUTHENTICATION_ERROR", message: "Unable to verify the session." },
      success: false,
      message: "Unable to verify the session.",
    });
  }
};

function requirePermission(...permissions) {
  if (permissions.length === 0) {
    throw new Error("requirePermission needs at least one permission.");
  }
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        ok: false,
        error: { code: "UNAUTHENTICATED", message: "Authentication is required." },
        success: false,
        message: "Authentication is required.",
      });
    }
    if (!permissions.some((permission) => can(req.user, permission))) {
      return res.status(403).json({
        ok: false,
        error: { code: "FORBIDDEN", message: "You do not have permission to perform this action." },
        success: false,
        message: "You do not have permission to perform this action.",
      });
    }
    return next();
  };
}

module.exports = {
  verifyToken,
  requirePermission,
};
