const { Op } = require("sequelize");
const { DEPARTMENTS, POSITIONS } = require("../../shared/organization");
const { isManager } = require("./permissions");
const {
  lowerPositions,
  visibleUserIds,
  assignableUserIds,
  buildTaskQuery,
  buildTicketScope,
} = require("./queryFilters");

const STATUS_GROUPS = Object.freeze({
  PENDING: ["Pending", "TODO", "Open"],
  IN_PROGRESS: ["In-Progress", "IN_PROGRESS"],
  IN_REVIEW: ["IN_REVIEW"],
  DONE: ["Completed", "DONE", "Resolved", "Closed"],
  BLOCKED: ["BLOCKED"],
});

const PRIORITY_GROUPS = Object.freeze({
  LOW: { task: ["Low", "LOW"], ticket: ["LOW"] },
  MEDIUM: { task: ["Medium", "MEDIUM"], ticket: ["P2", "MEDIUM"] },
  HIGH: { task: ["High", "HIGH"], ticket: ["P1", "HIGH"] },
  URGENT: { task: ["Urgent", "URGENT"], ticket: ["P0", "URGENT"] },
});

const TERMINAL_STATUSES = ["Completed", "DONE", "Resolved", "Closed"];
const ASSIGNEE_POSITIONS = POSITIONS;

const andWhere = (conditions) => ({ [Op.and]: conditions });

async function createWorkItemScope({ actor, User, Task, Ticket }) {
  const [visibleIds, hierarchicalAssignees, taskScope, ticketScope] = await Promise.all([
    visibleUserIds(User, actor),
    assignableUserIds(User, actor),
    buildTaskQuery({ actor, User, filters: {} }).then(({ where }) => where),
    buildTicketScope({ actor, User }).then(({ where }) => where),
  ]);
  const [taskCreators, taskAssignees, ticketCreators] = await Promise.all([
    Task.findAll({
      attributes: ["createdById"],
      where: taskScope,
      group: ["createdById"],
      raw: true,
    }),
    Task.findAll({
      attributes: ["assignedById"],
      where: taskScope,
      group: ["assignedById"],
      raw: true,
    }),
    Ticket.findAll({
      attributes: ["createdBy"],
      where: ticketScope,
      group: ["createdBy"],
      raw: true,
    }),
  ]);
  const creatorIds = [...new Set([
    ...taskCreators.map(({ createdById }) => createdById),
    ...taskAssignees.map(({ assignedById }) => assignedById),
    ...ticketCreators.map(({ createdBy }) => createdBy),
  ].filter((id) => id !== null && id !== undefined).map(Number))];
  const assignableIds = isManager(actor) || lowerPositions(actor).length
    ? hierarchicalAssignees
    : visibleIds;
  const activeUsers = assignableIds.length
    ? await User.findAll({
      where: {
        id: { [Op.in]: assignableIds },
        status: "ACTIVE",
        isActive: true,
      },
      attributes: ["id", "name", "department", "position"],
      order: [["name", "ASC"]],
      raw: true,
    })
    : [];
  return { visibleIds, assignableIds, creatorIds, activeUsers, taskScope, ticketScope };
}

