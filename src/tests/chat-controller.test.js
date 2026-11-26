const test = require("node:test");
const assert = require("node:assert/strict");
const db = require("../models");
const chatController = require("../controllers/chatController");
const { shouldSendPushForNotification } = require("../lib/pushNotifications");

function createMockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test("listMessages returns latest messages in ascending chronological order (newest last)", async () => {
  const originalFindAll = db.ChatMessage.findAll;
  let capturedOptions = null;

  db.ChatMessage.findAll = async (options) => {
    capturedOptions = options;
    return [
      { id: 12, message: "latest" },
      { id: 11, message: "middle" },
      { id: 10, message: "oldest" },
    ];
  };

  try {
    const res = createMockRes();
    await chatController.listMessages({ query: {} }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(capturedOptions.order, [["id", "DESC"]]);
    assert.deepEqual(
      res.body.data.messages.map((m) => m.id),
      [10, 11, 12]
    );
  } finally {
    db.ChatMessage.findAll = originalFindAll;
  }
});

test("listMessages supports ?after= cursor in ascending order for incremental realtime sync", async () => {
  const originalFindAll = db.ChatMessage.findAll;
  let capturedOptions = null;

  db.ChatMessage.findAll = async (options) => {
    capturedOptions = options;
    return [
      { id: 13, message: "new 1" },
      { id: 14, message: "new 2" },
    ];
  };

  try {
    const res = createMockRes();
    await chatController.listMessages({ query: { after: "12" } }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(capturedOptions.order, [["id", "ASC"]]);
    assert.deepEqual(
      res.body.data.messages.map((m) => m.id),
      [13, 14]
    );
  } finally {
    db.ChatMessage.findAll = originalFindAll;
  }
});

test("browser push notifications are enabled for team_chat and chat_mention alongside task_assigned", () => {
  assert.equal(shouldSendPushForNotification("task_assigned"), true);
  assert.equal(shouldSendPushForNotification("team_chat"), true);
  assert.equal(shouldSendPushForNotification("chat_mention"), true);
  assert.equal(shouldSendPushForNotification("unknown_type"), false);
});

test("createMessage creates chat notifications for other active users with /dashboard/chat link", async () => {
  const originalUserFindAll = db.User.findAll;
  const originalChatCreate = db.ChatMessage.create;
  const originalChatFindByPk = db.ChatMessage.findByPk;
  const originalNotificationBulkCreate = db.Notification.bulkCreate;
  let capturedNotifications = [];

  db.User.findAll = async () => [
    { id: 1, name: "Ramesh" },
    { id: 2, name: "Amit" },
    { id: 3, name: "Priya" },
  ];
  db.ChatMessage.create = async () => ({ id: 55 });
  db.ChatMessage.findByPk = async () => ({
    id: 55,
    userId: 1,
    message: "Hello @Priya check this",
    mentions: [3],
    author: { id: 1, name: "Ramesh" },
  });
  db.Notification.bulkCreate = async (rows) => {
    capturedNotifications = rows;
    return rows;
  };

  try {
    const res = createMockRes();
    await chatController.createMessage(
      { user: { id: 1, name: "Ramesh" }, body: { message: "Hello @Priya check this" } },
      res
    );
    assert.equal(res.statusCode, 201);
    assert.equal(capturedNotifications.length, 2);
    assert.deepEqual(capturedNotifications, [
      {
        userId: 2,
        type: "team_chat",
        title: "New message from Ramesh",
        message: "Hello @Priya check this",
        link: "/dashboard/chat",
        dedupeKey: "chat:55:2",
      },
      {
        userId: 3,
        type: "chat_mention",
        title: "Ramesh mentioned you in team chat",
        message: "Hello @Priya check this",
        link: "/dashboard/chat",
        dedupeKey: "chat:55:3",
      },
    ]);
  } finally {
    db.User.findAll = originalUserFindAll;
    db.ChatMessage.create = originalChatCreate;
    db.ChatMessage.findByPk = originalChatFindByPk;
    db.Notification.bulkCreate = originalNotificationBulkCreate;
  }
});
