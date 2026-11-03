const { Op } = require("sequelize");
const db = require("../models");
const { DEPARTMENTS } = require("../../shared/organization");
const { lowerPositions } = require("../lib/queryFilters");
const {
  ASSIGNEE_POSITIONS,
  createWorkItemScope,
  buildWorkItemWhere,
  getStatusGroup,
  normalizeWorkItem,
} = require("../lib/workItemQueries");

const Task = db.Task;
const Ticket = db.Ticket;
const User = db.User;

const statusKeys = ["PENDING", "IN_PROGRESS", "IN_REVIEW", "DONE", "BLOCKED"];

function assigneeScopeInclude() {
  return [{ model: User, as: "assignee", attributes: [], required: false }];
}

function combinePriorityOrder(view, direction) {
  const values = view === "tasks"
    ? "'Urgent', 'URGENT', 'High', 'HIGH', 'Medium', 'MEDIUM', 'Low', 'LOW'"
    : "'P0', 'URGENT', 'P1', 'HIGH', 'P2', 'MEDIUM', 'LOW'";
  return db.sequelize.literal(`FIELD(${view === "tasks" ? "Task" : "Ticket"}.priority, ${values}) ${direction}`);
}

function orderBy(view, sortBy, sortOrder) {
  const modelName = view === "tasks" ? "Task" : "Ticket";
  const deadlineField = view === "tasks" ? "dueDate" : "deadline";
  if (sortBy === "priority") {
    return [[combinePriorityOrder(view, sortOrder)], ["createdAt", "DESC"]];
  }
  if (sortBy === "createdAt") {
    return [["createdAt", sortOrder], ["id", "DESC"]];
  }
  if (view === "tickets") {
    return [
      [db.sequelize.literal(`${modelName}.deadline IS NULL ASC`)],
      [deadlineField, sortOrder],
      ["createdAt", "DESC"],
    ];
  }
  return [[deadlineField, sortOrder], ["createdAt", "DESC"]];
}

async function statusCounts(Model, view, actor, User, scope, filters) {
  const where = await buildWorkItemWhere({
    view,
    actor,
    User,
    scope,
    filters: { ...filters, status: "ALL" },
    includeStatus: false,
  });
  const grouped = await Model.findAll({
    attributes: [
      "status",
      [db.sequelize.fn("COUNT", db.sequelize.col(`${Model.name}.id`)), "count"],
    ],
    where,
    include: assigneeScopeInclude(),
    group: [db.sequelize.col(`${Model.name}.status`)],
    raw: true,
  });
  const counts = Object.fromEntries([...statusKeys, "ALL"].map((key) => [key, 0]));
  for (const row of grouped) {
    const bucket = getStatusGroup(row.status);
    if (bucket) counts[bucket] += Number(row.count);
  }
  counts.ALL = statusKeys.reduce((total, key) => total + counts[key], 0);
  return counts;
}

async function listWorkItems(req, res) {
  try {
    const query = req.validatedQuery;
    const { view, page, pageSize, sortBy, sortOrder } = query;
    const Model = view === "tasks" ? Task : Ticket;
    const scope = await createWorkItemScope({ actor: req.user, User, Task, Ticket });
    const [where, counts, taskCountWhere, ticketCountWhere] = await Promise.all([
      buildWorkItemWhere({ view, actor: req.user, User, scope, filters: query }),
      statusCounts(Model, view, req.user, User, scope, query),
      buildWorkItemWhere({
        view: "tasks",
        actor: req.user,
        User,
        scope,
        filters: { ...query, status: "ALL" },
        includeStatus: false,
      }),
      buildWorkItemWhere({
        view: "tickets",
        actor: req.user,
        User,
        scope,
        filters: { ...query, status: "ALL" },
        includeStatus: false,
      }),
    ]);

    const taskCount = await Task.count({
      where: taskCountWhere,
      include: assigneeScopeInclude(),
      distinct: true,
    });
    const ticketCount = await Ticket.count({
      where: ticketCountWhere,
      include: assigneeScopeInclude(),
      distinct: true,
    });
    const [total, rows, creators] = await Promise.all([
      Model.count({
        where,
        include: assigneeScopeInclude(),
        distinct: true,
      }),
      Model.findAll({
        where,
        attributes: view === "tasks"
          ? ["id", "title", "description", "status", "priority", "department", "dueDate", "createdAt", "assignedTo", "assignedById", "createdById"]
          : ["id", "ticketId", "title", "description", "status", "priority", "department", "deadline", "createdAt", "assignedTo", "createdBy"],
        include: view === "tasks"
          ? [
            { model: User, as: "assignee", attributes: ["id", "name", "department", "position"], required: false },
            { model: User, as: "creator", attributes: ["id", "name", "position"], required: false },
            { model: User, as: "assignedByUser", attributes: ["id", "name", "position"], required: false },
          ]
          : [
            { model: User, as: "assignee", attributes: ["id", "name", "department", "position"], required: false },
            { model: User, as: "creator", attributes: ["id", "name", "position"], required: false },
          ],
        order: orderBy(view, sortBy, sortOrder),
        limit: pageSize,
        offset: (page - 1) * pageSize,
      }),
      User.findAll({
        where: { id: { [Op.in]: scope.creatorIds } },
        attributes: ["id", "name", "department", "position"],
        order: [["name", "ASC"]],
        raw: true,
      }),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        data: rows.map((row) => normalizeWorkItem(row, view)),
        total,
        page,
        pageSize,
        counts: {
          pending: counts.PENDING,
          inProgress: counts.IN_PROGRESS,
          inReview: counts.IN_REVIEW,
          done: counts.DONE,
          blocked: counts.BLOCKED,
          all: counts.ALL,
        },
        viewCounts: { tasks: taskCount, tickets: ticketCount },
        filterOptions: {
          assignees: scope.activeUsers,
          creators,
          departments: req.user.position === "MANAGER"
            ? DEPARTMENTS
            : [req.user.department],
          positions: req.user.position === "MANAGER"
            ? ASSIGNEE_POSITIONS
            : ASSIGNEE_POSITIONS.filter((position) => lowerPositions(req.user).includes(position)),
        },
      },
    });
  } catch (error) {
    console.error("List work items failed:", error);
    return res.status(500).json({
      ok: false,
      error: { code: "WORK_ITEMS_UNAVAILABLE", message: "Work items could not be loaded." },
      success: false,
      message: "Work items could not be loaded.",
    });
  }
}

module.exports = { listWorkItems };
