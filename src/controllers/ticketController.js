const db = require("../models");
const Ticket = db.Ticket;
const TicketComment = db.TicketComment;
const TicketHistory = db.TicketHistory;
const User = db.User;
const { Op } = require("sequelize");

/**
 * CREATE TICKET
 */
const createTicket = async (req, res) => {
  try {
    const { title, description, screenshotUrl, priority, department, assignedTo } = req.body;

    if (!title || !department || !priority) {
      return res.status(400).json({
        success: false,
        message: "Title, Department, and Priority (P0, P1, P2) are required.",
      });
    }

    const ticket = await Ticket.create({
      title,
      description,
      screenshotUrl,
      priority,
      department,
      assignedTo: assignedTo || null,
      createdBy: req.user.id,
      status: "Open",
    });

    // Log creation in history
    await TicketHistory.create({
      ticketId: ticket.id,
      changedBy: req.user.id,
      field: "status",
      oldValue: null,
      newValue: "Open",
      action: "created",
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
    const { search, status, priority, department } = req.query;
    const whereClause = {};

    // RBAC: Members see assigned or created tickets. Admin sees all.
    if (req.user.role === "Member") {
      whereClause[Op.or] = [
        { assignedTo: req.user.id },
        { createdBy: req.user.id }
      ];
    }

    if (status) whereClause.status = status;
    if (priority) whereClause.priority = priority;
    if (department) whereClause.department = department;

    // Search by ID or Title
    if (search) {
      const isNumeric = /^\d+$/.test(search);
      if (isNumeric) {
        whereClause.id = parseInt(search);
      } else {
        whereClause.title = { [Op.like]: `%${search}%` };
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

    return res.status(200).json({
      success: true,
      data: { tickets },
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
    const { id } = req.params;
    const { rootCause, department, assignedTo } = req.body;

    if (!rootCause || !department || !assignedTo) {
      return res.status(400).json({
        success: false,
        message: "Root Cause, Department, and Assigned Agent are mandatory to resolve a ticket.",
      });
    }

    const ticket = await Ticket.findByPk(id);
    if (!ticket) {
      return res.status(404).json({ success: false, message: "Ticket not found." });
    }

    // Only Admin or Assigned Agent can resolve
    if (req.user.role === "Member" && ticket.assignedTo !== req.user.id) {
      return res.status(403).json({ success: false, message: "You are not authorized to resolve this ticket." });
    }

    const oldStatus = ticket.status;
    const oldDept = ticket.department;
    const oldAssignee = ticket.assignedTo;

    ticket.status = "Resolved";
    ticket.rootCause = rootCause;
    ticket.department = department;
    ticket.assignedTo = assignedTo;
    await ticket.save();

    // Log changes
    if (oldStatus !== "Resolved") {
      await TicketHistory.create({ ticketId: id, changedBy: req.user.id, field: "status", oldValue: oldStatus, newValue: "Resolved", action: "status_changed" });
    }
    if (oldDept !== department) {
      await TicketHistory.create({ ticketId: id, changedBy: req.user.id, field: "department", oldValue: oldDept, newValue: department, action: "updated" });
    }
    if (oldAssignee !== assignedTo) {
      await TicketHistory.create({ ticketId: id, changedBy: req.user.id, field: "assignedTo", oldValue: String(oldAssignee), newValue: String(assignedTo), action: "reassigned" });
    }

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
    const { id } = req.params; // ticketId
    const { comment } = req.body;

    if (!comment) {
      return res.status(400).json({ success: false, message: "Comment cannot be empty." });
    }

    const ticket = await Ticket.findByPk(id);
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
