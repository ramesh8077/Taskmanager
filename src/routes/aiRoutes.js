const express = require("express");
const rateLimit = require("express-rate-limit");
const multer = require("multer");
const { verifyToken } = require("../middlewares/authMiddleware");
const { validateRequest } = require("../middlewares/validate");
const { aiAssistantBody } = require("../validators/schemas");
const aiAssistantController = require("../controllers/aiAssistantController");

const router = express.Router();

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `user:${req.user.id}`,
  message: {
    success: false,
    message: "Too many AI requests. Please wait a minute and try again.",
  },
});

const allowedVoiceTypes = new Set([
  "audio/flac",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
]);

const uploadVoice = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const baseMime = String(file.mimetype || "").split(";")[0].trim().toLowerCase();
    if (!allowedVoiceTypes.has(baseMime)) {
      return callback(new Error("Unsupported voice audio format."));
    }
    return callback(null, true);
  },
});

const handleVoiceUpload = (req, res, next) => {
  uploadVoice.single("audio")(req, res, (error) => {
    if (!error) return next();
    const message = error.code === "LIMIT_FILE_SIZE"
      ? "Voice recording must be 10 MB or smaller."
      : error.message;
    return res.status(400).json({ success: false, message });
  });
};

router.use(verifyToken);
router.post("/chat", aiLimiter, validateRequest(aiAssistantBody), aiAssistantController.chatWithAssistant);
router.post("/transcribe", aiLimiter, handleVoiceUpload, aiAssistantController.transcribeVoice);

module.exports = router;
