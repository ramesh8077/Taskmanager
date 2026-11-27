const { EventEmitter } = require("events");
const jwt = require("jsonwebtoken");
const { WebSocketServer, WebSocket } = require("ws");
const { Op } = require("sequelize");
const db = require("../models");
const appConfig = require("../config/app.config");
const { buildReceiptSummary, formatChatMessage, getChatMessageInclude } = require("./chatHelpers");

const SOCKET_PATH = "/api/realtime/notifications";
const realtimeEvents = new EventEmitter();
realtimeEvents.setMaxListeners(0);

function triggerRealtimePoll() {
  realtimeEvents.emit("poll");
}

function getCookie(header = "", name) {
  const cookie = header.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`));
  if (!cookie) return null;
  try {
    return decodeURIComponent(cookie.slice(name.length + 1));
  } catch {
    return null;
  }
}

function allowedOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    const originUrl = new URL(origin);
    const forwardedHost = request.headers["x-forwarded-host"];
    const requestHost = String(forwardedHost || request.headers.host || "").split(",")[0].trim();
    return (requestHost && originUrl.host.toLowerCase() === requestHost.toLowerCase()) ||
      appConfig.CORS_ORIGINS.includes(origin.replace(/\/$/, ""));
  } catch {
    return false;
  }
}

function reject(socket, code, message) {
  socket.write(`HTTP/1.1 ${code} ${message}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

function attachRealtimeNotifications(server, ensureDatabase = () => db.sequelize.authenticate()) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });

  server.on("upgrade", async (request, socket, head) => {
    let url;
    try {
      url = new URL(request.url, "http://localhost");
    } catch {
      return reject(socket, 400, "Bad Request");
    }
    if (url.pathname !== SOCKET_PATH) return;
    if (!allowedOrigin(request)) return reject(socket, 403, "Forbidden");

    const token = getCookie(request.headers.cookie, "token");
    if (!token) return reject(socket, 401, "Unauthorized");

    let userId;
    try {
      const payload = jwt.verify(token, appConfig.JWT_SECRET);
      userId = Number(payload?.sub ?? payload?.id);
      if (!Number.isSafeInteger(userId) || userId < 1) throw new Error("Invalid user id");
    } catch {
      return reject(socket, 401, "Unauthorized");
    }

    try {
      await ensureDatabase();
      const user = await db.User.findByPk(userId, { attributes: ["id", "status", "isActive"] });
      if (!user || user.status !== "ACTIVE" || !user.isActive) return reject(socket, 401, "Unauthorized");
    } catch (error) {
      console.error("Realtime notification authentication failed:", error.message);
      return reject(socket, 503, "Service Unavailable");
    }

    const requestedCursor = Number(url.searchParams.get("after"));
    const lastId = Number.isSafeInteger(requestedCursor) && requestedCursor >= 0 ? requestedCursor : 0;
    const rawChatCursor = url.searchParams.get("afterChat");
    const requestedChatCursor = rawChatCursor !== null ? Number(rawChatCursor) : NaN;
    const hasChatCursor = Number.isSafeInteger(requestedChatCursor) && requestedChatCursor >= 0;
    wss.handleUpgrade(request, socket, head, (client) => {
      wss.emit("connection", client, request, {
        userId,
        lastId,
        lastChatId: hasChatCursor ? requestedChatCursor : null,
      });
    });
  });

  wss.on("connection", (client, _request, session) => {
    let lastId = session.lastId;
    let lastChatId = session.lastChatId;
    let lastReceiptSyncAt = new Date();
    let lastDeletedSyncAt = new Date();
    let querying = false;
    let pendingPoll = false;

    const poll = async () => {
      if (client.readyState !== WebSocket.OPEN) return;
      if (querying) {
        pendingPoll = true;
        return;
      }
      querying = true;
      try {
        if (lastChatId === null) {
          lastChatId = Number(await db.ChatMessage.max("id")) || 0;
        }
        const notifications = await db.Notification.findAll({
          where: { userId: session.userId, id: { [Op.gt]: lastId } },
          attributes: ["id", "type", "title", "message", "link", "readAt", "createdAt"],
          order: [["id", "ASC"]],
          limit: 50,
          raw: true,
        });
        for (const notification of notifications) {
          lastId = Math.max(lastId, Number(notification.id));
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: "notification", notification }));
          }
        }
        const messages = await db.ChatMessage.findAll({
          where: { id: { [Op.gt]: lastChatId } },
          include: getChatMessageInclude(),
          order: [["createdAt", "ASC"], ["id", "ASC"]],
          limit: 50,
        });
        let activeUserCount = 0;
        if (messages.length > 0) {
          activeUserCount = await db.User.count({ where: { status: "ACTIVE", isActive: true } });
        }
        for (const message of messages) {
          lastChatId = Math.max(lastChatId, Number(message.id));
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
              type: "chat_message",
              message: formatChatMessage(message, activeUserCount),
            }));
          }
        }
        if (db.ChatMessageReceipt) {
          const updatedReceipts = await db.ChatMessageReceipt.findAll({
            where: { updatedAt: { [Op.gt]: lastReceiptSyncAt } },
            include: [{
              model: db.ChatMessage,
              as: "chatMessage",
              where: { userId: session.userId },
              attributes: ["id", "userId"],
              required: true,
            }],
            attributes: ["messageId", "updatedAt"],
            order: [["updatedAt", "ASC"]],
            limit: 100,
          });
          if (updatedReceipts.length > 0) {
            const changedMessageIds = Array.from(new Set(updatedReceipts.map((r) => Number(r.messageId))));
            const maxUpdated = updatedReceipts.reduce(
              (latest, r) => (new Date(r.updatedAt) > latest ? new Date(r.updatedAt) : latest),
              lastReceiptSyncAt
            );
            lastReceiptSyncAt = maxUpdated;
            const [totalActive, receiptsForMsgs] = await Promise.all([
              activeUserCount || db.User.count({ where: { status: "ACTIVE", isActive: true } }),
              db.ChatMessageReceipt.findAll({
                where: { messageId: { [Op.in]: changedMessageIds } },
                attributes: ["messageId", "userId", "deliveredAt", "seenAt"],
                raw: true,
              }),
            ]);
            const byMsg = new Map();
            for (const row of receiptsForMsgs) {
              const mid = Number(row.messageId);
              if (!byMsg.has(mid)) byMsg.set(mid, []);
              byMsg.get(mid).push(row);
            }
            const updates = changedMessageIds.map((messageId) => ({
              messageId,
              receiptSummary: buildReceiptSummary(session.userId, byMsg.get(messageId) || [], totalActive),
            }));
            if (client.readyState === WebSocket.OPEN && updates.length > 0) {
              client.send(JSON.stringify({ type: "chat_receipts", updates }));
            }
          }
        }
        const deletedMessages = await db.ChatMessage.findAll({
          where: { deletedForEveryoneAt: { [Op.gt]: lastDeletedSyncAt } },
          attributes: ["id", "deletedForEveryoneAt"],
          order: [["deletedForEveryoneAt", "ASC"]],
          limit: 50,
          raw: true,
        });
        if (deletedMessages.length > 0) {
          lastDeletedSyncAt = deletedMessages.reduce(
            (latest, row) =>
              new Date(row.deletedForEveryoneAt) > latest ? new Date(row.deletedForEveryoneAt) : latest,
            lastDeletedSyncAt
          );
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: "chat_message_deleted", deletions: deletedMessages }));
          }
        }
      } catch (error) {
        console.error("Realtime notification lookup failed:", error.message);
      } finally {
        querying = false;
        if (pendingPoll && client.readyState === WebSocket.OPEN) {
          pendingPoll = false;
          void poll();
        }
      }
    };

    const onTrigger = () => void poll();
    realtimeEvents.on("poll", onTrigger);
    const interval = setInterval(() => void poll(), 2000);
    interval.unref?.();
    const cleanup = () => {
      clearInterval(interval);
      realtimeEvents.off("poll", onTrigger);
    };
    client.on("close", cleanup);
    client.on("error", cleanup);
    void poll();
  });

  return wss;
}

module.exports = { attachRealtimeNotifications, triggerRealtimePoll, SOCKET_PATH };
