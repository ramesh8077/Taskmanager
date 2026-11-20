const express = require("express");
const rateLimit = require("express-rate-limit");
const multer = require("multer");
const { verifyToken } = require("../middlewares/authMiddleware");
const { validateRequest } = require("../middlewares/validate");
const { createMeetingBody, idParams, inviteMeetingParticipantsBody, meetingMinutesBody } = require("../validators/schemas");
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

const allowedAudioTypes = new Set([
  "audio/flac",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
]);
const uploadMeetingAudio = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!allowedAudioTypes.has(file.mimetype)) {
      return callback(new Error("Upload an MP3, MP4/M4A, WAV, OGG, FLAC, or WebM audio recording."));
    }
    return callback(null, true);
  },
});
const handleMeetingAudio = (req, res, next) => {
  uploadMeetingAudio.single("audio")(req, res, (error) => {
    if (!error) return next();
    const message = error.code === "LIMIT_FILE_SIZE"
      ? "Meeting recordings must be 25 MB or smaller."
      : error.message;
    return res.status(400).json({ success: false, message });
  });
};

// LiveKit authenticates its webhook with a signed Authorization header.
router.post("/livekit/webhook", meetingController.liveKitWebhook);
router.use(verifyToken);
router.get("/people", meetingController.listInviteablePeople);
router.get("/", meetingController.listMeetings);
router.post("/", validateRequest(createMeetingBody), meetingController.createMeeting);
router.get("/:id", validateRequest(idParams, "params"), meetingController.getMeeting);
router.post(
  "/:id/invite",
  validateRequest(idParams, "params"),
  validateRequest(inviteMeetingParticipantsBody),
  meetingController.inviteMeetingParticipants,
);
router.post(
  "/:id/minutes",
  validateRequest(idParams, "params"),
  handleMeetingAudio,
  validateRequest(meetingMinutesBody),
  meetingController.generateMeetingMinutes,
);
router.post(
  "/:id/join",
  joinLimiter,
  validateRequest(idParams, "params"),
  meetingController.joinMeeting,
);
router.post("/:id/attend", validateRequest(idParams, "params"), meetingController.confirmMeetingAttendance);
router.post("/:id/leave", validateRequest(idParams, "params"), meetingController.leaveMeeting);
router.post("/:id/end", validateRequest(idParams, "params"), meetingController.endMeeting);
router.post("/:id/cancel", validateRequest(idParams, "params"), meetingController.cancelMeeting);

module.exports = router;
