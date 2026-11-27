const { Op } = require("sequelize");
const db = require("../models");
const { triggerRealtimePoll } = require("../lib/realtimeNotifications");
const {
  ATTACHMENT_PUBLIC_ATTRIBUTES,
  buildReceiptSummary,
  formatChatMessage,
  getChatMessageInclude,
  resolveAttachmentMeta,
  sanitizeFileName,
  sortMessagesChronologically,
  summarizeNotificationPreview,
} = require("../lib/chatHelpers");

const ATTACHMENT_INLINE_LIMIT_BYTES = 3 * 1024 * 1024;
const ATTACHMENT_CHUNK_BYTES = 2 * 1024 * 1024;
const DELETE_EVERYONE_WINDOW_MS = 6 * 60 * 60 * 1000;
const EDIT_MESSAGE_WINDOW_MS = 3 * 60 * 60 * 1000;

function extractMentionedUsers(rawMessage, users = []) {
  if (!rawMessage) return [];
  return users.filter((user) => {
    const escapedName = user.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|\\s)@${escapedName}(?=$|[\\s,.!?])`, "i").test(rawMessage);
  });
}

function isWithinTimeWindow(createdAt, windowMs) {
  if (!createdAt) return true;
  const createdMs = new Date(createdAt).getTime();
  if (!Number.isFinite(createdMs)) return true;
  return Date.now() - createdMs <= windowMs;
}

function parsePositiveIds(values, maxCount = 200) {
  if (!Array.isArray(values)) return [];
  const unique = new Set();
  for (const val of values) {
    const num = Number(val);
    if (Number.isSafeInteger(num) && num > 0) unique.add(num);
    if (unique.size >= maxCount) break;
  }
  return Array.from(unique);
}

function parseDurationsInput(body) {
  const raw = body?.durations;
  if (raw) {
    try {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (Array.isArray(parsed)) {
        return parsed.map((val) => {
          const n = Math.round(Number(val));
          return Number.isFinite(n) && n >= 0 ? Math.min(n, 36000) : null;
        });
      }
    } catch {
      // Ignore invalid JSON durations and fall back cleanly.
    }
  }
  if (body?.durationSeconds !== undefined && body?.durationSeconds !== "") {
    const n = Math.round(Number(body.durationSeconds));
    if (Number.isFinite(n) && n >= 0) return [Math.min(n, 36000)];
  }
  return [];
}

async function listMentionableMembers(req, res) {
  try {
    const members = await db.User.findAll({
      where: { status: "ACTIVE", isActive: true },
      attributes: ["id", "name", "role"],
      order: [["name", "ASC"], ["id", "ASC"]],
    });
    return res.json({ success: true, data: { members } });
  } catch (error) {
    console.error("List chat members failed:", error.message);
    return res.status(500).json({ success: false, message: "Unable to load team members." });
  }
}

async function getHiddenMessageIds(userId) {
  if (!userId || !db.ChatMessageHidden) return [];
  const rows = await db.ChatMessageHidden.findAll({
    where: { userId },
    attributes: ["messageId"],
    raw: true,
  });
  return rows.map((row) => Number(row.messageId)).filter((id) => Number.isSafeInteger(id) && id > 0);
}

function combineAndWhere(baseWhere, hiddenIds) {
  if (!hiddenIds.length) return baseWhere;
  if (!baseWhere || Object.keys(baseWhere).length === 0) {
    return { id: { [Op.notIn]: hiddenIds } };
  }
  return { [Op.and]: [baseWhere, { id: { [Op.notIn]: hiddenIds } }] };
}

async function listMessages(req, res) {
  try {
    const [activeUserCount, hiddenIds] = await Promise.all([
      db.User.count({ where: { status: "ACTIVE", isActive: true } }),
      getHiddenMessageIds(req.user?.id),
    ]);
    const include = getChatMessageInclude();

    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    if (search) {
      const escaped = search.replace(/[\\%_]/g, "\\$&");
      const likeTerm = `%${escaped}%`;
      const matchingAttachments = await db.ChatAttachment.findAll({
        where: { fileName: { [Op.like]: likeTerm } },
        attributes: ["messageId"],
        limit: 50,
        raw: true,
      });
      const attachmentMsgIds = matchingAttachments.map((row) => row.messageId);
      const matchingAuthors = await db.User.findAll({
        where: { name: { [Op.like]: likeTerm }, status: "ACTIVE", isActive: true },
        attributes: ["id"],
        limit: 30,
        raw: true,
      });
      const authorIds = matchingAuthors.map((row) => row.id);

      const orConditions = [{ message: { [Op.like]: likeTerm } }];
      if (attachmentMsgIds.length) orConditions.push({ id: { [Op.in]: attachmentMsgIds } });
      if (authorIds.length) orConditions.push({ userId: { [Op.in]: authorIds } });

      const rows = await db.ChatMessage.findAll({
        where: combineAndWhere(
          { deletedForEveryoneAt: null, [Op.or]: orConditions },
          hiddenIds
        ),
        include,
        order: [["createdAt", "DESC"], ["id", "DESC"]],
        limit: 50,
      });
      const formatted = rows.map((row) => formatChatMessage(row, activeUserCount));
      return res.json({ success: true, data: { messages: formatted, hasMoreBefore: false } });
    }

    const around = Number(req.query.around);
    if (Number.isSafeInteger(around) && around > 0) {
      const [beforeAndTarget, afterRows] = await Promise.all([
        db.ChatMessage.findAll({
          where: combineAndWhere({ id: { [Op.lte]: around } }, hiddenIds),
          include,
          order: [["createdAt", "DESC"], ["id", "DESC"]],
          limit: 41,
        }),
        db.ChatMessage.findAll({
          where: combineAndWhere({ id: { [Op.gt]: around } }, hiddenIds),
          include,
          order: [["createdAt", "ASC"], ["id", "ASC"]],
          limit: 40,
        }),
      ]);
      const hasMoreBefore = beforeAndTarget.length > 40;
      const beforeSlice = beforeAndTarget.slice(0, 40).reverse();
      const combined = [...beforeSlice, ...afterRows].map((row) => formatChatMessage(row, activeUserCount));
      return res.json({
        success: true,
        data: { messages: sortMessagesChronologically(combined), hasMoreBefore, targetId: around },
      });
    }

    const after = Number(req.query.after);
    if (Number.isSafeInteger(after) && after > 0) {
      const rows = await db.ChatMessage.findAll({
        where: combineAndWhere({ id: { [Op.gt]: after } }, hiddenIds),
        include,
        order: [["id", "ASC"]],
        limit: 100,
      });
      const formatted = sortMessagesChronologically(rows.map((row) => formatChatMessage(row, activeUserCount)));
      return res.json({ success: true, data: { messages: formatted, hasMoreBefore: false } });
    }

    const limit = Math.min(Math.max(Number(req.query.limit) || 60, 1), 100);
    const before = Number(req.query.before);
    const baseWhere = Number.isSafeInteger(before) && before > 0 ? { id: { [Op.lt]: before } } : {};
    const where = combineAndWhere(baseWhere, hiddenIds);
    const rows = await db.ChatMessage.findAll({
      where,
      include,
      order: [["id", "DESC"]],
      limit: limit + 1,
    });
    const hasMoreBefore = rows.length > limit;
    const pageRows = rows.slice(0, limit).reverse();
    const formatted = sortMessagesChronologically(pageRows.map((row) => formatChatMessage(row, activeUserCount)));
    return res.json({ success: true, data: { messages: formatted, hasMoreBefore } });
  } catch (error) {
    console.error("List chat messages failed:", error.message);
    return res.status(500).json({ success: false, message: "Unable to load team chat." });
  }
}

async function createMessage(req, res) {
  try {
    const rawMessage = typeof req.body?.message === "string" ? req.body.message.trim() : "";
    const uploadedFiles = Array.isArray(req.files) ? req.files : [];

    if (rawMessage.length > 2000) {
      return res.status(400).json({ success: false, message: "Message must not exceed 2000 characters." });
    }
    if (!rawMessage && uploadedFiles.length === 0) {
      return res.status(400).json({ success: false, message: "Enter a message or attach a file before sending." });
    }

    let replyToId = null;
    if (req.body?.replyToId !== undefined && req.body?.replyToId !== null && req.body?.replyToId !== "") {
      const parsedReplyId = Number(req.body.replyToId);
      if (!Number.isSafeInteger(parsedReplyId) || parsedReplyId < 1) {
        return res.status(400).json({ success: false, message: "Invalid reply target." });
      }
      const replyTarget = await db.ChatMessage.findByPk(parsedReplyId, { attributes: ["id"] });
      if (!replyTarget) {
        return res.status(400).json({ success: false, message: "The message you tried to reply to was not found." });
      }
      replyToId = parsedReplyId;
    }

    const durations = parseDurationsInput(req.body);
    const preparedFiles = [];
    for (let i = 0; i < uploadedFiles.length; i += 1) {
      const file = uploadedFiles[i];
      const meta = resolveAttachmentMeta(file);
      if (!meta) {
        return res.status(400).json({
          success: false,
          message: `Unsupported file type for "${sanitizeFileName(file.originalname)}".`,
        });
      }
      preparedFiles.push({
        category: meta.category,
        fileName: sanitizeFileName(file.originalname),
        mimeType: meta.mimeType,
        fileSize: file.size || file.buffer.length,
        durationSeconds: durations[i] ?? null,
        fileData: file.buffer,
      });
    }

    const uniqueCategories = new Set(preparedFiles.map((item) => item.category));
    let messageType = "text";
    if (uniqueCategories.size === 1) {
      messageType = preparedFiles[0].category;
    } else if (uniqueCategories.size > 1) {
      messageType = "mixed";
    }

    const users = await db.User.findAll({
      where: { status: "ACTIVE", isActive: true },
      attributes: ["id", "name"],
    });
    const mentioned = extractMentionedUsers(rawMessage, users);

    const created = await db.sequelize.transaction(async (transaction) => {
      const msg = await db.ChatMessage.create(
        {
          userId: req.user.id,
          replyToId,
          messageType,
          message: rawMessage,
          mentions: mentioned.map((user) => user.id),
        },
        { transaction }
      );
      for (const file of preparedFiles) {
        const isChunked = file.fileData.length > ATTACHMENT_INLINE_LIMIT_BYTES;
        const createdAttachment = await db.ChatAttachment.create(
          {
            messageId: msg.id,
            uploadedBy: req.user.id,
            category: file.category,
            fileName: file.fileName,
            mimeType: file.mimeType,
            fileSize: file.fileSize,
            durationSeconds: file.durationSeconds,
            isChunked,
            fileData: isChunked ? null : file.fileData,
          },
          { transaction }
        );
        if (isChunked) {
          let chunkIndex = 0;
          for (let offset = 0; offset < file.fileData.length; offset += ATTACHMENT_CHUNK_BYTES) {
            const slice = file.fileData.subarray(offset, offset + ATTACHMENT_CHUNK_BYTES);
            await db.ChatAttachmentChunk.create(
              {
                attachmentId: createdAttachment.id,
                chunkIndex,
                chunkData: slice,
              },
              { transaction }
            );
            chunkIndex += 1;
          }
        }
      }
      return msg;
    });

    const resultRow = await db.ChatMessage.findByPk(created.id, {
      include: getChatMessageInclude(),
    });
    const formatted = formatChatMessage(resultRow, users.length);

    const recipientIds = users.filter((user) => user.id !== req.user.id).map((user) => user.id);
    if (recipientIds.length) {
      const mentionedIds = new Set(mentioned.map((user) => user.id));
      const preview = summarizeNotificationPreview(rawMessage, preparedFiles);
      await db.Notification.bulkCreate(
        recipientIds.map((userId) => ({
          userId,
          type: mentionedIds.has(userId) ? "chat_mention" : "team_chat",
          title: mentionedIds.has(userId)
            ? `${req.user.name} mentioned you in team chat`
            : `New message from ${req.user.name}`,
          message: preview,
          link: "/dashboard/chat",
          dedupeKey: `chat:${created.id}:${userId}`,
        })),
        { ignoreDuplicates: true }
      );
    }

    triggerRealtimePoll();
    return res.status(201).json({ success: true, data: { message: formatted } });
  } catch (error) {
    console.error("Create chat message failed:", error);
    const errText = String(error?.message || "");
    if (/entry too large|max_allowed_packet|packet/i.test(errText)) {
      return res.status(413).json({
        success: false,
        message: "Attachment is too large for database storage. Try a smaller or compressed file.",
      });
    }
    return res.status(500).json({ success: false, message: "Unable to send chat message." });
  }
}

async function getAttachment(req, res) {
  try {
    const attachmentId = Number(req.params.attachmentId);
    if (!Number.isSafeInteger(attachmentId) || attachmentId < 1) {
      return res.status(400).json({ success: false, message: "Invalid attachment ID." });
    }
    const attachment = await db.ChatAttachment.findByPk(attachmentId);
    if (!attachment) {
      return res.status(404).json({ success: false, message: "Attachment not found." });
    }

    let payloadBuffer = attachment.fileData;
    if (attachment.isChunked || !payloadBuffer) {
      const chunks = await db.ChatAttachmentChunk.findAll({
        where: { attachmentId: attachment.id },
        order: [["chunkIndex", "ASC"]],
        attributes: ["chunkData"],
        raw: true,
      });
      if (!chunks.length) {
        return res.status(404).json({ success: false, message: "Attachment file data is unavailable." });
      }
      payloadBuffer = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk.chunkData)));
    }

    const forceDownload = req.query.download === "1" || req.query.download === "true";
    const safeName = sanitizeFileName(attachment.fileName);
    const dispositionType = forceDownload || (attachment.category === "document" && attachment.mimeType !== "application/pdf")
      ? "attachment"
      : "inline";

    res.setHeader("Content-Type", attachment.mimeType || "application/octet-stream");
    res.setHeader("Content-Length", payloadBuffer.length);
    res.setHeader(
      "Content-Disposition",
      `${dispositionType}; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, max-age=3600");
    return res.send(payloadBuffer);
  } catch (error) {
    console.error("Get chat attachment failed:", error);
    return res.status(500).json({ success: false, message: "Unable to load attachment." });
  }
}

