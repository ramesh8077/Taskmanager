/**
 * User Routes
 * 
 * Scoped route for team assignment:
 *   GET /api/users/members   → Get active employees visible to the caller
 */

const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const { verifyToken } = require("../middlewares/authMiddleware");
const { validateRequest } = require("../middlewares/validate");
const {
  idParams,
  memberSearchQuery,
  memberOverviewQuery,
  memberUpdateBody,
} = require("../validators/schemas");
const notificationController = require("../controllers/notificationController");

// ─── Admin-only Route ───────────────────────────────────────────────────────

router.get(
  "/team-overview/search",
  verifyToken,
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
  validateRequest(idParams, "params"),
  validateRequest(memberOverviewQuery, "query"),
  userController.getMemberOverview
);

router.get(
  "/directory",
  verifyToken,
  userController.getDirectory
);
router.get(
  "/members",
  verifyToken,
  userController.getMembers
);
router.get(
  "/members/:id",
  verifyToken,
  validateRequest(idParams, "params"),
  userController.getMemberDetail
);
router.patch(
  "/members/:id",
  verifyToken,
  validateRequest(idParams, "params"),
  validateRequest(memberUpdateBody),
  userController.updateMember
);

module.exports = router;
