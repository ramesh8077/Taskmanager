const fs = require("node:fs");
const path = require("node:path");
const { Op } = require("sequelize");
const db = require("../models");
const { isManager, canAssignTask, canEditDeadline } = require("../lib/permissions");
const {
  assignableUserIds,
  buildTicketScope,
  buildTicketQuery,
  visibleUserIds,
} = require("../lib/queryFilters");

const Ticket = db.Ticket;
const User = db.User;
const TicketHistory = db.TicketHistory;
const TicketComment = db.TicketComment;
const TicketAttachment = db.TicketAttachment;
const DeadlineHistory = db.DeadlineHistory;
const Notification = db.Notification;
const Project = db.Project;
const Task = db.Task;

const adminCanManage = isManager;

function canManageTicket(actor, ticket) {
  if (isManager(actor)) return true;
  if (ticket.assignee) return canAssignTask(actor, ticket.assignee);
  return Number(ticket.createdBy) === Number(actor.id);
}

const ticketIncludes = () => [
  { model: User, as: "creator", attributes: ["id", "name", "email"] },
  { model: User, as: "assignee", attributes: ["id", "name", "email"] },
  { model: User, as: "resolver", attributes: ["id", "name"] },
  { model: Project, as: "project", attributes: ["id", "title"] },
  { model: Task, as: "relatedTask", attributes: ["id", "title", "projectId"] },
  {
    model: TicketComment,
    as: "comments",
    separate: true,
    order: [["createdAt", "ASC"]],
    include: [{ model: User, as: "user", attributes: ["id", "name"] }],
  },
  {
    model: TicketHistory,
    as: "history",
    separate: true,
    order: [["createdAt", "ASC"]],
    include: [{ model: User, as: "changedByUser", attributes: ["id", "name"] }],
  },
  {
    model: TicketAttachment,
    as: "attachments",
    separate: true,
    order: [["createdAt", "ASC"]],
    attributes: ["id", "ticketId", "uploadedBy", "fileName", "mimeType", "fileSize", "createdAt"],
    include: [{ model: User, as: "uploader", attributes: ["id", "name"] }],
  },
];

async function redactUnauthorizedLinks(tickets, user) {
  const rows = Array.isArray(tickets) ? tickets : [tickets];
  const projectIds = [...new Set(rows.map((ticket) => ticket.projectId).filter(Boolean))];
  const taskIds = [...new Set(rows.map((ticket) => ticket.taskId).filter(Boolean))];
  const visibleIds = await visibleUserIds(User, user);
  const visibleTasks = visibleIds.length
    ? await Task.findAll({
      where: { assignedTo: { [Op.in]: visibleIds } },
      attributes: ["id", "projectId"],
      raw: true,
    })
    : [];
  const visibleProjectIds = [...new Set(visibleTasks.map((task) => task.projectId).filter(Boolean))];
  const [projects, tasks] = await Promise.all([
    projectIds.length
      ? Project.findAll({
          where: isManager(user)
            ? { id: { [Op.in]: projectIds } }
            : {
              id: { [Op.in]: projectIds },
              [Op.or]: [
                { createdBy: user.id },
                { id: { [Op.in]: visibleProjectIds } },
              ],
            },
          attributes: ["id", "title"],
        })
      : [],
    taskIds.length && visibleIds.length
      ? Task.findAll({
          where: {
            id: { [Op.in]: taskIds },
            assignedTo: { [Op.in]: visibleIds },
          },
          attributes: ["id", "title", "projectId"],
          include: [
            { model: User, as: "assignee", attributes: ["id"], required: false },
            { model: Project, as: "project", attributes: [], required: false },
          ],
        })
      : [],
  ]);
  const projectMap = new Map(projects.map((project) => [project.id, project]));
  const taskMap = new Map(tasks.map((task) => [task.id, task]));

  for (const ticket of rows) {
    const task = ticket.taskId ? taskMap.get(ticket.taskId) : null;
    const project = ticket.projectId ? projectMap.get(ticket.projectId) : null;
    ticket.setDataValue("relatedTask", task || null);
    ticket.setDataValue("project", project || null);
    if (!task) ticket.setDataValue("taskId", null);
    if (!project) ticket.setDataValue("projectId", null);
  }
}

