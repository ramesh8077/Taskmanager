const webpush = require("web-push");

let configured = false;

function vapidPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || "";
}

function configureWebPush() {
  if (configured) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

async function sendPushForNotification(notification) {
  try {
    if (!configureWebPush() || !["task_assigned", "ticket_assigned"].includes(notification.type)) return;
  } catch (error) {
    console.error("Browser push configuration is invalid:", error.message);
    return;
  }

  try {
    const { PushSubscription } = require("../models");
    const subscriptions = await PushSubscription.findAll({ where: { userId: notification.userId } });
    const payload = JSON.stringify({
      id: notification.id,
      title: notification.title,
      message: notification.message,
      link: notification.link,
    });

    await Promise.all(subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification({
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          expirationTime: subscription.expirationTime,
        }, payload, { TTL: 60 * 60 * 24 });
      } catch (error) {
        if (error.statusCode === 404 || error.statusCode === 410) {
          await subscription.destroy();
          return;
        }
        console.error("Browser push delivery failed:", error.statusCode || error.message);
      }
    }));
  } catch (error) {
    console.error("Unable to send browser push notification:", error.message);
  }
}

module.exports = { sendPushForNotification, vapidPublicKey };
