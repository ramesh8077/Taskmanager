const test = require("node:test");
const assert = require("node:assert/strict");
const db = require("../models");
const { canManageDeadlines, canEditDeadline } = require("../lib/permissions");
const userController = require("../controllers/userController");
const deadlineExtensionController = require("../controllers/deadlineExtensionController");
const {
  TOOL_DECLARATIONS,
  detectAssistantLanguage,
  executeToolCall,
  runAssistantTurn,
  transcribeVoiceCommand,
} = require("../lib/aiAssistant");

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

test("canManageDeadlines and canEditDeadline respect Manager-granted canExtendDeadline", () => {
  const employeeWithout = { id: 10, position: "EMPLOYEE", department: "Development", canExtendDeadline: false };
  const employeeWith = { id: 10, position: "EMPLOYEE", department: "Development", canExtendDeadline: true };
  const ownTask = { id: 5, assignedTo: 10, assignee: employeeWithout };
  const peerTask = { id: 6, assignedTo: 11, assignee: { id: 11, position: "EMPLOYEE", department: "Development" } };

  assert.equal(canManageDeadlines(employeeWithout), false);
  assert.equal(canEditDeadline(employeeWithout, ownTask), false);

  assert.equal(canManageDeadlines(employeeWith), true);
  assert.equal(canEditDeadline(employeeWith, ownTask), true);
  assert.equal(canEditDeadline(employeeWith, peerTask), false);
});

test("updateMember blocks non-Managers from granting canExtendDeadline", async () => {
  const originalTransaction = db.sequelize.transaction;
  const originalFindByPk = db.User.findByPk;

  db.sequelize.transaction = async (callback) => callback({ LOCK: { UPDATE: "UPDATE" } });
  db.User.findByPk = async () => ({
    id: 12,
    department: "Development",
    position: "EMPLOYEE",
    isActive: true,
    reportsToId: 2,
    canExtendDeadline: false,
    async save() { return this; },
  });

  try {
    const res = createMockRes();
    await userController.updateMember(
      {
        validatedParams: { id: 12 },
        user: { id: 2, position: "TEAM_LEAD", department: "Development" },
        validatedBody: { canExtendDeadline: true },
      },
      res,
    );
    assert.equal(res.statusCode, 403);
    assert.match(res.body.message, /Manager/i);
  } finally {
    db.sequelize.transaction = originalTransaction;
    db.User.findByPk = originalFindByPk;
  }
});

test("deadlineExtensionController allows Interns and notifies their reporting manager", async () => {
  const originalTaskFindOne = db.Task.findOne;
  const originalTransaction = db.sequelize.transaction;
  const originalReqFindOne = db.DeadlineExtensionRequest.findOne;
  const originalReqCreate = db.DeadlineExtensionRequest.create;
  const originalUserFindOne = db.User.findOne;
  const originalNotificationBulk = db.Notification.bulkCreate;

  let createdNotifications = [];
  db.Task.findOne = async () => ({
    id: 21,
    title: "Prepare test report",
    dueDate: "2026-12-01",
    assignedTo: 15,
    status: "In-Progress",
  });
  db.sequelize.transaction = async (callback) => callback({ LOCK: { UPDATE: "UPDATE" } });
  db.DeadlineExtensionRequest.findOne = async () => null;
  db.DeadlineExtensionRequest.create = async (row) => ({ id: 88, ...row });
  db.User.findOne = async () => ({ id: 4, name: "Priya Lead", position: "TEAM_LEAD" });
  db.Notification.bulkCreate = async (rows) => {
    createdNotifications = rows;
    return rows;
  };

  try {
    const res = createMockRes();
    await deadlineExtensionController.createRequest(
      {
        validatedParams: { id: 21 },
        user: { id: 15, name: "Rohan Intern", position: "INTERN", reportsToId: 4 },
        body: { requestedDeadline: "2026-12-10", reason: "Need extra QA verification time." },
      },
      res,
    );
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.data.reportingTo.id, 4);
    assert.equal(createdNotifications.length, 1);
    assert.equal(createdNotifications[0].userId, 4);
    assert.equal(createdNotifications[0].link, "/dashboard/deadline-requests");
  } finally {
    db.Task.findOne = originalTaskFindOne;
    db.sequelize.transaction = originalTransaction;
    db.DeadlineExtensionRequest.findOne = originalReqFindOne;
    db.DeadlineExtensionRequest.create = originalReqCreate;
    db.User.findOne = originalUserFindOne;
    db.Notification.bulkCreate = originalNotificationBulk;
  }
});