async function notifyUsers(userIds, notification, transaction) {
  const uniqueIds = [...new Set(userIds.filter((id) => id !== null && id !== undefined && Number.isInteger(Number(id))).map(Number))];
  if (!uniqueIds.length) return;
  await Notification.bulkCreate(
    uniqueIds.map((userId) => ({ ...notification, userId })),
    { ignoreDuplicates: true, transaction }
  );
}

async function recordHistory(ticket, actorId, field, oldValue, newValue, action = "updated", transaction) {
  return TicketHistory.create(
    { ticketId: ticket.id, changedBy: actorId, field, oldValue, newValue, action },
    { transaction }
  );
}

async function getScopedTicket(req, id, transaction) {
  const { where } = await buildTicketScope({ actor: req.user, User });
  return Ticket.findOne({
    where: { [Op.and]: [{ id }, where] },
    include: [{ model: User, as: "assignee", attributes: ["id", "name", "department", "position", "createdById"], required: false }],
    transaction,
  });
}

async function emitDeadlineNotifications(now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const deadlineCeiling = new Date(now.getTime() + 2 * 86400000).toISOString().slice(0, 10);
  const tickets = await Ticket.findAll({
    where: {
      status: { [Op.notIn]: ["Resolved", "Closed"] },
      deadline: { [Op.ne]: null, [Op.lte]: deadlineCeiling },
    },
    attributes: ["id", "title", "deadline", "assignedTo", "createdBy"],
  });

  const notifications = [];
  for (const ticket of tickets) {
    const isOverdue = ticket.deadline < today;
    const notification = {
      type: isOverdue ? "ticket_overdue" : "ticket_deadline",
      title: isOverdue ? "Ticket overdue" : "Ticket deadline approaching",
      message: `Ticket #${ticket.id} “${ticket.title}” ${isOverdue ? "is overdue" : `is due ${ticket.deadline}`}.`,
      link: `/dashboard?ticket=${ticket.id}`,
      dedupeKey: isOverdue
        ? `ticket:${ticket.id}:overdue`
        : `ticket:${ticket.id}:deadline:${ticket.deadline}`,
    };
    const recipientIds = [...new Set([ticket.assignedTo, ticket.createdBy].filter(
      (id) => id !== null && id !== undefined && Number.isInteger(Number(id))
    ).map(Number))];
    notifications.push(...recipientIds.map((userId) => ({ ...notification, userId })));
  }
  if (notifications.length) await Notification.bulkCreate(notifications, { ignoreDuplicates: true });
}

