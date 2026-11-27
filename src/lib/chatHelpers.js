const path = require("node:path");
const db = require("../models");

const MAX_CHAT_FILE_BYTES = 15 * 1024 * 1024;
const MAX_CHAT_FILES_PER_MESSAGE = 5;

const MIME_CATEGORY_MAP = new Map([
  ["image/jpeg", "image"],
  ["image/jpg", "image"],
  ["image/png", "image"],
  ["image/gif", "image"],
  ["image/webp", "image"],
  ["video/mp4", "video"],
  ["video/webm", "video"],
  ["video/quicktime", "video"],
  ["video/x-matroska", "video"],
  ["audio/webm", "audio"],
  ["audio/ogg", "audio"],
  ["audio/mp4", "audio"],
  ["audio/mpeg", "audio"],
  ["audio/mp3", "audio"],
  ["audio/wav", "audio"],
  ["audio/wave", "audio"],
  ["audio/x-wav", "audio"],
  ["audio/x-m4a", "audio"],
  ["audio/aac", "audio"],
  ["application/pdf", "document"],
  ["text/plain", "document"],
  ["text/csv", "document"],
  ["application/msword", "document"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "document"],
  ["application/vnd.ms-excel", "document"],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "document"],
  ["application/vnd.ms-powerpoint", "document"],
  ["application/vnd.openxmlformats-officedocument.presentationml.presentation", "document"],
  ["application/zip", "document"],
  ["application/x-zip-compressed", "document"],
]);