test("AI extend_task_deadline returns DEADLINE_PERMISSION_REQUIRED and queues Send Request action when unauthorized", async () => {
  const originalUserFindAll = db.User.findAll;
  const originalTaskFindOne = db.Task.findOne;
  const originalUserFindOne = db.User.findOne;
  const originalReqFindOne = db.DeadlineExtensionRequest.findOne;

  db.User.findAll = async () => [{ id: 15 }];
  db.Task.findOne = async () => ({
    id: 30,
    title: "Landing page polish",
    dueDate: "2026-12-01",
    assignedTo: 15,
    assignee: { id: 15, name: "Rohan", department: "Development", position: "EMPLOYEE" },
  });
  db.User.findOne = async () => ({ id: 3, name: "Amit SubManager", position: "SUB_MANAGER", department: "Development" });
  db.DeadlineExtensionRequest.findOne = async () => null;

  const pendingActions = [];
  try {
    const output = await executeToolCall(
      "extend_task_deadline",
      { taskId: 30, newDeadline: "2026-12-08", reason: "Client feedback pending" },
      { id: 15, name: "Rohan", position: "EMPLOYEE", department: "Development", reportsToId: 3, canExtendDeadline: false },
      pendingActions,
    );

    assert.equal(output.ok, false);
    assert.equal(output.code, "DEADLINE_PERMISSION_REQUIRED");
    assert.equal(output.canSendRequest, true);
    assert.equal(output.reportingTo.name, "Amit SubManager");
    assert.equal(pendingActions.length, 1);
    assert.deepEqual(pendingActions[0], {
      type: "SEND_DEADLINE_REQUEST",
      label: "Send Request",
      taskId: 30,
      taskTitle: "Landing page polish",
      currentDeadline: "2026-12-01",
      requestedDeadline: "2026-12-08",
      reason: "Client feedback pending",
      reportingToId: 3,
      reportingToName: "Amit SubManager",
      reportingToPosition: "SUB_MANAGER",
      alreadyPending: false,
    });
  } finally {
    db.User.findAll = originalUserFindAll;
    db.Task.findOne = originalTaskFindOne;
    db.User.findOne = originalUserFindOne;
    db.DeadlineExtensionRequest.findOne = originalReqFindOne;
  }
});

test("runAssistantTurn runs Gemini function calls and returns Send Request action alongside reply", async () => {
  const originalFetch = global.fetch;
  const originalGeminiKey = process.env.GEMINI_API_KEY;
  const originalUserFindOne = db.User.findOne;
  const originalUserFindAll = db.User.findAll;
  const originalTaskFindOne = db.Task.findOne;
  const originalReqFindOne = db.DeadlineExtensionRequest.findOne;

  process.env.GEMINI_API_KEY = "test-gemini-key";
  db.User.findOne = async () => ({ id: 2, name: "Neha Lead", position: "TEAM_LEAD", department: "Development" });
  db.User.findAll = async () => [{ id: 15 }];
  db.Task.findOne = async () => ({
    id: 30,
    title: "API integration",
    dueDate: "2026-12-01",
    assignedTo: 15,
    assignee: { id: 15, name: "Rohan", department: "Development", position: "EMPLOYEE" },
  });
  db.DeadlineExtensionRequest.findOne = async () => null;

  let turn = 0;
  global.fetch = async () => {
    turn += 1;
    if (turn === 1) {
      return new Response(
        JSON.stringify({
          candidates: [
            {
              finishReason: "STOP",
              content: {
                role: "model",
                parts: [
                  {
                    functionCall: {
                      name: "extend_task_deadline",
                      args: { taskId: 30, newDeadline: "2026-12-09", reason: "Testing takes longer" },
                    },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response(
      JSON.stringify({
        candidates: [
          {
            finishReason: "STOP",
            content: {
              role: "model",
              parts: [
                {
                  text: "Aapke paas deadline extend karne ki direct permission nahi hai. Aap neeche 'Send Request' button par click karke Neha Lead ko request bhej sakte hain.",
                },
              ],
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  try {
    const result = await runAssistantTurn({
      actor: {
        id: 15,
        name: "Rohan",
        role: "EMPLOYEE",
        position: "EMPLOYEE",
        department: "Development",
        reportsToId: 2,
        canExtendDeadline: false,
        permissions: ["task:view:own"],
      },
      message: "Task 30 ki deadline 2026-12-09 tak badha do",
    });

    assert.match(result.reply, /Send Request/);
    assert.equal(result.actions.length, 1);
    assert.equal(result.actions[0].type, "SEND_DEADLINE_REQUEST");
    assert.equal(result.actions[0].reportingToName, "Neha Lead");
    assert.deepEqual(result.toolsUsed, ["extend_task_deadline"]);
  } finally {
    global.fetch = originalFetch;
    if (originalGeminiKey !== undefined) process.env.GEMINI_API_KEY = originalGeminiKey;
    else delete process.env.GEMINI_API_KEY;
    db.User.findOne = originalUserFindOne;
    db.User.findAll = originalUserFindAll;
    db.Task.findOne = originalTaskFindOne;
    db.DeadlineExtensionRequest.findOne = originalReqFindOne;
  }
});

test("transcribeVoiceCommand transcribes voice audio via Gemini inlineData", async () => {
  const originalFetch = global.fetch;
  const originalGeminiKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-gemini-key";

  let capturedBody = null;
  global.fetch = async (_url, options) => {
    capturedBody = JSON.parse(options.body);
    return new Response(
      JSON.stringify({
        candidates: [
          { finishReason: "STOP", content: { parts: [{ text: "Mere overdue tasks dikhao" }] } },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  try {
    const transcript = await transcribeVoiceCommand({
      mimetype: "audio/webm",
      buffer: Buffer.from("voice-bytes"),
    });
    assert.equal(transcript, "Mere overdue tasks dikhao");
    assert.equal(capturedBody.contents[0].parts[1].inlineData.mimeType, "audio/webm");
  } finally {
    global.fetch = originalFetch;
    if (originalGeminiKey !== undefined) process.env.GEMINI_API_KEY = originalGeminiKey;
    else delete process.env.GEMINI_API_KEY;
  }
});

test("detectAssistantLanguage separates Hindi/Hinglish from English accurately", () => {
  assert.equal(detectAssistantLanguage("मेरे पेंडिंग टास्क दिखाओ"), "hi");
  assert.equal(detectAssistantLanguage("Mere task ki deadline badha do"), "hi");
  assert.equal(detectAssistantLanguage("Show my pending tasks for today"), "en");
  assert.equal(detectAssistantLanguage("Create a high priority ticket for login bug"), "en");
  assert.ok(TOOL_DECLARATIONS.length >= 20);
});