async function getTickets(req, res) {
  try {
    const query = req.validatedQuery || req.query;
    const scopeInclude = [{ model: User, as: "assignee", attributes: [], required: false }];
    const [{ where, page, pageSize }, { where: scopeWhere }] = await Promise.all([
      buildTicketQuery({ actor: req.user, User, filters: query }),
      buildTicketScope({ actor: req.user, User }),
    ]);
    const countWhere = scopeWhere;
    const today = new Date().toISOString().slice(0, 10);
    const [total, open, inProgress, resolved, closed, overdueCount] = await Promise.all([
      Ticket.count({ where: countWhere, include: scopeInclude, distinct: true }),
      Ticket.count({ where: { [Op.and]: [countWhere, { status: "Open" }] }, include: scopeInclude, distinct: true }),
      Ticket.count({ where: { [Op.and]: [countWhere, { status: "In-Progress" }] }, include: scopeInclude, distinct: true }),
      Ticket.count({ where: { [Op.and]: [countWhere, { status: "Resolved" }] }, include: scopeInclude, distinct: true }),
      Ticket.count({ where: { [Op.and]: [countWhere, { status: "Closed" }] }, include: scopeInclude, distinct: true }),
      Ticket.count({
        where: { [Op.and]: [countWhere, { deadline: { [Op.lt]: today } }, { status: { [Op.notIn]: ["Resolved", "Closed"] } }] },
        include: scopeInclude,
        distinct: true,
      }),
    ]);

    const priorityOrder = db.sequelize.literal("FIELD(Ticket.priority, 'P0', 'P1', 'P2') ASC");
    let order;
    if (query.sort === "oldest") order = [["createdAt", "ASC"], ["id", "ASC"]];
    else if (query.sort === "priority") order = [[priorityOrder], ["createdAt", "DESC"]];
    else if (query.sort === "deadline") order = [[db.sequelize.literal("Ticket.deadline IS NULL ASC")], ["deadline", "ASC"], ["createdAt", "DESC"]];
    else order = [["createdAt", "DESC"], ["id", "DESC"]];

    const { rows, count } = await Ticket.findAndCountAll({
      where,
      include: [
        { model: User, as: "creator", attributes: ["id", "name", "email"] },
        { model: User, as: "assignee", attributes: ["id", "name", "email"], required: false },
        { model: User, as: "resolver", attributes: ["id", "name"], required: false },
        { model: Project, as: "project", attributes: ["id", "title"], required: false },
        { model: Task, as: "relatedTask", attributes: ["id", "title"], required: false },
      ],
      order,
      limit: pageSize,
      offset: (page - 1) * pageSize,
      distinct: true,
    });
    await redactUnauthorizedLinks(rows, req.user);

    const departments = await Ticket.findAll({
      where: scopeWhere,
      attributes: [[db.sequelize.fn("DISTINCT", db.sequelize.col("department")), "department"]],
      include: [{ model: User, as: "assignee", attributes: [], required: false }],
      order: [["department", "ASC"]],
      raw: true,
    });

    return res.status(200).json({
      success: true,
      data: {
        tickets: rows,
        totalFiltered: count,
        totalAbsolute: total,
        summary: { total, open, inProgress, resolved, closed, overdue: overdueCount },
        departments: departments.map((row) => row.department),
        page,
        pageSize,
        pageCount: Math.max(1, Math.ceil(count / pageSize)),
      },
    });
  } catch (error) {
    console.error("❌ Get Tickets Error:", error);
    return res.status(500).json({ success: false, message: "Internal server error while fetching tickets." });
  }
}

async function getTicketDetails(req, res) {
  try {
    const { id } = req.validatedParams || req.params;
    const { where } = await buildTicketScope({ actor: req.user, User });
    const ticket = await Ticket.findOne({
      where: { [Op.and]: [{ id }, where] },
      include: ticketIncludes(),
    });
    if (!ticket) return res.status(404).json({ success: false, message: "Ticket not found." });
    await redactUnauthorizedLinks(ticket, req.user);
    return res.status(200).json({ success: true, data: { ticket } });
  } catch (error) {
    console.error("❌ Get Ticket Details Error:", error);
    return res.status(500).json({ success: false, message: "Internal server error while fetching ticket details." });
  }
}

async function assignTicket(req, res) {
  try {
    const { id } = req.validatedParams || req.params;
    const { assignedTo } = req.body;
    const ticket = await getScopedTicket(req, id);
    if (!ticket) return res.status(404).json({ success: false, message: "Ticket not found." });
    if (!canManageTicket(req.user, ticket)) {
      return res.status(403).json({ success: false, message: "You cannot reassign this ticket." });
    }
    let assignee = null;
    if (assignedTo !== null) {
      const allowedIds = await assignableUserIds(User, req.user);
      assignee = await User.findOne({
        where: { id: assignedTo, status: "ACTIVE", isActive: true, ...(Number(assignedTo) === Number(req.user.id) ? {} : { id: { [Op.in]: allowedIds } }) },
        attributes: ["id", "name", "department", "position"],
      });
      if (!assignee || (Number(assignedTo) !== Number(req.user.id) && !canAssignTask(req.user, assignee))) {
        return res.status(404).json({ success: false, message: "Assignee is outside your permitted team." });
      }
    }
    const oldAssignedTo = ticket.assignedTo;
    if (oldAssignedTo === (assignee?.id ?? null)) {
      return res.status(200).json({ success: true, data: { ticket } });
    }
    await db.sequelize.transaction(async (transaction) => {
      ticket.assignedTo = assignee?.id ?? null;
      await ticket.save({ transaction });
      const oldAssignee = oldAssignedTo ? await User.findByPk(oldAssignedTo, { attributes: ["name"], transaction }) : null;
      await recordHistory(ticket, req.user.id, "assignedTo", oldAssignee?.name || "Unassigned", assignee?.name || "Unassigned", "reassigned", transaction);
      if (assignee) {
        await notifyUsers([assignee.id], {
          type: "ticket_assigned",
          title: "Ticket assigned to you",
          message: `Ticket #${ticket.id} “${ticket.title}” was assigned to you.`,
          link: `/dashboard?ticket=${ticket.id}`,
          dedupeKey: `ticket:${ticket.id}:assigned:${ticket.updatedAt?.getTime() || Date.now()}`,
        }, transaction);
      }
    });
    return res.status(200).json({ success: true, data: { ticket } });
  } catch (error) {
    console.error("❌ Assign Ticket Error:", error);
    return res.status(500).json({ success: false, message: "Internal server error while assigning ticket." });
  }
}

