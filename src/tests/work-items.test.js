const test = require("node:test");
const assert = require("node:assert/strict");
const { Op } = require("sequelize");
const { workItemListQuery } = require("../validators/schemas");
const {
  STATUS_GROUPS,
  buildWorkItemWhere,
  createWorkItemScope,
  getPriorityGroup,
  getStatusGroup,
} = require("../lib/workItemQueries");

const userModel = {
  async findAll({ where }) {
    const positions = where.position?.[Op.in] || [];
    if (positions.includes("INTERN")) return [{ id: 8 }];
    return [];
  },
};

test("work item query defaults to the Tasks view and Pending status", () => {
  const parsed = workItemListQuery.safeParse({});
  assert.equal(parsed.success, true);
  assert.equal(parsed.data.view, "tasks");
  assert.equal(parsed.data.status, "PENDING");
  assert.equal(parsed.data.sortBy, "deadline");
});

test("work item status groups map the separate model enums consistently", () => {
  assert.ok(STATUS_GROUPS.PENDING.includes("Pending"));
  assert.ok(STATUS_GROUPS.PENDING.includes("Open"));
  assert.equal(getStatusGroup("In-Progress"), "IN_PROGRESS");
  assert.equal(getStatusGroup("Resolved"), "DONE");
  assert.equal(getStatusGroup("BLOCKED"), "BLOCKED");
});

test("priority values from both models normalize for the shared badges", () => {
  assert.equal(getPriorityGroup("P0", "ticket"), "URGENT");
  assert.equal(getPriorityGroup("High", "task"), "HIGH");
  assert.equal(getPriorityGroup("P2", "ticket"), "MEDIUM");
});

test("creator options are derived from records visible through both scopes", async () => {
  const User = {
    async findAll() {
      return [{ id: 3 }, { id: 5 }, { id: 8 }];
    },
  };
  const Task = {
    async findAll({ attributes }) {
      return attributes[0] === "createdById"
        ? [{ createdById: 20 }]
        : [{ assignedById: 21 }];
    },
  };
  const Ticket = {
    async findAll() {
      return [{ createdBy: 22 }];
    },
  };
  const scope = await createWorkItemScope({
    actor: { id: 3, role: "EMPLOYEE", position: "SUB_MANAGER", department: "Development" },
    User,
    Task,
    Ticket,
  });
  assert.deepEqual(scope.creatorIds.sort(), [20, 21, 22]);
});

test("a non-manager cannot use a department URL filter to widen their scoped results", async () => {
  const actor = { id: 3, position: "SUB_MANAGER", department: "Development" };
  const scope = {
    visibleIds: [3, 5, 8],
    assignableIds: [5, 8],
    creatorIds: [3, 5, 8],
    taskScope: {
      [Op.and]: [{ assignedTo: { [Op.in]: [3, 5, 8] } }, { department: "Development" }],
    },
    ticketScope: { department: "Development" },
  };
  const where = await buildWorkItemWhere({
    view: "tasks",
    actor,
    User: userModel,
    scope,
    filters: { status: "ALL", department: ["Legal"] },
  });
  assert.deepEqual(where[Op.and][0], scope.taskScope);
  assert.equal(where[Op.and].some((item) => item.department === "Legal"), false);
});

test("a Team Lead position filter cannot select a Sub Manager", async () => {
  const where = await buildWorkItemWhere({
    view: "tasks",
    actor: { id: 3, position: "TEAM_LEAD", department: "Development" },
    User: userModel,
    scope: {
      visibleIds: [3, 5, 8],
      assignableIds: [5, 8],
      creatorIds: [3, 5, 8],
      taskScope: { department: "Development" },
      ticketScope: { department: "Development" },
    },
    filters: { status: "ALL", assigneePosition: ["SUB_MANAGER"] },
  });
  assert.deepEqual(where[Op.and].find((item) => item.assignedTo)?.assignedTo[Op.in], []);
});
