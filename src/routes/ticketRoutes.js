const express = require("express");
const router = express.Router();
const ticketController = require("../controllers/ticketController");
const workflowController = require("../controllers/ticketWorkflowController");
const { verifyToken, requirePermission } = require("../middlewares/authMiddleware");
const { validateRequest } = require("../middlewares/validate");
const multer = require("multer");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { receiveCommentImage } = require("../lib/commentImageUpload");
const {
  attachmentParams,
  commentImageParams,
  ticketStatusBody,
  ticketProgressBody,
  ticketDescriptionBody,
  ticketAssignmentBody,
  ticketDeadlineBody,
  ticketPriorityBody,
  reopenTicketBody,
} = require("../validators/schemas");
const {
  createTicketBody,
  resolveTicketBody,
  createTicketCommentBody,
  idParams,
  ticketQuery,
} = require("../validators/schemas");

const uploadDir = workflowController.attachmentStorage;

// Ensure the upload directory exists


const allowedFiles = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/gif", ".gif"],
  ["image/webp", ".webp"],
  ["application/pdf", ".pdf"],
  ["text/plain", ".txt"],
]);
// const upload = multer({
//   storage: multer.diskStorage({
//     destination: uploadDir,
//     filename: (_req, file, callback) => callback(null, `${randomUUID()}${allowedFiles.get(file.mimetype) || ""}`),
//   }),
//   limits: { fileSize: 8 * 1024 * 1024, files: 1 },
//   fileFilter: (_req, file, callback) => {
//     if (!allowedFiles.has(file.mimetype)) {
//       return callback(new Error("Unsupported file type. Upload a JPG, PNG, GIF, WebP, PDF, or plain text file."));
//     }
//     return callback(null, true);
//   },
// });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => {
      fs.mkdir(uploadDir, { recursive: true }, (error) => {
        callback(error, uploadDir);
      });
    },
    filename: (_req, file, callback) => {
      callback(
        null,
        `${randomUUID()}${allowedFiles.get(file.mimetype) || ""}`
      );
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!allowedFiles.has(file.mimetype)) {
      return callback(
        new Error("Unsupported file type. Upload a JPG, PNG, GIF, WebP, PDF, or plain text file.")
      );
    }
    return callback(null, true);
  },
});

const handleUpload = (req, res, next) => {
  upload.single("file")(req, res, (error) => {
    if (!error) return next();
    const message = error.code === "LIMIT_FILE_SIZE"
      ? "Attachments must be 8 MB or smaller."
      : error.message;
    return res.status(400).json({ success: false, message });
  });
};

// All ticket routes require authentication
router.use(verifyToken);

router.post(
  "/",
  requirePermission("ticket:create"),
  validateRequest(createTicketBody),
  ticketController.createTicket
);
router.get(
  "/",
  validateRequest(ticketQuery, "query"),
  workflowController.getTickets
);
router.get(
  "/:id",
  validateRequest(idParams, "params"),
  workflowController.getTicketDetails
);
router.put(
  "/:id/assignee",
  validateRequest(idParams, "params"),
  validateRequest(ticketAssignmentBody),
  workflowController.assignTicket
);
router.put(
  "/:id/priority",
  validateRequest(idParams, "params"),
  validateRequest(ticketPriorityBody),
  workflowController.updatePriority
);
router.put(
  "/:id/progress",
  validateRequest(idParams, "params"),
  validateRequest(ticketProgressBody),
  workflowController.updateTicketProgress
);
router.put(
  "/:id/description",
  validateRequest(idParams, "params"),
  validateRequest(ticketDescriptionBody),
  workflowController.updateTicketDescription
);
router.put(
  "/:id/status",
  validateRequest(idParams, "params"),
  validateRequest(ticketStatusBody),
  workflowController.updateTicketStatus
);
router.put(
  "/:id/reopen",
  validateRequest(idParams, "params"),
  validateRequest(reopenTicketBody),
  workflowController.reopenTicket
);
router.put(
  "/:id/deadline",
  validateRequest(idParams, "params"),
  validateRequest(ticketDeadlineBody),
  workflowController.updateDeadline
);
router.post(
  "/:id/attachments",
  validateRequest(idParams, "params"),
  handleUpload,
  workflowController.uploadAttachment
);
router.get(
  "/:id/attachments/:attachmentId",
  validateRequest(attachmentParams, "params"),
  workflowController.downloadAttachment
);
router.put(
  "/:id/resolve",
  validateRequest(idParams, "params"),
  validateRequest(resolveTicketBody),
  workflowController.resolveLegacyTicket
);
router.post(
  "/:id/comments",
  validateRequest(idParams, "params"),
  receiveCommentImage,
  validateRequest(createTicketCommentBody),
  workflowController.addComment
);
router.get(
  "/:id/comments/:commentId/image",
  validateRequest(commentImageParams, "params"),
  workflowController.getTicketCommentImage
);

module.exports = router;
