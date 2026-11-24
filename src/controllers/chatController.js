const { Op } = require("sequelize");
const db = require("../models");

async function listMessages(req, res) {
  try {
    const before = Number(req.query.before);
    const where = before > 0 ? { id: { [Op.lt]: before } } : {};
    const rows = await db.ChatMessage.findAll({ where, include: [{ model: db.User, as: "author", attributes: ["id", "name"] }], order: [["id", "DESC"]], limit: 100 });
    return res.json({ success: true, data: { messages: rows.reverse() } });
  } catch (error) {
    console.error("List chat messages failed:", error.message);
    return res.status(500).json({ success: false, message: "Unable to load team chat." });
  }
}

async function createMessage(req, res) {
  try {
    const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
    if (!message || message.length > 2000) return res.status(400).json({ success: false, message: "Message must contain 1 to 2000 characters." });
    const users = await db.User.findAll({ where: { status: "ACTIVE", isActive: true }, attributes: ["id", "name"] });
    const mentioned = users.filter((user) => {
      const escapedName = user.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`(^|\\s)@${escapedName}(?=$|[\\s,.!?])`, "i").test(message);
    });
    const created = await db.ChatMessage.create({ userId: req.user.id, message, mentions: mentioned.map((user) => user.id) });
    const result = await db.ChatMessage.findByPk(created.id, { include: [{ model: db.User, as: "author", attributes: ["id", "name"] }] });
    const recipientIds = users.filter((user) => user.id !== req.user.id).map((user) => user.id);
    if (recipientIds.length) {
      const mentionedIds = new Set(mentioned.map((user) => user.id));
      await db.Notification.bulkCreate(recipientIds.map((userId) => ({
        userId, type: mentionedIds.has(userId) ? "chat_mention" : "team_chat",
        title: mentionedIds.has(userId) ? `${req.user.name} mentioned you in team chat` : "New team chat message",
        message: message.slice(0, 200), link: "/dashboard/chat",
        dedupeKey: `chat:${created.id}:${userId}`,
      })), { ignoreDuplicates: true });
    }
    return res.status(201).json({ success: true, data: { message: result } });
  } catch (error) {
    console.error("Create chat message failed:", error.message);
    return res.status(500).json({ success: false, message: "Unable to send chat message." });
  }
}

module.exports = { listMessages, createMessage };
