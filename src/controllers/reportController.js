const db = require("../models");

const { Task, Ticket, User } = db;

async function getWorkspaceReport(req, res) {
  try {
    const [taskTotal, ticketTotal, memberTotal, activeMembers, taskGroups, ticketGroups] = await Promise.all([
      Task.count(),
      Ticket.count(),
      User.count(),
      User.count({ where: { status: "ACTIVE", isActive: true } }),
      Task.findAll({
        attributes: ["department", "status", [db.sequelize.fn("COUNT", db.sequelize.col("id")), "count"]],
        group: ["department", "status"],
        raw: true,
      }),
      Ticket.findAll({
        attributes: ["department", "status", [db.sequelize.fn("COUNT", db.sequelize.col("id")), "count"]],
        group: ["department", "status"],
        raw: true,
      }),
    ]);
    const completedTasks = taskGroups
      .filter((row) => ["Completed", "DONE"].includes(row.status))
      .reduce((total, row) => total + Number(row.count), 0);
    const resolvedTickets = ticketGroups
      .filter((row) => ["Resolved", "Closed", "DONE"].includes(row.status))
      .reduce((total, row) => total + Number(row.count), 0);
    const departments = new Map();
    for (const row of [...taskGroups.map((item) => ({ ...item, type: "tasks" })), ...ticketGroups.map((item) => ({ ...item, type: "tickets" }))]) {
      const department = row.department || "Unassigned";
      if (!departments.has(department)) departments.set(department, { department, tasks: 0, completedTasks: 0, tickets: 0, resolvedTickets: 0 });
      const summary = departments.get(department);
      const count = Number(row.count);
      if (row.type === "tasks") {
        summary.tasks += count;
        if (["Completed", "DONE"].includes(row.status)) summary.completedTasks += count;
      } else {
        summary.tickets += count;
        if (["Resolved", "Closed", "DONE"].includes(row.status)) summary.resolvedTickets += count;
      }
    }
    return res.status(200).json({
      success: true,
      message: "Workspace report fetched successfully.",
      data: {
        summary: {
          tasks: taskTotal,
          openTasks: Math.max(0, taskTotal - completedTasks),
          completedTasks,
          tickets: ticketTotal,
          openTickets: Math.max(0, ticketTotal - resolvedTickets),
          resolvedTickets,
          members: memberTotal,
          activeMembers,
        },
        departments: [...departments.values()].sort((a, b) => a.department.localeCompare(b.department)),
      },
    });
  } catch (error) {
    console.error("Get Workspace Report Error:", error);
    return res.status(500).json({ success: false, message: "Unable to load workspace reports." });
  }
}

module.exports = { getWorkspaceReport };
