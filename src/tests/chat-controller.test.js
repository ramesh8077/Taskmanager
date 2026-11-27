const test = require("node:test");
const assert = require("node:assert/strict");
const db = require("../models");
const chatController = require("../controllers/chatController");
const { buildReceiptSummary, resolveAttachmentMeta } = require("../lib/chatHelpers");
const { shouldSendPushForNotification } = require("../lib/pushNotifications");

function createMockRes() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    sent: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(key, value) {
      this.headers[key] = value;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    send(payload) {
      this.sent = payload;
      return this;
    },
  };
}

test("listMessages returns latest messages in ascending chronological order (newest last)", async () => {
  const originalFindAll = db.ChatMessage.findAll;
  const originalUserCount = db.User.count;
  let capturedOptions = null;

  db.User.count = async () => 3;
  db.ChatMessage.findAll = async (options) => {
    capturedOptions = options;
    return [
      { id: 12, userId: 1, message: "latest", createdAt: "2026-11-27T10:02:00Z" },
      { id: 11, userId: 1, message: "middle", createdAt: "2026-11-27T10:01:00Z" },
      { id: 10, userId: 1, message: "oldest", createdAt: "2026-11-27T10:00:00Z" },
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
    db.User.count = originalUserCount;
  }
});

test("listMessages supports ?after= cursor in ascending order for incremental realtime sync", async () => {
  const originalFindAll = db.ChatMessage.findAll;
  const originalUserCount = db.User.count;
  let capturedOptions = null;

  db.User.count = async () => 3;
  db.ChatMessage.findAll = async (options) => {
    capturedOptions = options;
    return [
      { id: 13, userId: 2, message: "new 1", createdAt: "2026-11-27T10:03:00Z" },
      { id: 14, userId: 2, message: "new 2", createdAt: "2026-11-27T10:04:00Z" },
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
    db.User.count = originalUserCount;
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
  const originalTransaction = db.sequelize.transaction;
  let capturedNotifications = [];

  db.sequelize.transaction = async (cb) => cb({ fake: true });
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
    createdAt: "2026-11-27T10:05:00Z",
    author: { id: 1, name: "Ramesh" },
    attachments: [],
    receipts: [],
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
    db.sequelize.transaction = originalTransaction;
  }
});

test("createMessage supports replyToId and voice/media attachments without text", async () => {
  const originalUserFindAll = db.User.findAll;
  const originalChatCreate = db.ChatMessage.create;
  const originalChatFindByPk = db.ChatMessage.findByPk;
  const originalAttachmentCreate = db.ChatAttachment.create;
  const originalNotificationBulkCreate = db.Notification.bulkCreate;
  const originalTransaction = db.sequelize.transaction;

  let createdMsgPayload = null;
  const createdAttachments = [];
  db.sequelize.transaction = async (cb) => cb({ fake: true });
  db.User.findAll = async () => [
    { id: 1, name: "Ramesh" },
    { id: 2, name: "Nisha" },
  ];
  db.ChatMessage.create = async (payload) => {
    createdMsgPayload = payload;
    return { id: 99 };
  };
  db.ChatAttachment.create = async (row) => {
    const created = { id: createdAttachments.length + 1, ...row };
    createdAttachments.push(created);
    return created;
  };
  db.ChatMessage.findByPk = async (id) => {
    if (id === 40) return { id: 40 };
    return {
      id: 99,
      userId: 1,
      replyToId: 40,
      messageType: "audio",
      message: "",
      mentions: [],
      createdAt: "2026-11-27T10:10:00Z",
      author: { id: 1, name: "Ramesh" },
      replyTo: { id: 40, userId: 2, message: "Please send voice update", author: { id: 2, name: "Nisha" }, attachments: [] },
      attachments: [{ id: 7, messageId: 99, category: "audio", fileName: "voice.webm", mimeType: "audio/webm", fileSize: 1200, durationSeconds: 8 }],
      receipts: [],
    };
  };
  db.Notification.bulkCreate = async () => [];

  try {
    const res = createMockRes();
    await chatController.createMessage(
      {
        user: { id: 1, name: "Ramesh" },
        body: { message: "", replyToId: "40", durations: "[8]" },
        files: [
          {
            originalname: "voice.webm",
            mimetype: "audio/webm;codecs=opus",
            size: 1200,
            buffer: Buffer.from("webm-audio"),
          },
        ],
      },
      res
    );
    assert.equal(res.statusCode, 201);
    assert.equal(createdMsgPayload.replyToId, 40);
    assert.equal(createdMsgPayload.messageType, "audio");
    assert.equal(createdAttachments.length, 1);
    assert.equal(createdAttachments[0].mimeType, "audio/webm");
    assert.equal(createdAttachments[0].durationSeconds, 8);
    assert.equal(res.body.data.message.replyTo.id, 40);
    assert.equal(res.body.data.message.receiptSummary.tickState, "sent");
  } finally {
    db.User.findAll = originalUserFindAll;
    db.ChatMessage.create = originalChatCreate;
    db.ChatMessage.findByPk = originalChatFindByPk;
    db.ChatAttachment.create = originalAttachmentCreate;
    db.Notification.bulkCreate = originalNotificationBulkCreate;
    db.sequelize.transaction = originalTransaction;
  }
});

test("createMessage chunks attachments larger than 3 MB and getAttachment reassembles them", async () => {
  const originalUserFindAll = db.User.findAll;
  const originalChatCreate = db.ChatMessage.create;
  const originalChatFindByPk = db.ChatMessage.findByPk;
  const originalAttachmentCreate = db.ChatAttachment.create;
  const originalAttachmentFindByPk = db.ChatAttachment.findByPk;
  const originalChunkCreate = db.ChatAttachmentChunk.create;
  const originalChunkFindAll = db.ChatAttachmentChunk.findAll;
  const originalNotificationBulkCreate = db.Notification.bulkCreate;
  const originalTransaction = db.sequelize.transaction;

  const bigBuffer = Buffer.alloc(3.5 * 1024 * 1024, 0x42);
  let storedAttachment = null;
  const storedChunks = [];

  db.sequelize.transaction = async (cb) => cb({ fake: true });
  db.User.findAll = async () => [{ id: 1, name: "Ramesh" }];
  db.ChatMessage.create = async () => ({ id: 201 });
  db.ChatAttachment.create = async (row) => {
    storedAttachment = { id: 501, ...row };
    return storedAttachment;
  };
  db.ChatAttachmentChunk.create = async (row) => {
    storedChunks.push(row);
    return row;
  };
  db.ChatMessage.findByPk = async () => ({
    id: 201,
    userId: 1,
    messageType: "image",
    message: "",
    mentions: [],
    createdAt: "2026-11-27T11:00:00Z",
    author: { id: 1, name: "Ramesh" },
    attachments: [{ id: 501, messageId: 201, category: "image", fileName: "large.png", mimeType: "image/png", fileSize: bigBuffer.length }],
    receipts: [],
  });
  db.Notification.bulkCreate = async () => [];
  db.ChatAttachment.findByPk = async () => storedAttachment;
  db.ChatAttachmentChunk.findAll = async () => storedChunks.map((c) => ({ chunkData: c.chunkData }));

  try {
    const createRes = createMockRes();
    await chatController.createMessage(
      {
        user: { id: 1, name: "Ramesh" },
        body: { message: "" },
        files: [{ originalname: "large.png", mimetype: "image/png", size: bigBuffer.length, buffer: bigBuffer }],
      },
      createRes
    );
    assert.equal(createRes.statusCode, 201);
    assert.equal(storedAttachment.isChunked, true);
    assert.equal(storedAttachment.fileData, null);
    assert.equal(storedChunks.length, 2);

    const downloadRes = createMockRes();
    await chatController.getAttachment({ params: { attachmentId: "501" }, query: { download: "1" } }, downloadRes);
    assert.equal(downloadRes.statusCode, 200);
    assert.equal(downloadRes.sent.length, bigBuffer.length);
  } finally {
    db.User.findAll = originalUserFindAll;
    db.ChatMessage.create = originalChatCreate;
    db.ChatMessage.findByPk = originalChatFindByPk;
    db.ChatAttachment.create = originalAttachmentCreate;
    db.ChatAttachment.findByPk = originalAttachmentFindByPk;
    db.ChatAttachmentChunk.create = originalChunkCreate;
    db.ChatAttachmentChunk.findAll = originalChunkFindAll;
    db.Notification.bulkCreate = originalNotificationBulkCreate;
    db.sequelize.transaction = originalTransaction;
  }
});

test("buildReceiptSummary distinguishes sent, delivered, and seen ticks accurately", () => {
  assert.equal(buildReceiptSummary(1, [], 4).tickState, "sent");
  assert.equal(
    buildReceiptSummary(1, [{ userId: 2, deliveredAt: "2026-11-27T10:00:00Z", seenAt: null }], 4).tickState,
    "delivered"
  );
  assert.equal(
    buildReceiptSummary(
      1,
      [
        { userId: 2, deliveredAt: "2026-11-27T10:00:00Z", seenAt: "2026-11-27T10:01:00Z" },
        { userId: 3, deliveredAt: "2026-11-27T10:00:00Z", seenAt: null },
      ],
      4
    ).tickState,
    "delivered"
  );
  assert.equal(
    buildReceiptSummary(
      1,
      [{ userId: 2, deliveredAt: "2026-11-27T10:00:00Z", seenAt: "2026-11-27T10:01:00Z" }],
      4
    ).tickState,
    "seen"
  );
});

test("getMessageInfo lists seenBy, deliveredTo, and notDeliveredTo recipients cleanly", async () => {
  const originalChatFindByPk = db.ChatMessage.findByPk;
  const originalUserFindAll = db.User.findAll;
  const originalReceiptFindAll = db.ChatMessageReceipt.findAll;

  db.ChatMessage.findByPk = async () => ({
    get: () => ({
      id: 77,
      userId: 1,
      message: "Deploy check",
      messageType: "text",
      createdAt: "2026-11-27T10:00:00Z",
      author: { id: 1, name: "Ramesh" },
      attachments: [],
    }),
  });
  db.User.findAll = async () => [
    { id: 1, name: "Ramesh", role: "manager" },
    { id: 2, name: "Nisha", role: "employee" },
    { id: 3, name: "Amit", role: "employee" },
    { id: 4, name: "Kanika", role: "team_lead" },
  ];
  db.ChatMessageReceipt.findAll = async () => [
    { userId: 2, deliveredAt: "2026-11-27T10:01:00Z", seenAt: "2026-11-27T10:02:00Z" },
    { userId: 3, deliveredAt: "2026-11-27T10:01:30Z", seenAt: null },
  ];

  try {
    const res = createMockRes();
    await chatController.getMessageInfo({ params: { id: "77" }, user: { id: 1 } }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.data.seenBy.map((u) => u.name), ["Nisha"]);
    assert.deepEqual(res.body.data.deliveredTo.map((u) => u.name), ["Amit"]);
    assert.deepEqual(res.body.data.notDeliveredTo.map((u) => u.name), ["Kanika"]);
    assert.equal(res.body.data.notSeenCount, 2);
  } finally {
    db.ChatMessage.findByPk = originalChatFindByPk;
    db.User.findAll = originalUserFindAll;
    db.ChatMessageReceipt.findAll = originalReceiptFindAll;
  }
});

test("getAttachment sends attachment download headers when download=1", async () => {
  const originalFindByPk = db.ChatAttachment.findByPk;
  db.ChatAttachment.findByPk = async () => ({
    id: 15,
    category: "document",
    fileName: "report.pdf",
    mimeType: "application/pdf",
    fileData: Buffer.from("%PDF-1.4 sample"),
  });

  try {
    const res = createMockRes();
    await chatController.getAttachment({ params: { attachmentId: "15" }, query: { download: "1" } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers["Content-Type"], "application/pdf");
    assert.match(res.headers["Content-Disposition"], /^attachment; filename="report\.pdf"/);
    assert.equal(Buffer.isBuffer(res.sent), true);
  } finally {
    db.ChatAttachment.findByPk = originalFindByPk;
  }
});

test("resolveAttachmentMeta supports image, video, audio, and document formats", () => {
  assert.deepEqual(
    resolveAttachmentMeta({ originalname: "photo.png", mimetype: "image/png" }),
    { category: "image", mimeType: "image/png" }
  );
  assert.deepEqual(
    resolveAttachmentMeta({ originalname: "clip.mp4", mimetype: "video/mp4" }),
    { category: "video", mimeType: "video/mp4" }
  );
  assert.deepEqual(
    resolveAttachmentMeta({ originalname: "voice.webm", mimetype: "audio/webm;codecs=opus" }),
    { category: "audio", mimeType: "audio/webm" }
  );
  assert.deepEqual(
    resolveAttachmentMeta({ originalname: "sheet.xlsx", mimetype: "application/octet-stream" }),
    {
      category: "document",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }
  );
});
