const db = require("../models");
const Ticket = db.Ticket;
const TicketComment = db.TicketComment;
const TicketHistory = db.TicketHistory;
const User = db.User;
const { Op } = require("sequelize");
const { canAssignTask, isManager, canManageDeadlines } = require("../lib/permissions");
const { can } = require("../lib/rbac");
const { visibleUserIds, assignableUserIds, buildTicketQuery } = require("../lib/queryFilters");
const {
  scopedTicketByIdQuery,
  scopedUserQuery,
} = require("../lib/scope");

/**
 * CREATE TICKET
 */
const createTicket = async (req, res) => {
  try {
    const { title, description, screenshotUrl, priority, assignedTo, deadline, department, projectId, taskId } = req.body;
    if (
      req.user.position === "INTERN" &&
      assignedTo != null &&
      Number(assignedTo) !== Number(req.user.id)
    ) {
      return res.status(403).json({ success: false, message: "Interns cannot assign tickets to other users." });
    }
    if (req.user.position === "INTERN" && deadline) {
      return res.status(403).json({ success: false, message: "Interns cannot set ticket deadlines." });
    }
    if (deadline && !canManageDeadlines(req.user)) {
      return res.status(403).json({ success: false, message: "You cannot set ticket deadlines." });
    }
    let assigneeId = null;
    let assigneeName = null;
    let assigneeDepartment = null;
    if (assignedTo !== undefined && assignedTo !== null) {
      const selfAssignment = Number(assignedTo) === Number(req.user.id);
      const allowedAssigneeIds = selfAssignment
        ? []
        : await assignableUserIds(User, req.user);
      const assignee = await User.findOne({
        where: { id: assignedTo, status: "ACTIVE", isActive: true },
      });
      if (!assignee || (
        !selfAssignment &&
        (!allowedAssigneeIds.includes(Number(assignee.id)) ||
          !canAssignTask(req.user, assignee) ||
          (req.user.position === "EMPLOYEE" && !can(req.user, "ticket:assign")))
      )) {
        return res.status(404).json({
          ok: false,
          error: { code: "NOT_FOUND", message: "Assignee is outside your permitted scope." },
          success: false,
          message: "Assignee is outside your permitted scope.",
        });
      }
      assigneeId = assignee.id;
      assigneeName = assignee.name;
      assigneeDepartment = assignee.department;
    }
    if (!isManager(req.user) && department && department !== req.user.department) {
      return res.status(403).json({ success: false, message: "You can only create tickets in your own department." });
    }
    if (assigneeDepartment && department && assigneeDepartment !== department) {
      return res.status(400).json({ success: false, message: "The selected department must match the assignee's department." });
    }
    const ticketDepartment = assigneeDepartment || (isManager(req.user) ? department : req.user.department);
    if (!ticketDepartment) {
      return res.status(400).json({ success: false, message: "Select a department when creating an unassigned ticket." });
    }
    if (req.user.position === "INTERN" && assigneeId === null) {
      const self = await User.findByPk(req.user.id, {
        attributes: ["id", "name", "department"],
      });
      assigneeId = self.id;
      assigneeName = self.name;
      assigneeDepartment = self.department;
    }

    let linkedProjectId = projectId || null;
    if (taskId) {
      const visibleIds = await visibleUserIds(User, req.user);
      const linkedTask = await db.Task.findOne({
        where: { id: taskId, assignedTo: { [Op.in]: visibleIds } },
        include: [
          { model: User, as: "assignee", attributes: ["id"], required: false },
          { model: db.Project, as: "project", attributes: ["id"], required: false },
        ],
      });
      if (!linkedTask || (projectId && Number(linkedTask.projectId) !== Number(projectId))) {
        return res.status(404).json({ success: false, message: "Task is outside your permitted scope or does not belong to the selected project." });
      }
      if (linkedTask.department !== ticketDepartment) {
        return res.status(400).json({ success: false, message: "The ticket and linked task must belong to the same department." });
      }
    }
    if (linkedProjectId) {
      const project = await db.Project.findByPk(linkedProjectId);
      if (
        !project ||
        (!isManager(req.user) && project.department !== req.user.department) ||
        project.department !== ticketDepartment
      ) {
        return res.status(404).json({ success: false, message: "Project is outside your permitted scope." });
      }
    }

    const ticket = await db.sequelize.transaction(async (transaction) => {
      const createdTicket = await Ticket.create(
        {
          title,
          description,
          screenshotUrl,
          priority,
          department: ticketDepartment,
          assignedTo: assigneeId,
          deadline: deadline || null,
          projectId: linkedProjectId,
          taskId: taskId || null,
          createdBy: req.user.id,
          status: "Open",
        },
        { transaction }
      );
      await TicketHistory.create(
        {
          ticketId: createdTicket.id,
          changedBy: req.user.id,
          field: "status",
          oldValue: null,
          newValue: "Open",
          action: "created",
        },
        { transaction }
      );
      await TicketHistory.create({
        ticketId: createdTicket.id,
        changedBy: req.user.id,
        field: "priority",
        oldValue: null,
        newValue: priority,
        action: "updated",
      }, { transaction });
      if (deadline) {
        await TicketHistory.create({
          ticketId: createdTicket.id,
          changedBy: req.user.id,
          field: "deadline",
          oldValue: null,
          newValue: deadline,
          action: "updated",
        }, { transaction });
      }
      if (assigneeId) {
        await TicketHistory.create({
          ticketId: createdTicket.id,
          changedBy: req.user.id,
          field: "assignedTo",
          oldValue: "Unassigned",
          newValue: assigneeName,
          action: "assigned",
        }, { transaction });
      }
      if (assigneeId) {
        const notification = db.Notification.build({
          userId: assigneeId,
          type: "ticket_assigned",
          title: "Ticket assigned to you",
          message: `Ticket #${createdTicket.id} “${createdTicket.title}” was assigned to you.`,
          link: `/dashboard?ticket=${createdTicket.id}`,
          dedupeKey: `ticket:${createdTicket.id}:created-assignment`,
        });
        await notification.save({ transaction });
      }
      return createdTicket;
    });

    return res.status(201).json({
      success: true,
      message: "Ticket created successfully.",
      data: { ticket },
    });
  } catch (error) {
    console.error("❌ Create Ticket Error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error while creating ticket.",
    });
  }
};

