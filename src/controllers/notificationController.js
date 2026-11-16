const db = require("../models");
const { vapidPublicKey } = require("../lib/pushNotifications");

function getPushPublicKey(req, res) {
  const publicKey = vapidPublicKey();
  if (!publicKey || !process.env.VAPID_PRIVATE_KEY || !process.env.VAPID_SUBJECT) {
    return res.status(503).json({
      success: false,
      message: "Browser notifications are not configured yet.",
    });
  }
  return res.status(200).json({ success: true, data: { publicKey } });
}

async function savePushSubscription(req, res) {
  try {
    const { endpoint, keys, expirationTime } = req.body || {};
    let endpointUrl;
    try {
      endpointUrl = new URL(endpoint);
    } catch {
      return res.status(400).json({ success: false, message: "A valid push endpoint is required." });
    }
    if (endpointUrl.protocol !== "https:" || endpoint.length > 512 ||
        typeof keys?.p256dh !== "string" || keys.p256dh.length > 255 ||
        typeof keys?.auth !== "string" || keys.auth.length > 255) {
      return res.status(400).json({ success: false, message: "The browser push subscription is invalid." });
    }

    const values = {
      userId: req.user.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      expirationTime: Number.isFinite(expirationTime) ? expirationTime : null,
    };
    const existing = await db.PushSubscription.findOne({ where: { endpoint } });
    if (existing) await existing.update(values);
    else await db.PushSubscription.create(values);

    return res.status(201).json({ success: true, message: "Browser notifications enabled." });
  } catch (error) {
    console.error("Save Push Subscription Error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to enable browser notifications." });
  }
}

async function deletePushSubscription(req, res) {
  try {
    const endpoint = req.body?.endpoint;
    if (typeof endpoint !== "string" || endpoint.length > 512) {
      return res.status(400).json({ success: false, message: "A valid push endpoint is required." });
    }
    await db.PushSubscription.destroy({ where: { userId: req.user.id, endpoint } });
    return res.status(200).json({ success: true, message: "Browser notifications disabled." });
  } catch (error) {
    console.error("Delete Push Subscription Error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to disable browser notifications." });
  }
}

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

module.exports = {
  listNotifications,
  markNotificationRead,
  getPushPublicKey,
  savePushSubscription,
  deletePushSubscription,
};