async function recordReceipts(req, res) {
  try {
    const deliveredIds = parsePositiveIds(req.body?.deliveredIds);
    const seenIds = parsePositiveIds(req.body?.seenIds);
    const allIds = Array.from(new Set([...deliveredIds, ...seenIds]));
    if (!allIds.length) {
      return res.json({ success: true, data: { statuses: {} } });
    }

    const seenSet = new Set(seenIds);
    const targetMessages = await db.ChatMessage.findAll({
      where: {
        id: { [Op.in]: allIds },
        userId: { [Op.ne]: req.user.id },
      },
      attributes: ["id", "userId"],
      raw: true,
    });

    const validIds = targetMessages.map((msg) => msg.id);
    if (validIds.length) {
      const now = new Date();
      const existing = await db.ChatMessageReceipt.findAll({
        where: {
          messageId: { [Op.in]: validIds },
          userId: req.user.id,
        },
      });
      const existingMap = new Map(existing.map((row) => [Number(row.messageId), row]));
      const toCreate = [];
      const toUpdate = [];

      for (const messageId of validIds) {
        const isSeen = seenSet.has(messageId);
        const found = existingMap.get(messageId);
        if (!found) {
          toCreate.push({
            messageId,
            userId: req.user.id,
            deliveredAt: now,
            seenAt: isSeen ? now : null,
          });
        } else {
          const needsDelivered = !found.deliveredAt;
          const needsSeen = isSeen && !found.seenAt;
          if (needsDelivered || needsSeen) {
            toUpdate.push(
              found.update({
                deliveredAt: found.deliveredAt || now,
                seenAt: found.seenAt || (isSeen ? now : null),
              })
            );
          }
        }
      }

      if (toCreate.length) {
        await db.ChatMessageReceipt.bulkCreate(toCreate, { ignoreDuplicates: true });
      }
      if (toUpdate.length) {
        await Promise.all(toUpdate);
      }
      if (toCreate.length || toUpdate.length) {
        triggerRealtimePoll();
      }
    }

    const statuses = await computeStatusesForIds(allIds);
    return res.json({ success: true, data: { statuses } });
  } catch (error) {
    console.error("Record chat receipts failed:", error.message);
    return res.status(500).json({ success: false, message: "Unable to update message receipts." });
  }
}

