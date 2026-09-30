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
const {
  attachmentParams,
  ticketStatusBody,
  ticketAssignmentBody,
  ticketDeadlineBody,
  reopenTicketBody,
} = require("../validators/schemas");
const {
  createTicketBody,
  resolveTicketBody,
  createTicketCommentBody,
  idParams,
  ticketQuery,
} = require("../validators/schemas");

const uploadDirectory = workflowController.attachmentStorage;
fs.mkdirSync(uploadDirectory, { recursive: true });
const allowedFiles = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/gif", ".gif"],
  ["image/webp", ".webp"],
  ["application/pdf", ".pdf"],
  ["text/plain", ".txt"],
]);
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDirectory,
    filename: (_req, file, callback) => callback(null, `${randomUUID()}${allowedFiles.get(file.mimetype) || ""}`),
  }),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!allowedFiles.has(file.mimetype)) {
      return callback(new Error("Unsupported file type. Upload a JPG, PNG, GIF, WebP, PDF, or plain text file."));
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
  requirePermission("ticket:view:any", "ticket:view:own"),
  validateRequest(ticketQuery, "query"),
  workflowController.getTickets
);
router.get(
  "/:id",
  requirePermission("ticket:view:any", "ticket:view:own"),
  validateRequest(idParams, "params"),
  workflowController.getTicketDetails
);
router.put(
  "/:id/assignee",
  requirePermission("ticket:assign"),
  validateRequest(idParams, "params"),
  validateRequest(ticketAssignmentBody),
  workflowController.assignTicket
);
router.put(
  "/:id/status",
  requirePermission("ticket:update:any", "ticket:update:own", "ticket:view:own"),
  validateRequest(idParams, "params"),
  validateRequest(ticketStatusBody),
  workflowController.updateTicketStatus
);
router.put(
  "/:id/reopen",
  requirePermission("ticket:update:any", "ticket:update:own", "ticket:view:own"),
  validateRequest(idParams, "params"),
  validateRequest(reopenTicketBody),
  workflowController.reopenTicket
);
router.put(
  "/:id/deadline",
  requirePermission("ticket:assign"),
  validateRequest(idParams, "params"),
  validateRequest(ticketDeadlineBody),
  workflowController.updateDeadline
);
router.post(
  "/:id/attachments",
  requirePermission("ticket:comment:create:own", "ticket:view:any"),
  validateRequest(idParams, "params"),
  handleUpload,
  workflowController.uploadAttachment
);
router.get(
  "/:id/attachments/:attachmentId",
  requirePermission("ticket:view:any", "ticket:view:own"),
  validateRequest(attachmentParams, "params"),
  workflowController.downloadAttachment
);
router.put(
  "/:id/resolve",
  requirePermission("ticket:update:any", "ticket:update:own"),
  validateRequest(idParams, "params"),
  validateRequest(resolveTicketBody),
  workflowController.resolveLegacyTicket
);
router.post(
  "/:id/comments",
  requirePermission("ticket:comment:create:own", "ticket:view:any"),
  validateRequest(idParams, "params"),
  validateRequest(createTicketCommentBody),
  workflowController.addComment
);

module.exports = router;
