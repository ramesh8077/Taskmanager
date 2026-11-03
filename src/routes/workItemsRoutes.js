const express = require("express");
const router = express.Router();
const { listWorkItems } = require("../controllers/workItemsController");
const { verifyToken } = require("../middlewares/authMiddleware");
const { validateRequest } = require("../middlewares/validate");
const { workItemListQuery } = require("../validators/schemas");
const { can } = require("../lib/rbac");

function requireViewPermission(req, res, next) {
  const permission = req.validatedQuery.view === "tasks" ? "task:view:own" : "ticket:view:own";
  if (!can(req.user, permission)) {
    return res.status(403).json({
      ok: false,
      error: { code: "FORBIDDEN", message: "You do not have permission to view these items." },
      success: false,
      message: "You do not have permission to view these items.",
    });
  }
  return next();
}

router.get(
  "/",
  verifyToken,
  validateRequest(workItemListQuery, "query"),
  requireViewPermission,
  listWorkItems,
);

module.exports = router;