async function computeStatusesAndDeletions(messageIds) {
  if (!messageIds.length) return { statuses: {}, deletedIds: [], editedMessages: [] };
  const [activeUserCount, messages, receipts] = await Promise.all([
    db.User.count({ where: { status: "ACTIVE", isActive: true } }),
    db.ChatMessage.findAll({
      where: { id: { [Op.in]: messageIds } },
      attributes: ["id", "userId", "message", "mentions", "editedAt", "deletedForEveryoneAt", "messageType"],
      raw: true,
    }),
    db.ChatMessageReceipt.findAll({
      where: { messageId: { [Op.in]: messageIds } },
      attributes: ["messageId", "userId", "deliveredAt", "seenAt"],
      raw: true,
    }),
  ]);
  const receiptsByMsg = new Map();
  for (const r of receipts) {
    const key = Number(r.messageId);
    if (!receiptsByMsg.has(key)) receiptsByMsg.set(key, []);
    receiptsByMsg.get(key).push(r);
  }
  const statuses = {};
  const deletedIds = [];
  const editedMessages = [];
  for (const msg of messages) {
    statuses[msg.id] = buildReceiptSummary(msg.userId, receiptsByMsg.get(msg.id) || [], activeUserCount);
    if (msg.deletedForEveryoneAt || msg.messageType === "deleted") {
      deletedIds.push(msg.id);
    } else if (msg.editedAt) {
      editedMessages.push({
        id: msg.id,
        message: msg.message || "",
        mentions: Array.isArray(msg.mentions) ? msg.mentions : [],
        editedAt: msg.editedAt,
      });
    }
  }
  return { statuses, deletedIds, editedMessages };
}

