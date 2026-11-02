const { Op } = require("sequelize");
const { POSITION_RANK } = require("../../shared/organization");
const { isManager } = require("./permissions");

const positionNames = Object.keys(POSITION_RANK);

function lowerPositions(actor) {
  const rank = POSITION_RANK[actor?.position] || 0;
  return positionNames.filter((position) => POSITION_RANK[position] < rank);
}

function visibleUserWhere(actor, { includeSelf = true } = {}) {
  if (!actor) return { id: { [Op.in]: [] } };
  if (isManager(actor)) {
    return includeSelf ? {} : { id: { [Op.ne]: actor.id } };
  }

  const allowed = [];
  const lower = lowerPositions(actor);
  if (lower.length) {
    allowed.push({ department: actor.department, position: { [Op.in]: lower } });
  }
  if (includeSelf) allowed.push({ id: actor.id });
  if (allowed.length) return { [Op.or]: allowed };
  return includeSelf ? { id: actor.id } : { id: { [Op.in]: [] } };
}

async function visibleUserIds(User, actor, { includeSelf = true } = {}) {
  const users = await User.findAll({
    where: visibleUserWhere(actor, { includeSelf }),
    attributes: ["id"],
    raw: true,
  });
  return users.map(({ id }) => Number(id));
}

async function assignableUserIds(User, actor) {
  if (!actor) return [];
  if (isManager(actor)) {
    const users = await User.findAll({
      where: { status: "ACTIVE", isActive: true },
      attributes: ["id"],
      raw: true,
    });
    return users.map(({ id }) => Number(id));
  }
  const positions = lowerPositions(actor);
  if (!positions.length) return [];
  const users = await User.findAll({
    where: {
      department: actor.department,
      position: { [Op.in]: positions },
      status: "ACTIVE",
      isActive: true,
    },
    attributes: ["id"],
    raw: true,
  });
  return users.map(({ id }) => Number(id));
}

async function buildTaskQuery({ actor, User, DeadlineHistory, filters = {} }) {
  const allowedIds = await visibleUserIds(User, actor);
  const conditions = isManager(actor)
    ? []
    : [{ assignedTo: { [Op.in]: allowedIds } }];
  if (filters.status) {
    conditions.push({ status: {
      [Op.in]: filters.status.split(",").map((value) => value.trim()),
    } });
  }
  if (filters.priority) {
    conditions.push({ priority: {
      [Op.in]: filters.priority.split(",").map((value) => value.trim()),
    } });
  }
  if (filters.assignedTo) {
    conditions.push({ assignedTo: allowedIds.includes(Number(filters.assignedTo))
      ? Number(filters.assignedTo)
      : { [Op.in]: [] } });
  }
  if (filters.createdBy) {
    conditions.push({ createdById: allowedIds.includes(Number(filters.createdBy))
      ? Number(filters.createdBy)
      : { [Op.in]: [] } });
  }
  if (filters.assignedToMe === "true") conditions.push({ assignedTo: actor.id });
  if (filters.createdByMe === "true") conditions.push({ createdById: actor.id });
  if (filters.projectId) conditions.push({ projectId: filters.projectId });
  if (filters.ticketTaskIds) {
    conditions.push({ id: { [Op.in]: filters.ticketTaskIds } });
  }
  if (filters.department && (isManager(actor) || filters.department === actor.department)) {
    conditions.push({ department: filters.department });
  }
  if (filters.deadlineFrom || filters.deadlineTo) {
    const dueDate = {};
    if (filters.deadlineFrom) dueDate[Op.gte] = filters.deadlineFrom;
    if (filters.deadlineTo) dueDate[Op.lte] = filters.deadlineTo;
    conditions.push({ dueDate });
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
  if (filters.minProgress !== undefined || filters.maxProgress !== undefined) {
    const progress = {};
    if (filters.minProgress !== undefined) progress[Op.gte] = filters.minProgress;
    if (filters.maxProgress !== undefined) progress[Op.lte] = filters.maxProgress;
    conditions.push({ progress });
  }
  if (filters.assigneePosition) {
    const positionUsers = await User.findAll({
      where: {
        position: filters.assigneePosition,
        ...(isManager(actor) ? {} : { department: actor.department }),
        ...(isManager(actor) ? {} : { id: { [Op.in]: allowedIds } }),
      },
      attributes: ["id"],
      raw: true,
    });
    const positionIds = positionUsers.map(({ id }) => Number(id));
    conditions.push({ assignedTo: { [Op.in]: positionIds } });
  }
  if (filters.overdue === "true") {
    conditions.push(
      { dueDate: { [Op.lt]: new Date().toISOString().slice(0, 10) } },
      { status: { [Op.notIn]: ["Completed", "DONE"] } }
    );
  } else if (filters.overdue === "false") {
    conditions.push({ [Op.or]: [
      { dueDate: { [Op.gte]: new Date().toISOString().slice(0, 10) } },
      { status: { [Op.in]: ["Completed", "DONE"] } },
    ] });
  }
  if (filters.dueWithin48h === "true") {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 2);
    conditions.push(
      { dueDate: { [Op.gte]: start.toISOString().slice(0, 10), [Op.lte]: end.toISOString().slice(0, 10) } },
      { status: { [Op.notIn]: ["Completed", "DONE"] } }
    );
  }
  if (filters.deadlineExtended === "true" && DeadlineHistory) {
    const history = await DeadlineHistory.findAll({
      attributes: ["taskId"],
      group: ["taskId"],
      raw: true,
    });
    conditions.push({ id: { [Op.in]: history.map(({ taskId }) => taskId) } });
  }
  if (filters.deadlineExtended === "false" && DeadlineHistory) {
    const history = await DeadlineHistory.findAll({
      attributes: ["taskId"],
      group: ["taskId"],
      raw: true,
    });
    conditions.push({ id: { [Op.notIn]: history.map(({ taskId }) => taskId) } });
  }
  if (filters.search) {
    const term = filters.search.trim();
    const searchConditions = [
      { title: { [Op.like]: `%${term}%` } },
      { description: { [Op.like]: `%${term}%` } },
      { "$assignee.name$": { [Op.like]: `%${term}%` } },
      { "$assignee.employeeId$": { [Op.like]: `%${term}%` } },
    ];
    if (/^\d+$/.test(term)) searchConditions.push({ id: Number(term) });
    conditions.push({ [Op.or]: searchConditions });
  }
  return {
    where: conditions.length ? { [Op.and]: conditions } : {},
    allowedIds,
    page: Number(filters.page || 1),
    pageSize: Math.min(100, Number(filters.pageSize || 100)),
  };
}