async function updateTicketStatus(req, res) {
  try {
    const { id } = req.validatedParams || req.params;
    const { status, resolutionNote } = req.body;
    const ticket = await getScopedTicket(req, id);
    if (!ticket) return res.status(404).json({ success: false, message: "Ticket not found." });
    const isAdmin = adminCanManage(req.user);
    const isAssignedMember = Number(ticket.assignedTo) === Number(req.user.id);
    if (status === "Closed") {
      if (!isAdmin && Number(ticket.createdBy) !== Number(req.user.id)) return res.status(403).json({ success: false, message: "Only the creator or an administrator may close a ticket." });
      if (ticket.status !== "Resolved") return res.status(409).json({ success: false, message: "Only resolved tickets can be closed." });
    } else if (!isAdmin && !isAssignedMember && !canManageTicket(req.user, ticket)) {
      return res.status(403).json({ success: false, message: "You cannot update this ticket." });
    }
    if (status === "In-Progress" && !["Open", "In-Progress"].includes(ticket.status)) {
      return res.status(409).json({ success: false, message: "Only open tickets can be moved into progress. Reopen a closed or resolved ticket first." });
    }
    if (status === "Resolved" && ["Closed"].includes(ticket.status)) {
      return res.status(409).json({ success: false, message: "Reopen this ticket before resolving it again." });
    }
    const previousStatus = ticket.status;
    if (previousStatus !== status || (status === "Resolved" && ticket.rootCause !== resolutionNote)) {
      await db.sequelize.transaction(async (transaction) => {
        ticket.status = status;
        if (status === "Resolved") {
          ticket.rootCause = resolutionNote;
          ticket.resolvedBy = req.user.id;
          ticket.resolvedAt = new Date();
        }
        await ticket.save({ transaction });
        if (previousStatus !== status) await recordHistory(ticket, req.user.id, "status", previousStatus, status, "status_changed", transaction);
        if (status === "Resolved" && resolutionNote) {
          await recordHistory(ticket, req.user.id, "resolution", null, resolutionNote.slice(0, 255), "resolved", transaction);
          await notifyUsers([ticket.createdBy].filter((userId) => Number(userId) !== Number(req.user.id)), {
            type: "ticket_resolved",
            title: "Ticket resolved",
            message: `Ticket #${ticket.id} “${ticket.title}” has been resolved.`,
            link: `/dashboard?ticket=${ticket.id}`,
            dedupeKey: `ticket:${ticket.id}:resolved:${Date.now()}`,
          }, transaction);
        }
      });
    }
    return res.status(200).json({ success: true, data: { ticket } });
  } catch (error) {
    console.error("❌ Update Ticket Status Error:", error);
    return res.status(500).json({ success: false, message: "Internal server error while updating ticket status." });
  }
}

