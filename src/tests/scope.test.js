const test = require("node:test");
const assert = require("node:assert/strict");
const { Op } = require("sequelize");
const {
  scopedTaskQuery,
  scopedTaskByIdQuery,
  scopedProjectQuery,
  scopedTicketQuery,
  scopedTicketByIdQuery,
  scopedUserQuery,
} = require("../lib/scope");
const db = require("../models");
const SequelizeUtils = require("sequelize/lib/utils");

test("super admin receives unrestricted data scopes", () => {
  const user = { id: 1, role: "SUPER_ADMIN" };
  assert.deepEqual(scopedTaskQuery(user), {});
  assert.deepEqual(scopedProjectQuery(user), {});
  assert.deepEqual(scopedTicketQuery(user), {});
  assert.deepEqual(scopedUserQuery(user), {});
});

test("admin task scope is limited to assignments and owned projects", () => {
  const scope = scopedTaskQuery({ id: 4, role: "ADMIN" });
  assert.equal(scope[Op.or].length, 3);
  assert.deepEqual(scope[Op.or][0], { assignedById: 4 });
});

test("employee task scope only matches the authenticated assignee", () => {
  assert.deepEqual(scopedTaskQuery({ id: 11, role: "EMPLOYEE" }), {
    assignedTo: 11,
  });
});

test("admin project, ticket, and user scopes stay within ownership", () => {
  const user = { id: 4, role: "ADMIN" };
  assert.deepEqual(scopedProjectQuery(user), { createdBy: 4 });
  assert.equal(scopedTicketQuery(user)[Op.or].length, 3);
  assert.deepEqual(scopedTicketQuery(user)[Op.or].slice(0, 2), [
    { createdBy: 4 },
    { assignedTo: 4 },
  ]);
  assert.deepEqual(scopedUserQuery(user), {
    createdById: 4,
    role: "EMPLOYEE",
  });
});

test("admin scopes compile to physical owner and assignment columns", () => {
  const taskOptions = {
    where: scopedTaskQuery({ id: 4, role: "ADMIN" }),
    include: [
      { model: db.Project, as: "project", required: false },
      { model: db.User, as: "assignee", required: false },
    ],
    model: db.Task,
  };
  db.Task._validateIncludedElements(taskOptions);
  SequelizeUtils.mapOptionFieldNames(taskOptions, db.Task);
  const taskSql = db.sequelize.dialect.queryGenerator.selectQuery(
    db.Task.getTableName(),
    taskOptions,
    db.Task
  );
  assert.match(taskSql, /`Task`\.`assigned_by_id` = 4/);
  assert.match(taskSql, /`assignee`\.`created_by_id` = 4/);
  assert.match(taskSql, /`project`\.`created_by` = 4/);

  const ticketOptions = {
    where: scopedTicketQuery({ id: 4, role: "ADMIN" }),
    include: [{ model: db.User, as: "assignee", required: false }],
    model: db.Ticket,
  };
  db.Ticket._validateIncludedElements(ticketOptions);
  SequelizeUtils.mapOptionFieldNames(ticketOptions, db.Ticket);
  const ticketSql = db.sequelize.dialect.queryGenerator.selectQuery(
    db.Ticket.getTableName(),
    ticketOptions,
    db.Ticket
  );
  assert.match(ticketSql, /`assignee`\.`created_by_id` = 4/);
});

test("missing identities fail closed", () => {
  assert.deepEqual(scopedTaskQuery(null), { id: { [Op.in]: [] } });
  assert.deepEqual(scopedUserQuery(null), { id: { [Op.in]: [] } });
});

test("identifier lookups compose the resource id with the actor scope", () => {
  const taskWhere = scopedTaskByIdQuery({ id: 4, role: "ADMIN" }, 99);
  assert.equal(taskWhere[Op.and][0].id, 99);
  assert.equal(taskWhere[Op.and][1][Op.or].length, 3);

  const ticketWhere = scopedTicketByIdQuery({ id: 4, role: "ADMIN" }, 33);
  assert.equal(ticketWhere[Op.and][0].id, 33);
  assert.equal(ticketWhere[Op.and][1][Op.or].length, 3);
});
