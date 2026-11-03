const test = require("node:test");
const assert = require("node:assert/strict");
const { Op } = require("sequelize");
const {
  visibleUserWhere,
  visibleUserIds,
  assignableUserIds,
  buildTaskQuery,
  buildTicketQuery,
} = require("../lib/queryFilters");

const User = {
  async findAll(options = {}) {
    if (options.attributes?.includes("reportsToId")) {
      return [
        { id: 2, reportsToId: 1 },
        { id: 3, reportsToId: 2 },
        { id: 4, reportsToId: 8 },
      ];
    }
    return [{ id: 1 }, { id: 2 }];
  },
};

const lead = {
  id: 1,
  department: "Development",
  position: "TEAM_LEAD",
  permissions: ["task:assign", "ticket:assign"],
};

test("task filters can narrow, but cannot widen, the visible assignee scope", async () => {
  const allowed = await buildTaskQuery({
    actor: lead,
    User,
    filters: { assignedTo: "2" },
  });
  assert.equal(
    allowed.where[Op.and].find((condition) => condition.assignedTo === 2).assignedTo,
    2
  );

  const denied = await buildTaskQuery({
    actor: lead,
    User,
    filters: { assignedTo: "99" },
  });
  const deniedAssignee = denied.where[Op.and]
    .find((condition) =>
      Array.isArray(condition.assignedTo?.[Op.in]) &&
      condition.assignedTo[Op.in].length === 0
    ).assignedTo;
  assert.deepEqual(deniedAssignee[Op.in], []);
});

test("ticket query filters preserve department and visibility constraints", async () => {
  const { where } = await buildTicketQuery({
    actor: lead,
    User,
    filters: { assignee: "99", view: "assigned" },
  });

  const conditions = where[Op.and];
  const scope = conditions[0];
  assert.equal(scope.department, "Development");
  assert.equal(
    conditions.some((condition) => condition.assignedTo === lead.id),
    true
  );
  assert.ok(Array.isArray(scope[Op.or]));
  assert.deepEqual(
    conditions.find((condition) =>
      Array.isArray(condition.assignedTo?.[Op.in]) &&
      condition.assignedTo[Op.in].length === 0
    )?.assignedTo[Op.in],
    []
  );
});

test("Manager ticket scope is global unless narrowed by an explicit filter", async () => {
  const { where } = await buildTicketQuery({
    actor: { ...lead, position: "MANAGER" },
    User,
    filters: { view: "created" },
  });

  const conditions = where[Op.and];
  assert.equal(conditions.some((condition) => condition.createdBy === lead.id), true);
  assert.equal(conditions[0].department, undefined);
  assert.equal(conditions[0][Op.or], undefined);
});

test("team search excludes the Manager's own account", () => {
  const where = visibleUserWhere(
    { ...lead, position: "MANAGER" },
    { includeSelf: false }
  );
  assert.deepEqual(where.id, { [Op.ne]: lead.id });
});

test("department filters cannot widen a Sub Manager's assigned-user scope", async () => {
  const { where } = await buildTaskQuery({
    actor: { ...lead, position: "SUB_MANAGER" },
    User,
    filters: { department: "Legal" },
  });
  const conditions = where[Op.and];
  assert.equal(conditions.some((condition) => condition.department === "Development"), true);
  assert.equal(conditions.some((condition) => condition.department === "Legal"), false);
  assert.deepEqual(
    conditions.find((condition) => condition.assignedTo)?.assignedTo[Op.in],
    [1, 2],
  );
});

test("Intern hierarchy scope is empty for team-member search", () => {
  const intern = { id: 8, department: "Development", position: "INTERN" };
  const where = visibleUserWhere(intern, { includeSelf: false });
  assert.deepEqual(where.id[Op.in], []);
});

test("Team Lead visibility follows their reporting tree rather than department peers", async () => {
  assert.deepEqual(
    (await visibleUserIds(User, lead)).sort((left, right) => left - right),
    [1, 2, 3],
  );
  assert.deepEqual(
    (await visibleUserIds(User, lead, { includeSelf: false })).sort((left, right) => left - right),
    [2, 3],
  );
});

test("Team Lead assignment options exclude same-department peers outside their reporting tree", async () => {
  assert.deepEqual(
    (await assignableUserIds(User, lead)).sort((left, right) => left - right),
    [2, 3],
  );
});