async function resolveLegacyTicket(req, res) {
  const { id } = req.validatedParams || req.params;
  const { rootCause, resolutionNote, department, assignedTo } = req.body;
  const ticket = await getScopedTicket(req, id);
  if (!ticket) return res.status(404).json({ success: false, message: "Ticket not found." });
  if (!adminCanManage(req.user) && Number(ticket.assignedTo) !== Number(req.user.id) && !canManageTicket(req.user, ticket)) {
    return res.status(403).json({ success: false, message: "Only the assigned member or an administrator may resolve this ticket." });
  }
  if (ticket.status === "Closed") return res.status(409).json({ success: false, message: "Reopen this ticket before resolving it again." });
  if (Number(assignedTo) !== Number(ticket.assignedTo) && !canManageTicket(req.user, ticket)) {
    return res.status(403).json({ success: false, message: "You cannot reassign this ticket." });
  }
  const allowedIds = await assignableUserIds(User, req.user);
  const assignee = await User.findOne({
    where: { id: assignedTo, status: "ACTIVE", isActive: true, [Op.or]: [{ id: req.user.id }, { id: { [Op.in]: allowedIds } }] },
    attributes: ["id", "name", "department", "position"],
  });
  if (!assignee || (Number(assignedTo) !== Number(req.user.id) && !canAssignTask(req.user, assignee))) {
    return res.status(404).json({ success: false, message: "Assignee is outside your permitted team." });
  }
  if (department !== assignee.department) {
    return res.status(400).json({ success: false, message: "The ticket department must match the assignee's department." });
  }

  try {
    const oldStatus = ticket.status;
    await db.sequelize.transaction(async (transaction) => {
      const oldDepartment = ticket.department;
      const oldAssigneeId = ticket.assignedTo;
      const oldAssignee = oldAssigneeId ? await User.findByPk(oldAssigneeId, { attributes: ["name"], transaction }) : null;
      ticket.department = department;
      ticket.assignedTo = assignee.id;
      ticket.status = "Resolved";
      ticket.rootCause = resolutionNote || rootCause;
      ticket.resolvedBy = req.user.id;
      ticket.resolvedAt = new Date();
      await ticket.save({ transaction });
      if (oldDepartment !== department) {
        await recordHistory(ticket, req.user.id, "department", oldDepartment, department, "updated", transaction);
      }
      if (oldAssigneeId !== assignee.id) {
        await recordHistory(ticket, req.user.id, "assignedTo", oldAssignee?.name || "Unassigned", assignee.name, "reassigned", transaction);
        await notifyUsers([assignee.id], {
          type: "ticket_assigned",
          title: "Ticket assigned to you",
          message: `Ticket #${ticket.id} “${ticket.title}” was assigned to you.`,
          link: `/dashboard?ticket=${ticket.id}`,
          dedupeKey: `ticket:${ticket.id}:legacy-resolve-assignment:${Date.now()}`,
        }, transaction);
      }
      if (oldStatus !== "Resolved") {
        await recordHistory(ticket, req.user.id, "status", oldStatus, "Resolved", "status_changed", transaction);
      }
      await recordHistory(ticket, req.user.id, "resolution", null, String(resolutionNote || rootCause).slice(0, 255), "resolved", transaction);
      await notifyUsers([ticket.createdBy].filter((userId) => Number(userId) !== Number(req.user.id)), {
        type: "ticket_resolved",
        title: "Ticket resolved",
        message: `Ticket #${ticket.id} “${ticket.title}” has been resolved.`,
        link: `/dashboard?ticket=${ticket.id}`,
        dedupeKey: `ticket:${ticket.id}:resolved:${Date.now()}`,
      }, transaction);
    });
    return res.status(200).json({ success: true, data: { ticket } });
  } catch (error) {
    console.error("❌ Resolve Ticket Error:", error);
    return res.status(500).json({ success: false, message: "Internal server error while resolving ticket." });
  }
}

