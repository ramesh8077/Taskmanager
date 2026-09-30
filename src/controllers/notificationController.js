const db = require("../models");

async function listNotifications(req, res) {
  try {
    const [notifications, unreadCount] = await Promise.all([
      db.Notification.findAll({
        where: { userId: req.user.id },
      attributes: ["id", "type", "title", "message", "link", "readAt", "createdAt"],
      order: [["createdAt", "DESC"]],
      limit: 50,
      }),
      db.Notification.count({ where: { userId: req.user.id, readAt: null } }),
    ]);
    return res.status(200).json({
      success: true,
      data: { notifications, unreadCount },
    });
  } catch (error) {
    console.error("❌ List Notifications Error:", error);
    return res.status(500).json({ success: false, message: "Unable to fetch notifications." });
  }
}

async function markNotificationRead(req, res) {
  try {
    const { id } = req.validatedParams || req.params;
    const [updated] = await db.Notification.update(
      { readAt: new Date() },
      { where: { id, userId: req.user.id, readAt: null } }
    );
    if (!updated) {
      const notification = await db.Notification.findOne({ where: { id, userId: req.user.id } });
      if (!notification) return res.status(404).json({ success: false, message: "Notification not found." });
    }
    return res.status(200).json({ success: true, message: "Notification marked as read." });
  } catch (error) {
    console.error("❌ Mark Notification Read Error:", error);
    return res.status(500).json({ success: false, message: "Unable to update the notification." });
  }
}

module.exports = { listNotifications, markNotificationRead };