async function computeStatusesForIds(messageIds) {
  const { statuses } = await computeStatusesAndDeletions(messageIds);
  return statuses;
}

async function getMessageStatuses(req, res) {
  try {
    const rawIds = String(req.query.ids || "")
      .split(",")
      .map((part) => Number(part.trim()));
    const messageIds = parsePositiveIds(rawIds, 150);
    const { statuses, deletedIds, editedMessages } = await computeStatusesAndDeletions(messageIds);
    return res.json({ success: true, data: { statuses, deletedIds, editedMessages } });
  } catch (error) {
    console.error("Get message statuses failed:", error.message);
    return res.status(500).json({ success: false, message: "Unable to load message delivery status." });
  }
}

async function editMessage(req, res) {
  try {
    const messageId = Number(req.params.id);
    if (!Number.isSafeInteger(messageId) || messageId < 1) {
      return res.status(400).json({ success: false, message: "Invalid message ID." });
    }
    const rawMessage = typeof req.body?.message === "string" ? req.body.message.trim() : "";
    if (rawMessage.length > 2000) {
      return res.status(400).json({ success: false, message: "Message must not exceed 2000 characters." });
    }

    const messageRow = await db.ChatMessage.findByPk(messageId, {
      include: [
        {
          model: db.ChatAttachment,
          as: "attachments",
          attributes: ["id"],
          separate: true,
        },
      ],
    });
    if (!messageRow) {
      return res.status(404).json({ success: false, message: "Message not found." });
    }
    if (Number(messageRow.userId) !== Number(req.user.id)) {
      return res.status(403).json({ success: false, message: "Only the sender can edit this message." });
    }
    if (messageRow.deletedForEveryoneAt || messageRow.messageType === "deleted") {
      return res.status(400).json({ success: false, message: "Deleted messages cannot be edited." });
    }
    if (!isWithinTimeWindow(messageRow.createdAt, EDIT_MESSAGE_WINDOW_MS)) {
      return res.status(400).json({
        success: false,
        message: "Messages can only be edited within 3 hours of sending.",
      });
    }
    const hasAttachments = Array.isArray(messageRow.attachments) && messageRow.attachments.length > 0;
    if (!rawMessage && !hasAttachments) {
      return res.status(400).json({ success: false, message: "Message cannot be empty." });
    }

    const users = await db.User.findAll({
      where: { status: "ACTIVE", isActive: true },
      attributes: ["id", "name"],
    });
    const mentioned = extractMentionedUsers(rawMessage, users);
    const editedAt = new Date();

    await db.ChatMessage.update(
      {
        message: rawMessage,
        mentions: mentioned.map((user) => user.id),
        editedAt,
      },
      { where: { id: messageId } }
    );

    const updatedRow = await db.ChatMessage.findByPk(messageId, { include: getChatMessageInclude() });
    triggerRealtimePoll();
    return res.json({
      success: true,
      data: {
        message: updatedRow ? formatChatMessage(updatedRow, users.length) : null,
      },
    });
  } catch (error) {
    console.error("Edit chat message failed:", error);
    return res.status(500).json({ success: false, message: "Unable to edit message." });
  }
}

