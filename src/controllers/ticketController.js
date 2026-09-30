const db = require("../models");
const Ticket = db.Ticket;
const TicketComment = db.TicketComment;
const TicketHistory = db.TicketHistory;
const User = db.User;
const { Op } = require("sequelize");
const {
  scopedTicketQuery,
  scopedTicketByIdQuery,
  scopedUserQuery,
  scopedProjectQuery,
  scopedTaskByIdQuery,
} = require("../lib/scope");

/**
 * CREATE TICKET
 */
const createTicket = async (req, res) => {
  try {
    const { title, description, screenshotUrl, priority, department, assignedTo, deadline, projectId, taskId } = req.body;
    let assigneeId = null;
    let assigneeName = null;
    if (assignedTo !== undefined && assignedTo !== null) {
      if (
        !req.user.permissions.includes("ticket:assign") &&
        Number(assignedTo) !== Number(req.user.id)
      ) {
        return res.status(403).json({
          ok: false,
          error: { code: "FORBIDDEN", message: "You may only assign this ticket to yourself." },
          success: false,
          message: "You may only assign this ticket to yourself.",
        });
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
      assigneeId = assignee.id;
      assigneeName = assignee.name;
    }

    let linkedProjectId = projectId || null;
    if (taskId) {
      const linkedTask = await db.Task.findOne({
        where: scopedTaskByIdQuery(req.user, taskId),
        include: [
          { model: User, as: "assignee", attributes: ["id"], required: false },
          { model: db.Project, as: "project", attributes: ["id"], required: false },
        ],
      });
      if (!linkedTask || (projectId && Number(linkedTask.projectId) !== Number(projectId))) {
        return res.status(404).json({ success: false, message: "Task is outside your permitted scope or does not belong to the selected project." });
      }
    }
    if (linkedProjectId) {
      const project = await db.Project.findOne({ where: { id: linkedProjectId, ...scopedProjectQuery(req.user) } });
      if (!project) return res.status(404).json({ success: false, message: "Project is outside your permitted scope." });
    }

    const ticket = await db.sequelize.transaction(async (transaction) => {
      const createdTicket = await Ticket.create(
        {
          title,
          description,
          screenshotUrl,
          priority,
          department,
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
    const { search, status, priority, department } =
      req.validatedQuery || req.query;
    const whereClause = { [Op.and]: [scopedTicketQuery(req.user)] };

    if (status) {
      const statuses = status.split(",").map((value) => value.trim());
      whereClause.status = statuses.length === 1 ? statuses[0] : { [Op.in]: statuses };
    }
    if (priority) {
      const priorities = priority.split(",").map((value) => value.trim());
      whereClause.priority = priorities.length === 1 ? priorities[0] : { [Op.in]: priorities };
    }
    if (department) whereClause.department = department;

    // Search by ID or Title
    if (search) {
      const searchTerm = search.trim();
      const isNumeric = /^\d+$/.test(searchTerm);
      if (isNumeric) {
        whereClause.id = Number(searchTerm);
      } else {
        whereClause.title = { [Op.like]: `%${searchTerm}%` };
      }
    }

    const tickets = await Ticket.findAll({
      where: whereClause,
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
      order: [
        ["createdAt", "DESC"],
        [{ model: TicketHistory, as: "history" }, "createdAt", "DESC"]
      ],
    });

    const absoluteTotal = await Ticket.count({
      where: scopedTicketQuery(req.user),
      include: [{ model: User, as: "assignee", attributes: [], required: false }],
      distinct: true,
    });

    return res.status(200).json({
      success: true,
      data: { 
        tickets,
        totalFiltered: tickets.length,
        totalAbsolute: absoluteTotal
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
