/**
 * User Routes
 * 
 * Scoped route for team assignment:
 *   GET /api/users/members   → Get active employees visible to the caller
 */

const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const { verifyToken, requirePermission } = require("../middlewares/authMiddleware");
const { validateRequest } = require("../middlewares/validate");
const { idParams, memberSearchQuery, memberOverviewQuery } = require("../validators/schemas");
const notificationController = require("../controllers/notificationController");

// ─── Admin-only Route ───────────────────────────────────────────────────────

router.get(
  "/team-overview/search",
  verifyToken,
  requirePermission("user:view:any", "user:view:team"),
  validateRequest(memberSearchQuery, "query"),
  userController.searchTeamMembers
);
router.get("/notifications", verifyToken, notificationController.listNotifications);
router.patch(
  "/notifications/:id/read",
  verifyToken,
  validateRequest(idParams, "params"),
  notificationController.markNotificationRead
);
router.get(
  "/:id/overview",
  verifyToken,
  requirePermission("user:view:any", "user:view:team"),
  validateRequest(idParams, "params"),
  validateRequest(memberOverviewQuery, "query"),
  userController.getMemberOverview
);

router.get(
  "/members",
  verifyToken,
  requirePermission("user:view:any", "user:view:team"),
  userController.getMembers
);

module.exports = router;