async function deleteMessage(req, res) {
  try {
    const messageId = Number(req.params.id);
    if (!Number.isSafeInteger(messageId) || messageId < 1) {
      return res.status(400).json({ success: false, message: "Invalid message ID." });
    }
    const rawScope = req.query?.scope || req.body?.scope || "me";
    const scope = String(rawScope).trim().toLowerCase();
    if (scope !== "me" && scope !== "everyone") {
      return res.status(400).json({ success: false, message: "Delete scope must be 'me' or 'everyone'." });
    }

    const messageRow = await db.ChatMessage.findByPk(messageId);
    if (!messageRow) {
      return res.status(404).json({ success: false, message: "Message not found." });
    }

    if (scope === "me") {
      if (db.ChatMessageHidden) {
        await db.ChatMessageHidden.bulkCreate(
          [{ messageId, userId: req.user.id }],
          { ignoreDuplicates: true }
        );
      }
      return res.json({ success: true, data: { messageId, scope: "me" } });
    }

    if (Number(messageRow.userId) !== Number(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: "Only the sender can delete a message for everyone.",
      });
    }

    if (!isWithinTimeWindow(messageRow.createdAt, DELETE_EVERYONE_WINDOW_MS)) {
      return res.status(400).json({
        success: false,
        message: "Messages can only be deleted for everyone within 6 hours of sending.",
      });
    }

    const deletedAt = new Date();
    await db.sequelize.transaction(async (transaction) => {
      await db.ChatAttachment.destroy({ where: { messageId }, transaction });
      await db.ChatMessage.update(
        {
          message: "",
          mentions: [],
          messageType: "deleted",
          deletedForEveryoneAt: deletedAt,
          deletedById: req.user.id,
        },
        { where: { id: messageId }, transaction }
      );
    });

    const [activeUserCount, updatedRow] = await Promise.all([
      db.User.count({ where: { status: "ACTIVE", isActive: true } }),
      db.ChatMessage.findByPk(messageId, { include: getChatMessageInclude() }),
    ]);

    triggerRealtimePoll();
    return res.json({
      success: true,
      data: {
        messageId,
        scope: "everyone",
        message: updatedRow ? formatChatMessage(updatedRow, activeUserCount) : null,
      },
    });
  } catch (error) {
    console.error("Delete chat message failed:", error);
    return res.status(500).json({ success: false, message: "Unable to delete message." });
  }
}

