/**
 * User Controller
 * 
 * Handles user-related business logic:
 *   - getMembers: Retrieves active employees within the caller's user scope.
 *                 Used by the frontend for the task assignment dropdown.
 */

const { Op } = require("sequelize");
const db = require("../models");
const { can } = require("../lib/rbac");

const User = db.User;
const Task = db.Task;
const Project = db.Project;
const TaskHistory = db.TaskHistory;
const DeadlineHistory = db.DeadlineHistory;
const {
  canAssignTask,
  canViewUser,
  isManager,
  POSITION_RANK,
} = require("../lib/permissions");
const { assignableUserIds, visibleUserIds } = require("../lib/queryFilters");
const { reportingManagerScope } = require("../lib/reportingScope");
const { REPORTING_POSITIONS } = require("../../shared/organization");

function taskScope(memberId, query) {
  const conditions = [{ assignedTo: memberId }];
  if (query.projectId) conditions.push({ projectId: query.projectId });
  if (query.status) conditions.push({ status: query.status });
  if (query.priority) conditions.push({ priority: query.priority });
  if (query.search) {
    const search = query.search.trim();
    const searchConditions = [
      { title: { [Op.like]: `%${search}%` } },
      { description: { [Op.like]: `%${search}%` } },
    ];
    if (/^\d+$/.test(search)) searchConditions.push({ id: Number(search) });
    conditions.push({ [Op.or]: searchConditions });
  }
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
    const memberIds = await assignableUserIds(User, req.user);
    const members = await User.findAll({
      where: {
        id: { [Op.in]: memberIds },
        status: "ACTIVE",
        isActive: true,
      },
      attributes: ["id", "name", "email", "createdAt", "department", "position", "employeeId"],
      order: [["name", "ASC"]],
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

// Manager directory data for the All Teams and Members dashboard pages.
const getDirectory = async (req, res) => {
  try {
    if (!can(req.user, "user:view:any")) {
      return res.status(403).json({ success: false, message: "You do not have permission to view the team directory." });
    }
    const members = await User.findAll({
      attributes: ["id", "name", "email", "department", "position", "employeeId", "isActive", "status", "reportsToId", "joinedAt", "lastActivityAt"],
      include: [{
        model: User,
        as: "reportsTo",
        attributes: ["id", "name", "position"],
        required: false,
      }],
      order: [["department", "ASC"], ["position", "ASC"], ["name", "ASC"]],
    });
    const taskRows = await Task.findAll({
      attributes: [
        "department",
        "status",
        [db.sequelize.fn("COUNT", db.sequelize.col("id")), "count"],
      ],
      group: ["department", "status"],
      raw: true,
    });
    const teamsByDepartment = new Map();
    for (const member of members) {
      const department = member.department || "Unassigned";
      if (!teamsByDepartment.has(department)) {
        teamsByDepartment.set(department, { department, memberCount: 0, activeMemberCount: 0, leads: [], openTasks: 0, completedTasks: 0 });
      }
      const team = teamsByDepartment.get(department);
      team.memberCount += 1;
      if (member.isActive && member.status === "ACTIVE") team.activeMemberCount += 1;
      if (["MANAGER", "SUB_MANAGER", "TEAM_LEAD"].includes(member.position) && member.isActive && member.status === "ACTIVE") {
        team.leads.push({ id: member.id, name: member.name, position: member.position });
      }
    }
    for (const task of taskRows) {
      const team = teamsByDepartment.get(task.department || "Unassigned");
      if (!team) continue;
      if (["Completed", "DONE"].includes(task.status)) team.completedTasks += Number(task.count);
      else team.openTasks += Number(task.count);
    }
    return res.status(200).json({
      success: true,
      message: "Team directory fetched successfully.",
      data: { members, teams: [...teamsByDepartment.values()] },
    });
  } catch (error) {
    console.error("Get Team Directory Error:", error);
    return res.status(500).json({ success: false, message: "Unable to load the team directory." });
  }
};

const getTeamDirectory = async (req, res) => {
  try {
    if (!can(req.user, "user:view:team")) {
      return res.status(403).json({ success: false, message: "You do not have permission to view this team." });
    }
    const memberIds = await visibleUserIds(User, req.user, { includeSelf: false });
    const members = memberIds.length
      ? await User.findAll({
        where: { id: { [Op.in]: memberIds }, status: "ACTIVE", isActive: true },
        attributes: ["id", "name", "email", "department", "position", "employeeId", "reportsToId", "lastActivityAt"],
        include: [{ model: User, as: "reportsTo", attributes: ["id", "name"], required: false }],
        order: [["name", "ASC"]],
      })
      : [];
    const ids = members.map((member) => Number(member.id));
    const [taskGroups, ticketGroups] = ids.length
      ? await Promise.all([
        Task.findAll({
          attributes: ["assignedTo", "status", [db.sequelize.fn("COUNT", db.sequelize.col("id")), "count"]],
          where: { assignedTo: { [Op.in]: ids } },
          group: ["assignedTo", "status"],
          raw: true,
        }),
        db.Ticket.findAll({
          attributes: ["assignedTo", "status", [db.sequelize.fn("COUNT", db.sequelize.col("id")), "count"]],
          where: { assignedTo: { [Op.in]: ids } },
          group: ["assignedTo", "status"],
          raw: true,
        }),
      ])
      : [[], []];
    const countsByMember = new Map(ids.map((id) => [id, { tasks: 0, openTasks: 0, tickets: 0, openTickets: 0 }]));
    for (const row of taskGroups) {
      const counts = countsByMember.get(Number(row.assignedTo));
      if (!counts) continue;
      const count = Number(row.count);
      counts.tasks += count;
      if (!['Completed', 'DONE'].includes(row.status)) counts.openTasks += count;
    }
    for (const row of ticketGroups) {
      const counts = countsByMember.get(Number(row.assignedTo));
      if (!counts) continue;
      const count = Number(row.count);
      counts.tickets += count;
      if (!['Resolved', 'Closed', 'DONE'].includes(row.status)) counts.openTickets += count;
    }
    const data = members.map((member) => ({
      ...member.get({ plain: true }),
      ...(countsByMember.get(Number(member.id)) || { tasks: 0, openTasks: 0, tickets: 0, openTickets: 0 }),
    }));
    return res.status(200).json({
      success: true,
      message: "Team directory fetched successfully.",
      data: {
        members: data,
        summary: {
          members: data.length,
          tasks: data.reduce((total, member) => total + member.tasks, 0),
          openTasks: data.reduce((total, member) => total + member.openTasks, 0),
          tickets: data.reduce((total, member) => total + member.tickets, 0),
          openTickets: data.reduce((total, member) => total + member.openTickets, 0),
        },
      },
    });
  } catch (error) {
    console.error("Get Scoped Team Directory Error:", error);
    return res.status(500).json({ success: false, message: "Unable to load your team." });
  }
};

const searchTeamMembers = async (req, res) => {
  try {
    const { q = "" } = req.validatedQuery || req.query;
    const teamIds = await visibleUserIds(User, req.user, { includeSelf: false });
    const where = {
      [Op.and]: [
        { id: { [Op.in]: teamIds } },
        { status: "ACTIVE", isActive: true },
        ...(q ? [{ [Op.or]: [
          { name: { [Op.like]: `%${q}%` } },
          { email: { [Op.like]: `%${q}%` } },
          { employeeId: { [Op.like]: `%${q}%` } },
        ] }] : []),
      ],
    };
    const members = await User.findAll({
      where,
      attributes: ["id", "name", "email", "department", "position", "employeeId"],
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
  try {
    const { id } = req.validatedParams || req.params;
    const query = req.validatedQuery || req.query;
    const member = await User.findByPk(id, {
      attributes: ["id", "name", "email", "createdAt", "department", "position", "employeeId"],
    });
    if (!member || !canViewUser(req.user, member)) {
      return res.status(404).json({ success: false, message: "Team member not found." });
    }

    const allMemberTasks = taskScope(member.id, {});
    const where = taskScope(member.id, query);
    const taskIncludes = [
      { model: Project, as: "project", attributes: ["id", "title", "createdBy"] },
      { model: User, as: "assignee", attributes: ["id", "name", "createdById"] },
    ];
    const [pending, inProgress, completed, overdue] = await Promise.all([
      Task.count({ where: { [Op.and]: [allMemberTasks, { status: "Pending" }] }, include: taskIncludes, distinct: true }),
      Task.count({ where: { [Op.and]: [allMemberTasks, { status: "In-Progress" }] }, include: taskIncludes, distinct: true }),
      Task.count({ where: { [Op.and]: [allMemberTasks, { status: "Completed" }] }, include: taskIncludes, distinct: true }),
      Task.count({
        where: { [Op.and]: [allMemberTasks, { status: { [Op.notIn]: ["Completed", "DONE"] } }, { dueDate: { [Op.lt]: new Date().toISOString().slice(0, 10) } }] },
        include: taskIncludes,
        distinct: true,
      }),
    ]);
    const counts = { Pending: pending, "In-Progress": inProgress, Completed: completed };
    const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
    const onTimeCompleted = await Task.count({
      where: {
        [Op.and]: [
          allMemberTasks,
          { status: { [Op.in]: ["Completed", "DONE"] } },
          db.sequelize.literal("`Task`.`completed_at` <= `Task`.`due_date`"),
        ],
      },
    });
    const completionDuration = await Task.findOne({
      attributes: [[
        db.sequelize.literal("AVG(DATEDIFF(`Task`.`completed_at`, `Task`.`created_at`))"),
        "averageCompletionDays",
      ]],
      where: { [Op.and]: [allMemberTasks, { status: { [Op.in]: ["Completed", "DONE"] } }] },
      raw: true,
    });
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
    const activity = await TaskHistory.findAll({
      attributes: ["id", "taskId", "changedBy", "field", "oldValue", "newValue", "action", "createdAt"],
      include: [
        { model: User, as: "changedByUser", attributes: ["id", "name"] },
        { model: Task, as: "task", attributes: ["id", "title"], where: { assignedTo: member.id } },
      ],
      order: [["createdAt", "DESC"], ["id", "DESC"]],
      limit: 50,
    });
    const deadlineHistory = await DeadlineHistory.findAll({
      include: [{
        model: Task,
        as: "task",
        attributes: ["id", "title"],
        where: { assignedTo: member.id },
      }, {
        model: User,
        as: "changedByUser",
        attributes: ["id", "name"],
      }],
      order: [["changedAt", "DESC"], ["id", "DESC"]],
      limit: 50,
    });
    const projects = await Project.findAll({
      attributes: ["id", "title"],
      include: [{
        model: Task,
        as: "tasks",
        attributes: [],
        where: { assignedTo: member.id },
        required: true,
      }],
      group: ["Project.id", "Project.title"],
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
          onTimeCompletionRate: counts.Completed ? Math.round((onTimeCompleted / counts.Completed) * 100) : 0,
          averageCompletionDays: completionDuration?.averageCompletionDays == null
            ? null
            : Number(completionDuration.averageCompletionDays),
        },
        tasks: rows,
        taskCount: count,
        page: query.page,
        pageSize: query.pageSize,
        pageCount: Math.max(1, Math.ceil(count / query.pageSize)),
        projects,
        activity,
        deadlineHistory,
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

const getMemberDetail = async (req, res) => {
  try {
    const { id } = req.validatedParams || req.params;
    const member = await User.findByPk(id, {
      attributes: [
        "id",
        "name",
        "email",
        "department",
        "position",
        "reportsToId",
        "employeeId",
        "isActive",
        "joinedAt",
        "lastActivityAt",
        "createdAt",
      ],
      include: [{
        model: User,
        as: "reportsTo",
        attributes: ["id", "name", "position", "department", "employeeId"],
        required: false,
      }],
    });
    if (!member || !canViewUser(req.user, member)) {
      return res.status(404).json({ success: false, message: "Team member not found." });
    }
    return res.status(200).json({ success: true, data: { member } });
  } catch (error) {
    console.error("Get Member Detail Error:", error);
    return res.status(500).json({ success: false, message: "Unable to load the member details." });
  }
};

const updateMember = async (req, res) => {
  try {
    const { id } = req.validatedParams || req.params;
    const changes = req.validatedBody || req.body;
    const outcome = await db.sequelize.transaction(async (transaction) => {
      const member = await User.findByPk(id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!member || Number(member.id) === Number(req.user.id)) return { error: "NOT_FOUND" };
      if (!canAssignTask(req.user, member)) return { error: "FORBIDDEN" };

      const department = changes.department ?? member.department;
      const position = changes.position ?? member.position;
      const isActive = changes.isActive ?? member.isActive;
      const reportsToId = Object.hasOwn(changes, "reportsToId")
        ? changes.reportsToId
        : member.reportsToId;
      const structureChanged =
        department !== member.department || position !== member.position;
      const reportingChanged =
        structureChanged || Object.hasOwn(changes, "reportsToId");
      const leavingManager =
        member.position === "MANAGER" &&
        (position !== "MANAGER" || !isActive);
      const reportReassignments = [];

      if (!isManager(req.user) && structureChanged) return { error: "MANAGER_REQUIRED" };
      if (!isManager(req.user) && (
        department !== req.user.department ||
        POSITION_RANK[position] >= POSITION_RANK[req.user.position]
      )) return { error: "OUT_OF_SCOPE" };

      if (leavingManager) {
        const managerCount = await User.count({
          where: { position: "MANAGER", isActive: true, status: "ACTIVE" },
          transaction,
        });
        if (managerCount <= 1) return { error: "LAST_MANAGER" };
      }

      if (structureChanged || !isActive) {
        const directReports = await User.findAll({
          where: { reportsToId: member.id },
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        for (const report of directReports) {
          const allowedParents = REPORTING_POSITIONS[report.position] || [];
          const memberCanRemainParent = isActive &&
            allowedParents.includes(position) &&
            (position === "MANAGER" || report.department === department);
          if (memberCanRemainParent) continue;

          const candidates = await User.findAll({
            where: reportingManagerScope({
              department: report.department,
              position: report.position,
              excludeIds: [member.id, report.id],
            }),
            attributes: ["id", "position"],
            transaction,
          });
          candidates.sort((left, right) =>
            POSITION_RANK[left.position] - POSITION_RANK[right.position]
          );
          const replacement = candidates[0];
          if (!replacement) return { error: "REPORTS_NEED_MANAGER" };
          report.reportsToId = replacement.id;
          reportReassignments.push(report);
        }
      }

      if (reportingChanged) {
        if (position === "MANAGER") {
          if (reportsToId !== null) return { error: "INVALID_REPORTING" };
        } else {
          if (reportsToId === null || reportsToId === undefined) {
            return { error: "INVALID_REPORTING" };
          }
          const reportsTo = await User.findByPk(reportsToId, {
            attributes: ["id", "department", "position", "isActive", "status", "reportsToId"],
            transaction,
          });
          if (
            !reportsTo ||
            Number(reportsTo.id) === Number(member.id) ||
            (reportsTo.position !== "MANAGER" && reportsTo.department !== department) ||
            !REPORTING_POSITIONS[position]?.includes(reportsTo.position) ||
            !reportsTo.isActive ||
            reportsTo.status !== "ACTIVE"
          ) return { error: "INVALID_REPORTING" };
          if (!isManager(req.user) && !canViewUser(req.user, reportsTo) && Number(reportsTo.id) !== Number(req.user.id)) {
            return { error: "PARENT_FORBIDDEN" };
          }

          const visited = new Set();
          let ancestor = reportsTo;
          while (ancestor) {
            const ancestorId = Number(ancestor.id);
            if (ancestorId === Number(member.id) || visited.has(ancestorId)) {
              return { error: "CIRCULAR_REPORTING" };
            }
            visited.add(ancestorId);
            ancestor = ancestor.reportsToId
              ? await User.findByPk(ancestor.reportsToId, {
                attributes: ["id", "reportsToId"],
                transaction,
              })
              : null;
          }
        }
      }

      if (changes.name !== undefined) member.name = changes.name;
      member.department = department;
      member.position = position;
      member.reportsToId = reportsToId ?? null;
      member.isActive = isActive;
      member.status = isActive ? "ACTIVE" : "INACTIVE";
      await member.save({ transaction });
      for (const report of reportReassignments) {
        await report.save({ transaction });
      }

      if (structureChanged) {
        await Task.update(
          { department },
          {
            where: {
              assignedTo: member.id,
              status: { [Op.notIn]: ["Completed", "DONE"] },
            },
            transaction,
          }
        );
      }
      return { memberId: member.id };
    });

    const responseByError = {
      NOT_FOUND: [404, "Team member not found."],
      FORBIDDEN: [403, "You cannot update this member."],
      MANAGER_REQUIRED: [403, "Only a Manager can change a member's department or position."],
      OUT_OF_SCOPE: [403, "The updated member must remain below you in your department."],
      LAST_MANAGER: [409, "The last active Manager cannot be demoted or deactivated."],
      REPORTS_NEED_MANAGER: [409, "Reassign this member's direct reports to eligible managers before changing their structure or active state."],
      INVALID_REPORTING: [400, "Choose an active reporting manager in the same department with an eligible position."],
      PARENT_FORBIDDEN: [403, "You cannot assign this reporting manager."],
      CIRCULAR_REPORTING: [400, "Reporting relationships cannot contain a cycle."],
    };
    if (outcome.error) {
      const [statusCode, message] = responseByError[outcome.error];
      return res.status(statusCode).json({ success: false, message });
    }

    const updatedMember = await User.findByPk(outcome.memberId, {
      attributes: [
        "id",
        "name",
        "email",
        "department",
        "position",
        "reportsToId",
        "employeeId",
        "isActive",
        "joinedAt",
        "lastActivityAt",
        "createdAt",
      ],
      include: [{
        model: User,
        as: "reportsTo",
        attributes: ["id", "name", "position", "department", "employeeId"],
        required: false,
      }],
    });
    return res.status(200).json({ success: true, message: "Member updated.", data: { member: updatedMember } });
  } catch (error) {
    console.error("Update Member Error:", error);
    return res.status(500).json({ success: false, message: "Unable to update this member." });
  }
};

module.exports = {
  getMembers,
  getDirectory,
  getTeamDirectory,
  searchTeamMembers,
  getMemberOverview,
  getMemberDetail,
  updateMember,
};
