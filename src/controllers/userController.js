/**
 * User Controller
 * 
 * Handles user-related business logic:
 *   - getMembers: Retrieves active employees within the caller's user scope.
 *                 Used by the frontend for the task assignment dropdown.
 */

const { Op } = require("sequelize");
const db = require("../models");

const User = db.User;
const Task = db.Task;
const Project = db.Project;
const TaskHistory = db.TaskHistory;
const { scopedUserQuery, scopedProjectQuery, scopedTaskQuery } = require("../lib/scope");
const { normalizedRole } = require("../lib/rbac");

function isOverviewAdmin(user) {
  const role = normalizedRole(user?.role);
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

function taskScope(user, memberId, query) {
  const conditions = [{ assignedTo: memberId }, scopedTaskQuery(user)];
  if (query.projectId) conditions.push({ projectId: query.projectId });
  if (query.status) conditions.push({ status: query.status });
  if (query.priority) conditions.push({ priority: query.priority });
  if (query.startDate || query.endDate) {
    const assignedAt = {};
    if (query.startDate) assignedAt[Op.gte] = new Date(`${query.startDate}T00:00:00.000Z`);
    if (query.endDate) {
      const dayAfterEnd = new Date(`${query.endDate}T00:00:00.000Z`);
      dayAfterEnd.setUTCDate(dayAfterEnd.getUTCDate() + 1);
      assignedAt[Op.lt] = dayAfterEnd;
    }
    conditions.push({ createdAt: assignedAt });
  }
  return { [Op.and]: conditions };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET MEMBERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @desc    Get active employees within the caller's scope for assignment
 * @route   GET /api/users/members
 * @access  Private (Admin only)
 */
const getMembers = async (req, res) => {
  try {
    const members = await User.findAll({
      where: {
        ...scopedUserQuery(req.user),
        role: "EMPLOYEE",
        status: "ACTIVE",
      },
      attributes: ["id", "name", "email", "createdAt"], // Exclude password & role (always 'Member')
      order: [["name", "ASC"]], // Alphabetical for dropdown
    });

    return res.status(200).json({
      success: true,
      message: "Members fetched successfully.",
      data: {
        count: members.length,
        members,
      },
    });
  } catch (error) {
    console.error("❌ Get Members Error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error while fetching members.",
    });
  }
};

const searchTeamMembers = async (req, res) => {
  if (!isOverviewAdmin(req.user)) {
    return res.status(403).json({ success: false, message: "Administrator access is required." });
  }
  try {
    const { q = "" } = req.validatedQuery || req.query;
    const where = {
      [Op.and]: [
        scopedUserQuery(req.user),
        { role: "EMPLOYEE", status: "ACTIVE" },
        ...(q ? [{ [Op.or]: [
          { name: { [Op.like]: `%${q}%` } },
          { email: { [Op.like]: `%${q}%` } },
        ] }] : []),
      ],
    };
    const members = await User.findAll({
      where,
      attributes: ["id", "name", "email"],
      order: [["name", "ASC"], ["id", "ASC"]],
      limit: 50,
    });
    return res.status(200).json({
      success: true,
      message: "Team members fetched successfully.",
      data: { members },
    });
  } catch (error) {
    console.error("❌ Search Team Members Error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error while searching team members.",
    });
  }
};

const getMemberOverview = async (req, res) => {
  if (!isOverviewAdmin(req.user)) {
    return res.status(403).json({ success: false, message: "Administrator access is required." });
  }
  try {
    const { id } = req.validatedParams || req.params;
    const query = req.validatedQuery || req.query;
    const member = await User.findOne({
      where: { [Op.and]: [{ id, role: "EMPLOYEE" }, scopedUserQuery(req.user)] },
      attributes: ["id", "name", "email", "createdAt"],
    });
    if (!member) {
      return res.status(404).json({ success: false, message: "Team member not found." });
    }

    const where = taskScope(req.user, member.id, query);
    const taskIncludes = [
      { model: Project, as: "project", attributes: ["id", "title", "createdBy"] },
      { model: User, as: "assignee", attributes: ["id", "name", "createdById"] },
    ];
    const [pending, inProgress, completed, overdue] = await Promise.all([
      Task.count({ where: { [Op.and]: [where, { status: "Pending" }] }, include: taskIncludes, distinct: true }),
      Task.count({ where: { [Op.and]: [where, { status: "In-Progress" }] }, include: taskIncludes, distinct: true }),
      Task.count({ where: { [Op.and]: [where, { status: "Completed" }] }, include: taskIncludes, distinct: true }),
      Task.count({
        where: { [Op.and]: [where, { status: { [Op.ne]: "Completed" } }, { dueDate: { [Op.lt]: new Date().toISOString().slice(0, 10) } }] },
        include: taskIncludes,
        distinct: true,
      }),
    ]);
    const counts = { Pending: pending, "In-Progress": inProgress, Completed: completed };
    const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
    const { rows, count } = await Task.findAndCountAll({
      where,
      attributes: ["id", "title", "description", "status", "priority", "progress", "projectId", "assignedTo", "dueDate", "completedBy", "completedAt", "createdAt"],
      include: [
        { model: Project, as: "project", attributes: ["id", "title"] },
        { model: User, as: "assignee", attributes: ["id", "name", "email"] },
      ],
      order: [["createdAt", "DESC"], ["id", "DESC"]],
      limit: query.pageSize,
      offset: (query.page - 1) * query.pageSize,
      distinct: true,
    });
    const matchingTaskIds = await Task.findAll({
      where,
      attributes: ["id"],
      include: taskIncludes,
      raw: true,
    });
    const activity = matchingTaskIds.length
      ? await TaskHistory.findAll({
        where: { taskId: { [Op.in]: matchingTaskIds.map((task) => task.id) } },
        attributes: ["id", "taskId", "changedBy", "field", "oldValue", "newValue", "action", "createdAt"],
        include: [
          { model: User, as: "changedByUser", attributes: ["id", "name"] },
          { model: Task, as: "task", attributes: ["id", "title"] },
        ],
        order: [["createdAt", "DESC"]],
        limit: 50,
      })
      : [];
    activity.reverse();
    const projects = await Project.findAll({
      where: scopedProjectQuery(req.user),
      attributes: ["id", "title"],
      order: [["title", "ASC"]],
    });

    return res.status(200).json({
      success: true,
      message: "Team member overview fetched successfully.",
      data: {
        member,
        summary: {
          total,
          completed: counts.Completed,
          inProgress: counts["In-Progress"],
          pending: counts.Pending,
          overdue,
          completionRate: total ? Math.round((counts.Completed / total) * 100) : 0,
        },
        tasks: rows,
        taskCount: count,
        page: query.page,
        pageSize: query.pageSize,
        pageCount: Math.max(1, Math.ceil(count / query.pageSize)),
        projects,
        activity,
        activityLimited: activity.length === 50,
        historicalActivityAvailable: activity.length > 0,
      },
    });
  } catch (error) {
    console.error("❌ Get Member Overview Error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error while fetching the member overview.",
    });
  }
};

module.exports = {
  getMembers,
  searchTeamMembers,
  getMemberOverview,
};