async function getMessageInfo(req, res) {
  try {
    const messageId = Number(req.params.id);
    if (!Number.isSafeInteger(messageId) || messageId < 1) {
      return res.status(400).json({ success: false, message: "Invalid message ID." });
    }

    const [messageRow, activeUsers, receiptRows] = await Promise.all([
      db.ChatMessage.findByPk(messageId, {
        include: [
          { model: db.User, as: "author", attributes: ["id", "name", "role"] },
          {
            model: db.ChatAttachment,
            as: "attachments",
            attributes: ATTACHMENT_PUBLIC_ATTRIBUTES,
            separate: true,
          },
        ],
      }),
      db.User.findAll({
        where: { status: "ACTIVE", isActive: true },
        attributes: ["id", "name", "role"],
        order: [["name", "ASC"], ["id", "ASC"]],
        raw: true,
      }),
      db.ChatMessageReceipt.findAll({
        where: { messageId },
        attributes: ["userId", "deliveredAt", "seenAt"],
        raw: true,
      }),
    ]);

    if (!messageRow) {
      return res.status(404).json({ success: false, message: "Message not found." });
    }

    const plainMsg = typeof messageRow.get === "function" ? messageRow.get({ plain: true }) : messageRow;
    const receiptByUser = new Map(receiptRows.map((row) => [Number(row.userId), row]));
    const recipients = activeUsers.filter((user) => Number(user.id) !== Number(plainMsg.userId));

    const seenBy = [];
    const deliveredTo = [];
    const notDeliveredTo = [];

    for (const member of recipients) {
      const receipt = receiptByUser.get(Number(member.id));
      if (receipt?.seenAt) {
        seenBy.push({
          id: member.id,
          name: member.name,
          role: member.role,
          deliveredAt: receipt.deliveredAt || receipt.seenAt,
          seenAt: receipt.seenAt,
        });
      } else if (receipt?.deliveredAt) {
        deliveredTo.push({
          id: member.id,
          name: member.name,
          role: member.role,
          deliveredAt: receipt.deliveredAt,
        });
      } else {
        notDeliveredTo.push({
          id: member.id,
          name: member.name,
          role: member.role,
        });
      }
    }

    seenBy.sort((a, b) => new Date(b.seenAt).getTime() - new Date(a.seenAt).getTime());
    deliveredTo.sort((a, b) => new Date(b.deliveredAt).getTime() - new Date(a.deliveredAt).getTime());

    const receiptSummary = buildReceiptSummary(plainMsg.userId, receiptRows, activeUsers.length);

    return res.json({
      success: true,
      data: {
        message: {
          id: plainMsg.id,
          userId: plainMsg.userId,
          message: plainMsg.message,
          messageType: plainMsg.messageType,
          createdAt: plainMsg.createdAt,
          author: plainMsg.author,
          attachments: plainMsg.attachments || [],
        },
        totalRecipients: recipients.length,
        seenBy,
        deliveredTo,
        notDeliveredTo,
        notSeenCount: deliveredTo.length + notDeliveredTo.length,
        receiptSummary,
      },
    });
  } catch (error) {
    console.error("Get message info failed:", error.message);
    return res.status(500).json({ success: false, message: "Unable to load message info." });
  }
}

module.exports = {
  listMentionableMembers,
  listMessages,
  createMessage,
  getAttachment,
  recordReceipts,
  getMessageStatuses,
  getMessageInfo,
  editMessage,
  deleteMessage,
};
