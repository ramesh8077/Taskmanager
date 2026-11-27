const express = require("express");
const multer = require("multer");
const { verifyToken } = require("../middlewares/authMiddleware");
const controller = require("../controllers/chatController");
const {
  MAX_CHAT_FILE_BYTES,
  MAX_CHAT_FILES_PER_MESSAGE,
  resolveAttachmentMeta,
  sanitizeFileName,
} = require("../lib/chatHelpers");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_CHAT_FILE_BYTES,
    files: MAX_CHAT_FILES_PER_MESSAGE,
  },
  fileFilter: (_req, file, callback) => {
    if (!resolveAttachmentMeta(file)) {
      return callback(
        new Error(
          `Unsupported file type for "${sanitizeFileName(file.originalname)}". Allowed formats: images, videos, voice/audio recordings, PDF, Office docs, TXT, CSV, and ZIP.`
        )
      );
    }
    return callback(null, true);
  },
});

const handleChatUpload = (req, res, next) => {
  if (!req.is("multipart/form-data")) return next();
  upload.array("files", MAX_CHAT_FILES_PER_MESSAGE)(req, res, (error) => {
    if (!error) return next();
    const message =
      error.code === "LIMIT_FILE_SIZE"
        ? "Each attachment must be 15 MB or smaller."
        : error.code === "LIMIT_FILE_COUNT"
          ? `You can attach up to ${MAX_CHAT_FILES_PER_MESSAGE} files per message.`
          : error.message || "File upload failed.";
    return res.status(400).json({ success: false, message });
  });
};

router.get("/members", verifyToken, controller.listMentionableMembers);
router.get("/messages", verifyToken, controller.listMessages);
router.get("/messages/status", verifyToken, controller.getMessageStatuses);
router.get("/messages/:id/info", verifyToken, controller.getMessageInfo);
router.delete("/messages/:id", verifyToken, controller.deleteMessage);
router.post("/messages/:id/delete", verifyToken, controller.deleteMessage);
router.post("/messages", verifyToken, handleChatUpload, controller.createMessage);
router.post("/receipts", verifyToken, controller.recordReceipts);
router.get("/attachments/:attachmentId", verifyToken, controller.getAttachment);

module.exports = router;
