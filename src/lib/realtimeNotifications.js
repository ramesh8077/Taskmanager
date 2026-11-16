const jwt = require("jsonwebtoken");
const { WebSocketServer, WebSocket } = require("ws");
const { Op } = require("sequelize");
const db = require("../models");
const appConfig = require("../config/app.config");

const SOCKET_PATH = "/api/realtime/notifications";

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
    wss.handleUpgrade(request, socket, head, (client) => {
      wss.emit("connection", client, request, { userId, lastId });
    });
  });

  wss.on("connection", (client, _request, session) => {
    let lastId = session.lastId;
    let querying = false;

    const poll = async () => {
      if (querying || client.readyState !== WebSocket.OPEN) return;
      querying = true;
      try {
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
      } catch (error) {
        console.error("Realtime notification lookup failed:", error.message);
      } finally {
        querying = false;
      }
    };

    const interval = setInterval(() => void poll(), 2000);
    interval.unref?.();
    client.on("close", () => clearInterval(interval));
    client.on("error", () => clearInterval(interval));
    void poll();
  });

  return wss;
}

module.exports = { attachRealtimeNotifications, SOCKET_PATH };