async function reopenTicket(req, res) {
  try {
    const { id } = req.validatedParams || req.params;
    const { reason } = req.body;
    const ticket = await getScopedTicket(req, id);
    if (!ticket) return res.status(404).json({ success: false, message: "Ticket not found." });
    if (!adminCanManage(req.user) && Number(ticket.createdBy) !== Number(req.user.id)) {
      return res.status(403).json({ success: false, message: "Only the creator or an administrator may reopen this ticket." });
    }
    if (!["Resolved", "Closed"].includes(ticket.status)) return res.status(409).json({ success: false, message: "Only resolved or closed tickets can be reopened." });
    const oldStatus = ticket.status;
    await db.sequelize.transaction(async (transaction) => {
      ticket.status = "Open";
      ticket.rootCause = null;
      ticket.resolvedAt = null;
      ticket.resolvedBy = null;
      await ticket.save({ transaction });
      await recordHistory(ticket, req.user.id, "status", oldStatus, "Open", "status_changed", transaction);
      await recordHistory(ticket, req.user.id, "reopen_reason", null, reason.slice(0, 255), "reopened", transaction);
    });
    return res.status(200).json({ success: true, data: { ticket } });
  } catch (error) {
    console.error("❌ Reopen Ticket Error:", error);
    return res.status(500).json({ success: false, message: "Internal server error while reopening ticket." });
  }
}

async function updateDeadline(req, res) {
  try {
    const { id } = req.validatedParams || req.params;
    const { deadline, reason } = req.body;
    const ticket = await getScopedTicket(req, id);
    if (!ticket) return res.status(404).json({ success: false, message: "Ticket not found." });
    if (!canEditDeadline(req.user, ticket)) {
      return res.status(403).json({ success: false, message: "You cannot change this ticket's deadline." });
    }
    const oldValue = ticket.deadline;
    if (oldValue !== deadline) {
      await db.sequelize.transaction(async (transaction) => {
        ticket.deadline = deadline;
        await ticket.save({ transaction });
        await recordHistory(ticket, req.user.id, "deadline", oldValue, deadline, "updated", transaction);
        await DeadlineHistory.create({
          ticketId: ticket.id,
          oldDeadline: oldValue,
          newDeadline: deadline,
          changedById: req.user.id,
          reason,
        }, { transaction });
      });
    }
    return res.status(200).json({ success: true, data: { ticket } });
  } catch (error) {
    console.error("❌ Update Ticket Deadline Error:", error);
    return res.status(500).json({ success: false, message: "Internal server error while updating ticket deadline." });
  }
}

async function addComment(req, res) {
  try {
    const { id } = req.validatedParams || req.params;
    const { comment } = req.body;
    const ticket = await getScopedTicket(req, id);
    if (!ticket) return res.status(404).json({ success: false, message: "Ticket not found." });
    const result = await db.sequelize.transaction(async (transaction) => {
      const created = await TicketComment.create({ ticketId: ticket.id, userId: req.user.id, comment }, { transaction });
      await recordHistory(ticket, req.user.id, "comment", null, comment.slice(0, 255), "commented", transaction);
      await notifyUsers([ticket.createdBy, ticket.assignedTo].filter((userId) => Number(userId) !== Number(req.user.id)), {
        type: "ticket_comment",
        title: "New ticket comment",
        message: `A new comment was added to ticket #${ticket.id} “${ticket.title}”.`,
        link: `/dashboard?ticket=${ticket.id}`,
        dedupeKey: `ticket:${ticket.id}:comment:${created.id}`,
      }, transaction);
      return TicketComment.findByPk(created.id, {
        include: [{ model: User, as: "user", attributes: ["id", "name"] }],
        transaction,
      });
    });
    return res.status(201).json({ success: true, data: { comment: result } });
  } catch (error) {
    console.error("❌ Add Ticket Comment Error:", error);
    return res.status(500).json({ success: false, message: "Internal server error while adding the ticket comment." });
  }
}

const isServerless = Boolean(process.env.VERCEL) || process.env.NODE_ENV === "production";
// Serverless /tmp storage is temporary and is not shared between requests or deployments.
// Production should use persistent cloud storage such as Cloudinary, S3, or Vercel Blob.
const attachmentStorage = isServerless
  ? path.join("/tmp", "ticket-attachments")
  : path.resolve(process.env.TICKET_ATTACHMENT_DIR || path.join(process.cwd(), "storage", "ticket-attachments"));
function isPlainTextFile(buffer) {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    return !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text);
  } catch (error) {
    if (error instanceof TypeError) return false;
    throw error;
  }
}