async function buildTicketScope({ actor, User }) {
  const visibleIds = await visibleUserIds(User, actor);
  const where = isManager(actor)
    ? {}
    : {
      [Op.or]: [
        { createdBy: actor?.id || -1 },
        { assignedTo: { [Op.in]: visibleIds } },
      ],
      department: actor.department,
    };
  return { where, visibleIds };
}

async function buildTicketQuery({ actor, User, filters = {} }) {
  const { where: scopeWhere, visibleIds } = await buildTicketScope({ actor, User });
  const conditions = Object.keys(scopeWhere).length ? [scopeWhere] : [];
  if (filters.status) {
    conditions.push({ status: { [Op.in]: filters.status.split(",").map((value) => value.trim()) } });
  }
  if (filters.priority) {
    conditions.push({ priority: { [Op.in]: filters.priority.split(",").map((value) => value.trim()) } });
  }
  if (filters.department) conditions.push({ department: filters.department });
  if (filters.assignee === "unassigned") conditions.push({ assignedTo: null });
  else if (filters.assignee) {
    conditions.push({ assignedTo: visibleIds.includes(Number(filters.assignee))
      ? Number(filters.assignee)
      : { [Op.in]: [] } });
  }
  if (filters.view === "assigned") conditions.push({ assignedTo: actor.id });
  else if (filters.view === "created") conditions.push({ createdBy: actor.id });
  if (filters.overdue === "true") {
    conditions.push(
      { deadline: { [Op.lt]: new Date().toISOString().slice(0, 10) } },
      { status: { [Op.notIn]: ["Resolved", "Closed", "DONE"] } }
    );
  } else if (filters.overdue === "false") {
    conditions.push({
      [Op.or]: [
        { status: { [Op.in]: ["Resolved", "Closed", "DONE"] } },
        { deadline: null },
        { deadline: { [Op.gte]: new Date().toISOString().slice(0, 10) } },
      ],
    });
  }
  if (filters.search) {
    const term = filters.search.trim();
    const clauses = [
      { title: { [Op.like]: `%${term}%` } },
      { "$assignee.name$": { [Op.like]: `%${term}%` } },
      { "$assignee.employeeId$": { [Op.like]: `%${term}%` } },
    ];
    if (/^\d+$/.test(term)) {
      clauses.push({ id: Number(term) });
      clauses.push({ ticketId: { [Op.like]: `%${term}%` } });
    }
    conditions.push({ [Op.or]: clauses });
  }
  return {
    where: conditions.length ? { [Op.and]: conditions } : {},
    page: Number(filters.page || 1),
    pageSize: Number(filters.pageSize || 20),
  };
}

module.exports = {
  lowerPositions,
  visibleUserWhere,
  visibleUserIds,
  assignableUserIds,
  buildTaskQuery,
  buildTicketScope,
  buildTicketQuery,
};
