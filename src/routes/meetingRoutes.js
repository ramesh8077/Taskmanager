const express = require("express");
const rateLimit = require("express-rate-limit");
const { verifyToken } = require("../middlewares/authMiddleware");
const { validateRequest } = require("../middlewares/validate");
const { createMeetingBody, idParams } = require("../validators/schemas");
const meetingController = require("../controllers/meetingController");

const router = express.Router();

// Room-token issuance is intentionally rate limited per authenticated account.
const joinLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 12,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `user:${req.user.id}`,
  message: {
    success: false,
    message: "Too many join requests. Wait a minute and try again.",
  },
});

router.use(verifyToken);
router.get("/people", meetingController.listInviteablePeople);
router.get("/", meetingController.listMeetings);
router.post("/", validateRequest(createMeetingBody), meetingController.createMeeting);
router.get("/:id", validateRequest(idParams, "params"), meetingController.getMeeting);
router.post(
  "/:id/join",
  joinLimiter,
  validateRequest(idParams, "params"),
  meetingController.joinMeeting,
);
router.post("/:id/leave", validateRequest(idParams, "params"), meetingController.leaveMeeting);
router.post("/:id/end", validateRequest(idParams, "params"), meetingController.endMeeting);
router.post("/:id/cancel", validateRequest(idParams, "params"), meetingController.cancelMeeting);

module.exports = router;