/**
 * GET TICKETS (with search by ID)
 */
const getTickets = async (req, res) => {
  try {
    const query = req.validatedQuery || req.query;
    const { where, page, pageSize } = await buildTicketQuery({
      actor: req.user,
      User,
      filters: query,
    });
    const order = query.sort === "oldest"
      ? [["createdAt", "ASC"]]
      : query.sort === "priority"
        ? [[db.sequelize.literal(`FIELD(Ticket.priority, 'P0', 'P1', 'P2') ASC`)], ["createdAt", "DESC"]]
        : query.sort === "deadline"
          ? [["deadline", "ASC"], ["createdAt", "DESC"]]
          : [["createdAt", "DESC"]];
    const { rows: tickets, count } = await Ticket.findAndCountAll({
      where,
      include: [
        { model: User, as: "creator", attributes: ["id", "name", "email"] },
        { model: User, as: "assignee", attributes: ["id", "name", "email"] },
        { 
          model: TicketComment, 
          as: "comments",
          include: [{ model: User, as: "user", attributes: ["id", "name"] }]
        },
        {
          model: TicketHistory,
          as: "history",
          include: [{ model: User, as: "changedByUser", attributes: ["id", "name"] }]
        }
      ],
      order: [...order, ["id", "DESC"]],
      limit: pageSize,
      offset: (page - 1) * pageSize,
      distinct: true,
    });

    const { where: scopeWhere } = await buildTicketQuery({
      actor: req.user,
      User,
      filters: { view: "all" },
    });
    const absoluteTotal = await Ticket.count({
      where: scopeWhere,
      include: [{ model: User, as: "assignee", attributes: [], required: false }],
      distinct: true,
    });

    return res.status(200).json({
      success: true,
      data: { 
        tickets,
        count: tickets.length,
        total: count,
        totalFiltered: count,
        totalAbsolute: absoluteTotal,
        page,
        pageSize,
        pageCount: Math.max(1, Math.ceil(count / pageSize)),
      },
    });
  } catch (error) {
    console.error("❌ Get Tickets Error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error while fetching tickets.",
    });
  }
};