async function uploadAttachment(req, res) {
  let storagePath;
  try {
    const { id } = req.validatedParams || req.params;
    const ticket = await getScopedTicket(req, id);
    if (!ticket) {
      if (req.file) fs.promises.unlink(req.file.path).catch((error) => console.error("Unable to remove unauthorized ticket upload:", error.message));
      return res.status(404).json({ success: false, message: "Ticket not found." });
    }
    if (!req.file) return res.status(400).json({ success: false, message: "Choose a supported attachment under 8 MB." });
    storagePath = req.file.path;
    const sample = await fs.promises.readFile(storagePath);
    const signatures = {
      "image/jpeg": sample[0] === 0xff && sample[1] === 0xd8 && sample[2] === 0xff,
      "image/png": sample.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
      "image/gif": sample.subarray(0, 3).toString("ascii") === "GIF",
      "image/webp": sample.subarray(0, 4).toString("ascii") === "RIFF" && sample.subarray(8, 12).toString("ascii") === "WEBP",
      "application/pdf": sample.subarray(0, 5).toString("ascii") === "%PDF-",
      "text/plain": isPlainTextFile(sample),
    };
    if (!signatures[req.file.mimetype]) {
      await fs.promises.unlink(storagePath);
      return res.status(400).json({ success: false, message: "The file contents do not match a supported file type." });
    }
    const fileName = path.basename(req.file.originalname.replace(/[\\/]/g, path.sep)).replace(/[\r\n"]/g, "_").slice(0, 255);
    const attachment = await db.sequelize.transaction(async (transaction) => {
      const created = await TicketAttachment.create({
        ticketId: ticket.id,
        uploadedBy: req.user.id,
        fileName,
        storageName: req.file.filename,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
      }, { transaction });
      await recordHistory(ticket, req.user.id, "attachment", null, created.fileName, "attached", transaction);
      await notifyUsers([ticket.createdBy, ticket.assignedTo].filter((userId) => Number(userId) !== Number(req.user.id)), {
        type: "ticket_attachment",
        title: "Ticket attachment added",
        message: `A file was attached to ticket #${ticket.id} “${ticket.title}”.`,
        link: `/dashboard?ticket=${ticket.id}`,
        dedupeKey: `ticket:${ticket.id}:attachment:${attachment.id}`,
      }, transaction);
      return created;
    });
    const { storageName, ...publicAttachment } = attachment.get({ plain: true });
    return res.status(201).json({ success: true, data: { attachment: publicAttachment } });
  } catch (error) {
    if (storagePath) fs.promises.unlink(storagePath).catch((unlinkError) => console.error("Unable to remove failed ticket upload:", unlinkError.message));
    console.error("❌ Upload Ticket Attachment Error:", error);
    return res.status(500).json({ success: false, message: "Internal server error while uploading the attachment." });
  }
}

async function downloadAttachment(req, res) {
  try {
    const { id, attachmentId } = req.validatedParams || req.params;
    const { where } = await buildTicketScope({ actor: req.user, User });
    const attachment = await TicketAttachment.findOne({
      where: { id: attachmentId, ticketId: id },
      include: [{ model: Ticket, as: "ticket", where, required: true, include: [{ model: User, as: "assignee", attributes: ["id"], required: false }] }],
    });
    if (!attachment) return res.status(404).json({ success: false, message: "Attachment not found." });
    const filePath = path.join(attachmentStorage, path.basename(attachment.storageName));
    if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, message: "Attachment file is unavailable." });
    res.setHeader("Content-Type", attachment.mimeType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    return res.download(filePath, path.basename(attachment.fileName));
  } catch (error) {
    console.error("❌ Download Ticket Attachment Error:", error);
    return res.status(500).json({ success: false, message: "Internal server error while downloading the attachment." });
  }
}

module.exports = {
  getTickets,
  getTicketDetails,
  assignTicket,
  updateTicketStatus,
  resolveLegacyTicket,
  reopenTicket,
  updateDeadline,
  addComment,
  uploadAttachment,
  downloadAttachment,
  emitDeadlineNotifications,
  attachmentStorage,
  notifyUsers,
};