const EXT_CATEGORY_FALLBACK = new Map([
  [".jpg", { category: "image", mime: "image/jpeg" }],
  [".jpeg", { category: "image", mime: "image/jpeg" }],
  [".png", { category: "image", mime: "image/png" }],
  [".gif", { category: "image", mime: "image/gif" }],
  [".webp", { category: "image", mime: "image/webp" }],
  [".mp4", { category: "video", mime: "video/mp4" }],
  [".webm", { category: "video", mime: "video/webm" }],
  [".mov", { category: "video", mime: "video/quicktime" }],
  [".mkv", { category: "video", mime: "video/x-matroska" }],
  [".mp3", { category: "audio", mime: "audio/mpeg" }],
  [".ogg", { category: "audio", mime: "audio/ogg" }],
  [".wav", { category: "audio", mime: "audio/wav" }],
  [".m4a", { category: "audio", mime: "audio/mp4" }],
  [".aac", { category: "audio", mime: "audio/aac" }],
  [".pdf", { category: "document", mime: "application/pdf" }],
  [".txt", { category: "document", mime: "text/plain" }],
  [".csv", { category: "document", mime: "text/csv" }],
  [".doc", { category: "document", mime: "application/msword" }],
  [".docx", { category: "document", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }],
  [".xls", { category: "document", mime: "application/vnd.ms-excel" }],
  [".xlsx", { category: "document", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }],
  [".ppt", { category: "document", mime: "application/vnd.ms-powerpoint" }],
  [".pptx", { category: "document", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation" }],
  [".zip", { category: "document", mime: "application/zip" }],
]);

function normalizeMimeType(rawMime) {
  return String(rawMime || "").split(";")[0].trim().toLowerCase();
}

function resolveAttachmentMeta(file) {
  const normalizedMime = normalizeMimeType(file?.mimetype);
  const mappedCategory = MIME_CATEGORY_MAP.get(normalizedMime);
  if (mappedCategory) {
    return { category: mappedCategory, mimeType: normalizedMime };
  }
  const ext = path.extname(String(file?.originalname || "")).toLowerCase();
  const fallback = EXT_CATEGORY_FALLBACK.get(ext);
  if (fallback && (!normalizedMime || normalizedMime === "application/octet-stream")) {
    return { category: fallback.category, mimeType: fallback.mime };
  }
  return null;
}

function sanitizeFileName(rawName) {
  const base = path.basename(String(rawName || "attachment").replace(/[\\/]/g, path.sep));
  const cleaned = base.replace(/[\r\n"]/g, "_").trim();
  return (cleaned || "attachment").slice(0, 255);
}

function computeTickState({ deliveredCount, seenCount, totalRecipients }) {
  if (totalRecipients <= 0) return "sent";
  if (seenCount >= totalRecipients || (seenCount > 0 && seenCount >= deliveredCount)) {
    return "seen";
  }
  if (deliveredCount > 0) return "delivered";
  return "sent";
}

function buildReceiptSummary(senderId, receipts = [], activeUserCount = 0) {
  const totalRecipients = Math.max(0, Number(activeUserCount || 0) - 1);
  const byUser = new Map();
  for (const entry of receipts || []) {
    const uid = Number(entry.userId);
    if (!uid || uid === Number(senderId)) continue;
    byUser.set(uid, entry);
  }
  let deliveredCount = 0;
  let seenCount = 0;
  for (const entry of byUser.values()) {
    if (entry.deliveredAt || entry.seenAt) deliveredCount += 1;
    if (entry.seenAt) seenCount += 1;
  }
  return {
    totalRecipients,
    deliveredCount,
    seenCount,
    tickState: computeTickState({ deliveredCount, seenCount, totalRecipients }),
  };
}

const ATTACHMENT_PUBLIC_ATTRIBUTES = [
  "id",
  "messageId",
  "uploadedBy",
  "category",
  "fileName",
  "mimeType",
  "fileSize",
  "durationSeconds",
  "createdAt",
];

function getChatMessageInclude() {
  return [
    { model: db.User, as: "author", attributes: ["id", "name", "role"] },
    {
      model: db.ChatAttachment,
      as: "attachments",
      attributes: ATTACHMENT_PUBLIC_ATTRIBUTES,
      separate: true,
      order: [["id", "ASC"]],
    },
    {
      model: db.ChatMessage,
      as: "replyTo",
      attributes: ["id", "userId", "message", "messageType", "deletedForEveryoneAt", "createdAt"],
      include: [
        { model: db.User, as: "author", attributes: ["id", "name"] },
        {
          model: db.ChatAttachment,
          as: "attachments",
          attributes: ["id", "category", "fileName", "mimeType"],
        },
      ],
    },
    {
      model: db.ChatMessageReceipt,
      as: "receipts",
      attributes: ["userId", "deliveredAt", "seenAt"],
      separate: true,
    },
  ];
}

function formatChatMessage(row, activeUserCount) {
  const plain = typeof row.get === "function" ? row.get({ plain: true }) : { ...row };
  const receipts = Array.isArray(plain.receipts) ? plain.receipts : [];
  const receiptSummary = buildReceiptSummary(plain.userId, receipts, activeUserCount);
  delete plain.receipts;

  const isDeletedForEveryone = Boolean(plain.deletedForEveryoneAt) || plain.messageType === "deleted";
  const attachments = isDeletedForEveryone
    ? []
    : Array.isArray(plain.attachments)
      ? plain.attachments.slice().sort((a, b) => Number(a.id) - Number(b.id))
      : [];

  let replyTo = null;
  if (plain.replyTo && plain.replyTo.id) {
    const replyDeleted = Boolean(plain.replyTo.deletedForEveryoneAt) || plain.replyTo.messageType === "deleted";
    replyTo = {
      id: plain.replyTo.id,
      userId: plain.replyTo.userId,
      message: replyDeleted ? "" : plain.replyTo.message || "",
      messageType: replyDeleted ? "deleted" : plain.replyTo.messageType || "text",
      deletedForEveryoneAt: plain.replyTo.deletedForEveryoneAt || null,
      createdAt: plain.replyTo.createdAt,
      author: plain.replyTo.author || { id: plain.replyTo.userId, name: "Team member" },
      attachments: replyDeleted
        ? []
        : Array.isArray(plain.replyTo.attachments)
          ? plain.replyTo.attachments
          : [],
    };
  }

  return {
    id: plain.id,
    userId: plain.userId,
    replyToId: plain.replyToId || null,
    messageType: isDeletedForEveryone ? "deleted" : plain.messageType || "text",
    message: isDeletedForEveryone ? "" : plain.message || "",
    mentions: isDeletedForEveryone ? [] : Array.isArray(plain.mentions) ? plain.mentions : [],
    editedAt: isDeletedForEveryone ? null : plain.editedAt || null,
    deletedForEveryoneAt: plain.deletedForEveryoneAt || null,
    deletedById: plain.deletedById || null,
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt,
    author: plain.author || { id: plain.userId, name: "Team member" },
    attachments,
    replyTo,
    receiptSummary,
  };
}

function sortMessagesChronologically(messages) {
  return messages.slice().sort((a, b) => {
    const timeDiff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    if (Number.isFinite(timeDiff) && timeDiff !== 0) return timeDiff;
    return Number(a.id) - Number(b.id);
  });
}

function summarizeNotificationPreview(messageText, attachments = []) {
  if (messageText) return messageText.slice(0, 200);
  if (!attachments.length) return "Sent a message";
  const first = attachments[0].category;
  if (attachments.length > 1) return `Shared ${attachments.length} attachments`;
  if (first === "audio") return "Sent a voice message";
  if (first === "image") return "Shared an image";
  if (first === "video") return "Shared a video";
  return `Shared a document: ${attachments[0].fileName}`;
}

module.exports = {
  MAX_CHAT_FILE_BYTES,
  MAX_CHAT_FILES_PER_MESSAGE,
  ATTACHMENT_PUBLIC_ATTRIBUTES,
  normalizeMimeType,
  resolveAttachmentMeta,
  sanitizeFileName,
  computeTickState,
  buildReceiptSummary,
  getChatMessageInclude,
  formatChatMessage,
  sortMessagesChronologically,
  summarizeNotificationPreview,
};