/**
 * RESOLVE TICKET
 * Requires: rootCause, new department, new assigned agent
 */
const resolveTicket = async (req, res) => {
  try {
    const { id } = req.validatedParams || req.params;
    const { rootCause, department, assignedTo } = req.body;

    if (!rootCause || !department || !assignedTo) {
      return res.status(400).json({
        success: false,
        message: "Root Cause, Department, and Assigned Agent are mandatory to resolve a ticket.",
      });
    }

    const ticket = await Ticket.findOne({
      where: scopedTicketByIdQuery(req.user, id),
      include: [{ model: User, as: "assignee", attributes: ["id", "createdById"] }],
    });
    if (!ticket) {
      return res.status(404).json({ success: false, message: "Ticket not found." });
    }
    if (!req.user.permissions.includes("ticket:update:any") &&
      !(req.user.permissions.includes("ticket:assign") && req.user.role === "ADMIN") &&
      Number(ticket.assignedTo) !== Number(req.user.id)) {
      return res.status(403).json({ success: false, message: "Only the assigned member or an administrator may resolve this ticket." });
    }

    const assignee = await User.findOne({
      where: {
        [Op.and]: [
          { id: assignedTo, role: "EMPLOYEE", status: "ACTIVE" },
          scopedUserQuery(req.user),
        ],
      },
    });
    if (!assignee) {
      return res.status(404).json({
        ok: false,
        error: { code: "NOT_FOUND", message: "Assignee is outside your permitted scope." },
        success: false,
        message: "Assignee is outside your permitted scope.",
      });
    }

    const oldStatus = ticket.status;
    const oldDept = ticket.department;
    const oldAssignee = ticket.assignedTo;

    await db.sequelize.transaction(async (transaction) => {
      ticket.status = "Resolved";
      ticket.rootCause = rootCause;
      ticket.department = department;
      ticket.assignedTo = assignee.id;
      await ticket.save({ transaction });

      if (oldStatus !== "Resolved") {
        await TicketHistory.create(
          {
            ticketId: id,
            changedBy: req.user.id,
            field: "status",
            oldValue: oldStatus,
            newValue: "Resolved",
            action: "status_changed",
          },
          { transaction }
        );
      }
      if (oldDept !== department) {
        await TicketHistory.create(
          {
            ticketId: id,
            changedBy: req.user.id,
            field: "department",
            oldValue: oldDept,
            newValue: department,
            action: "updated",
          },
          { transaction }
        );
      }
      if (oldAssignee !== assignee.id) {
        await TicketHistory.create(
          {
            ticketId: id,
            changedBy: req.user.id,
            field: "assignedTo",
            oldValue: String(oldAssignee),
            newValue: String(assignee.id),
            action: "reassigned",
          },
          { transaction }
        );
      }
    });

    return res.status(200).json({
      success: true,
      message: "Ticket resolved successfully.",
      data: { ticket },
    });
  } catch (error) {
    console.error("❌ Resolve Ticket Error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error while resolving ticket.",
    });
  }
};

/**
 * ADD COMMENT
 */
const addComment = async (req, res) => {
  try {
    const { id } = req.validatedParams || req.params;
    const { comment } = req.body;

    if (!comment) {
      return res.status(400).json({ success: false, message: "Comment cannot be empty." });
    }

    const ticket = await Ticket.findOne({
      where: scopedTicketByIdQuery(req.user, id),
      include: [{ model: User, as: "assignee", attributes: ["id", "createdById"] }],
    });
    if (!ticket) {
      return res.status(404).json({ success: false, message: "Ticket not found." });
    }

    const newComment = await TicketComment.create({
      ticketId: id,
      userId: req.user.id,
      comment,
    });

    const commentWithUser = await TicketComment.findByPk(newComment.id, {
      include: [{ model: User, as: "user", attributes: ["id", "name"] }]
    });

    return res.status(201).json({
      success: true,
      message: "Comment added successfully.",
      data: { comment: commentWithUser },
    });
  } catch (error) {
    console.error("❌ Add Comment Error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error while adding comment.",
    });
  }
};

module.exports = {
  createTicket,
  getTickets,
  resolveTicket,
  addComment,
};