async function buildWorkItemWhere({ view, actor, User, scope, filters, includeStatus = true }) {
  const conditions = [
    view === "tasks"
      ? scope.taskScope
      : scope.ticketScope,
  ];

  if (filters.assignedTo) {
    conditions.push({
      assignedTo: scope.assignableIds.includes(Number(filters.assignedTo))
        ? Number(filters.assignedTo)
        : { [Op.in]: [] },
    });
  }

  if (filters.createdBy) {
    const creatorId = Number(filters.createdBy);
    if (!scope.creatorIds.includes(creatorId)) {
      conditions.push({ [view === "tasks" ? "createdById" : "createdBy"]: { [Op.in]: [] } });
    } else if (view === "tasks") {
      conditions.push({
        [Op.or]: [{ createdById: creatorId }, { assignedById: creatorId }],
      });
    } else {
      conditions.push({ createdBy: creatorId });
    }
  }

  if (filters.assigneePosition?.length) {
    const actorPositions = isManager(actor) ? ASSIGNEE_POSITIONS : lowerPositions(actor);
    const positions = filters.assigneePosition.filter((position) => actorPositions.includes(position));
    const positionUsers = positions.length
      ? await User.findAll({
        where: {
          position: { [Op.in]: positions },
          ...(isManager(actor)
            ? {}
            : { department: actor.department, id: { [Op.in]: scope.assignableIds } }),
        },
        attributes: ["id"],
        raw: true,
      })
      : [];
    conditions.push({ assignedTo: { [Op.in]: positionUsers.map(({ id }) => Number(id)) } });
  }

  if (filters.department?.length) {
    if (isManager(actor)) {
      const selectedDepartments = filters.department.filter((department) =>
        DEPARTMENTS.includes(department),
      );
      conditions.push({
        department: selectedDepartments.length ? { [Op.in]: selectedDepartments } : { [Op.in]: [] },
      });
    }
  }

  if (filters.priority?.length) {
    const values = [...new Set(filters.priority.flatMap((priority) => PRIORITY_GROUPS[priority][view]))];
    conditions.push({ priority: { [Op.in]: values } });
  }

  if (includeStatus && filters.status && filters.status !== "ALL") {
    conditions.push({ status: { [Op.in]: STATUS_GROUPS[filters.status] } });
  }

  const deadlineField = view === "tasks" ? "dueDate" : "deadline";
  if (filters.deadlineFrom || filters.deadlineTo) {
    const deadline = {};
    if (filters.deadlineFrom) deadline[Op.gte] = filters.deadlineFrom;
    if (filters.deadlineTo) deadline[Op.lte] = filters.deadlineTo;
    conditions.push({ [deadlineField]: deadline });
  }

  if (filters.createdFrom || filters.createdTo) {
    const createdAt = {};
    if (filters.createdFrom) createdAt[Op.gte] = new Date(`${filters.createdFrom}T00:00:00.000Z`);
    if (filters.createdTo) {
      const end = new Date(`${filters.createdTo}T00:00:00.000Z`);
      end.setUTCDate(end.getUTCDate() + 1);
      createdAt[Op.lt] = end;
    }
    conditions.push({ createdAt });
  }

  if (filters.overdue === "true") {
    conditions.push(
      { [deadlineField]: { [Op.lt]: new Date().toISOString().slice(0, 10) } },
      { status: { [Op.notIn]: TERMINAL_STATUSES } },
    );
  } else if (filters.overdue === "false") {
    conditions.push({
      [Op.or]: [
        { status: { [Op.in]: TERMINAL_STATUSES } },
        { [deadlineField]: null },
        { [deadlineField]: { [Op.gte]: new Date().toISOString().slice(0, 10) } },
      ],
    });
  }

  if (filters.search) {
    const term = filters.search.trim();
    const clauses = [
      { title: { [Op.like]: `%${term}%` } },
      { description: { [Op.like]: `%${term}%` } },
      { "$assignee.name$": { [Op.like]: `%${term}%` } },
      { "$assignee.employeeId$": { [Op.like]: `%${term}%` } },
    ];
    if (/^\d+$/.test(term)) {
      clauses.push({ id: Number(term) });
      if (view === "tickets") clauses.push({ ticketId: { [Op.like]: `%${term}%` } });
    }
    conditions.push({ [Op.or]: clauses });
  }

  return andWhere(conditions);
}

function getStatusGroup(status) {
  return Object.entries(STATUS_GROUPS).find(([, values]) => values.includes(status))?.[0];
}

function getPriorityGroup(priority, view) {
  return Object.entries(PRIORITY_GROUPS).find(([, values]) =>
    values[view].includes(priority),
  )?.[0];
}

function normalizeWorkItem(item, view) {
  const task = view === "tasks";
  const raw = item.get({ plain: true });
  const creator = task ? raw.creator || raw.assignedByUser : raw.creator;
  return {
    type: task ? "task" : "ticket",
    id: raw.id,
    referenceId: task ? `TASK-${raw.id}` : raw.ticketId,
    title: raw.title,
    assignedTo: raw.assignee
      ? {
        id: raw.assignee.id,
        name: raw.assignee.name,
        department: raw.assignee.department,
        position: raw.assignee.position,
      }
      : null,
    createdBy: creator
      ? { id: creator.id, name: creator.name, position: creator.position }
      : null,
    createdAt: raw.createdAt,
    department: raw.department,
    priority: getPriorityGroup(raw.priority, view) || raw.priority,
    rawPriority: raw.priority,
    deadline: task ? raw.dueDate : raw.deadline,
    status: getStatusGroup(raw.status) || raw.status,
    rawStatus: raw.status,
  };
}

module.exports = {
  ASSIGNEE_POSITIONS,
  STATUS_GROUPS,
  PRIORITY_GROUPS,
  createWorkItemScope,
  buildWorkItemWhere,
  getStatusGroup,
  getPriorityGroup,
  normalizeWorkItem,
};
