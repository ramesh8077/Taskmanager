/**
 * Task Controller
 * 
 * Handles all task-related business logic:
 *   - createTask:      Creates a new task and assigns it to a member (Admin only).
 *   - getTasks:        Retrieves tasks based on user role (RBAC-filtered) with 
 *                      filtering, sorting, and search capabilities.
 *   - updateStatus:    Updates task status (Admin or assigned Member).
 *   - updatePriority:  Updates task priority (Admin only).
 *   - getTaskHistory:  Gets the timeline/history of a specific task.
 * 
 * RBAC Logic:
 *   - Admin:  Can see ALL tasks, create tasks, update any task's status/priority.
 *   - Member: Can see ONLY their assigned tasks, update ONLY their task status.
 * 
 * Filtering & Search:
 *   - status:     Filter by task status (Pending, In-Progress, Completed)
 *   - priority:   Filter by priority (Low, Medium, High, Urgent)
 *   - assignedTo: Filter by assigned member ID
 *   - projectId:  Filter by project ID
 *   - overdue:    Filter overdue tasks (status Pending/In-Progress & dueDate < today)
 *   - search:     Search across task title, description, assignee name, or task ID
 *   - sortBy:     Sort by field (dueDate, priority, status, createdAt)
 *   - sortOrder:  Sort direction (ASC, DESC)
 */

const { Op } = require("sequelize");
const db = require("../models");

const Task = db.Task;
const Project = db.Project;
const User = db.User;
const TaskHistory = db.TaskHistory;
const Ticket = db.Ticket;
const DeadlineHistory = db.DeadlineHistory;
const ActivityLog = db.ActivityLog;
const {
  canAssignTask,
  canEditTask,
  canDeleteTask,
  canUpdateProgress,
  isManager,
} = require("../lib/permissions");
const {
  buildTaskQuery,
  visibleUserIds,
} = require("../lib/queryFilters");

async function findVisibleTask(actor, id, options = {}) {
  const allowedIds = await visibleUserIds(User, actor);
  return Task.findOne({
    ...options,
    where: isManager(actor)
      ? { id }
      : { id, assignedTo: { [Op.in]: allowedIds } },
    include: [
      ...(options.include || []),
      { model: User, as: "assignee", attributes: ["id", "name", "email", "department", "position", "createdById"], required: false },
    ],
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// CREATE TASK
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @desc    Create a new task and assign it to a member
 * @route   POST /api/tasks
 * @access  Private (Admin only)
 */
const createTask = async (req, res) => {
  try {
    const { title, description, dueDate, projectId, assignedTo, priority } = req.body;

    // ── Validate required fields ──────────────────────────────────────────
    if (!title || !dueDate || !projectId || !assignedTo) {
      return res.status(400).json({
        success: false,
        message: "Please provide title, dueDate, projectId, and assignedTo.",
      });
    }

    // ── Validate priority if provided ─────────────────────────────────────
    const validPriorities = ["Low", "Medium", "High", "Urgent"];
    const taskPriority = priority || "Medium";
    if (!validPriorities.includes(taskPriority)) {
      return res.status(400).json({
        success: false,
        message: `Invalid priority. Must be one of: ${validPriorities.join(", ")}`,
      });
    }

    // ── Verify the project exists ─────────────────────────────────────────
    const project = await Project.findByPk(projectId);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: `Project with ID ${projectId} not found.`,
      });
    }
    if (!isManager(req.user) && Number(project.createdBy) !== Number(req.user.id)) {
      const visibleIds = await visibleUserIds(User, req.user);
      const hasVisibleTask = visibleIds.length > 0 && await Task.count({
        where: { projectId, assignedTo: { [Op.in]: visibleIds } },
      }) > 0;
      if (!hasVisibleTask) {
        return res.status(403).json({ success: false, message: "This project is outside your permitted scope." });
      }
    }

    // ── Verify the assigned user exists and is a Member ───────────────────
    const assignee = await User.findOne({
      where: { id: assignedTo, status: "ACTIVE", isActive: true },
    });

    if (!assignee || !canAssignTask(req.user, assignee)) {
      return res.status(403).json({
        success: false,
        message: "You cannot assign tasks to this user.",
      });
    }

    // ── Create the task ───────────────────────────────────────────────────
    const taskWithDetails = await db.sequelize.transaction(async (transaction) => {
      const newTask = await Task.create(
        {
          title,
          description: description || null,
          dueDate,
          projectId,
          assignedTo: assignee.id,
          assignedById: req.user.id,
          createdById: req.user.id,
          department: assignee.department,
          priority: taskPriority,
          status: "Pending",
        },
        { transaction }
      );
      await TaskHistory.create(
        {
          taskId: newTask.id,
          changedBy: req.user.id,
          field: "task",
          oldValue: null,
          newValue: `Created with priority: ${taskPriority}, assigned to: ${assignee.name}`,
          action: "created",
        },
        { transaction }
      );
      await ActivityLog.create({
        actorId: req.user.id,
        action: "task.created",
        entityType: "task",
        entityId: String(newTask.id),
        metadata: { assignedTo: assignee.id, projectId },
      }, { transaction });
      return Task.findByPk(newTask.id, {
        transaction,
        include: [
          { model: Project, as: "project", attributes: ["id", "title"] },
          { model: User, as: "assignee", attributes: ["id", "name", "email"] },
        ],
      });
    });

    return res.status(201).json({
      success: true,
      message: "Task created and assigned successfully.",
      data: { task: taskWithDetails },
    });
  } catch (error) {
    // Handle Sequelize validation errors
    if (error.name === "SequelizeValidationError") {
      const messages = error.errors.map((e) => e.message);
      return res.status(400).json({
        success: false,
        message: "Validation failed.",
        errors: messages,
      });
    }

    // Handle foreign key constraint errors
    if (error.name === "SequelizeForeignKeyConstraintError") {
      return res.status(400).json({
        success: false,
        message: "Invalid projectId or assignedTo. Referenced record does not exist.",
      });
    }

    console.error("❌ Create Task Error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error while creating task.",
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET TASKS (RBAC-Filtered with Search, Filter, Sort)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @desc    Get tasks — Admin sees ALL, Member sees ONLY their assigned tasks
 *          Supports filtering, searching, and sorting via query params
 * @route   GET /api/tasks
 * @access  Private (Authenticated)
 * 
 * @query   status      - Filter by status: Pending, In-Progress, Completed
 * @query   priority    - Filter by priority: Low, Medium, High, Urgent
 * @query   assignedTo  - Filter by member ID
 * @query   projectId   - Filter by project ID
 * @query   overdue     - Set to "true" to filter only overdue tasks
 * @query   search      - Search term (searches title, description, assignee name, task ID)
 * @query   sortBy      - Sort by: dueDate, priority, status, createdAt (default: createdAt)
 * @query   sortOrder   - Sort direction: ASC, DESC (default: DESC)
 */
const getTasks = async (req, res) => {
  try {
    const query = req.validatedQuery || req.query;
    const filters = { ...query };
    if (query.search) {
      const ticketConditions = [
        { ticketId: { [Op.like]: `%${query.search}%` } },
      ];
      if (/^\d+$/.test(query.search)) ticketConditions.push({ id: Number(query.search) });
      const tickets = await Ticket.findAll({
        where: { [Op.or]: ticketConditions },
        attributes: ["taskId"],
        raw: true,
      });
      filters.ticketTaskIds = tickets.map(({ taskId }) => taskId).filter(Boolean);
    }
    const { where, page, pageSize } = await buildTaskQuery({
      actor: req.user,
      User,
      DeadlineHistory,
      filters,
    });
    const includeClause = [
      {
        model: Project,
        as: "project",
        attributes: ["id", "title", "description"],
      },
      {
        model: User,
        as: "assignee",
        attributes: ["id", "name", "email", "department", "position", "employeeId"],
        required: false,
      },
    ];
    const direction = query.sortOrder?.toUpperCase() === "ASC" ? "ASC" : "DESC";
    const sortColumns = {
      dueDate: "dueDate",
      priority: "priority",
      status: "status",
      createdAt: "createdAt",
    };
    const order = query.sortBy === "name"
      ? [[{ model: User, as: "assignee" }, "name", direction]]
      : query.sortBy === "title"
        ? [["title", direction]]
      : query.sortBy === "progress"
        ? [["progress", direction]]
        : query.sortBy === "dueDate"
          ? [["dueDate", direction]]
          : query.sortBy === "priority"
            ? [[db.sequelize.literal(`FIELD(Task.priority, 'Urgent', 'High', 'Medium', 'Low') ${direction}`)]]
            : query.sortBy === "status"
              ? [[db.sequelize.literal(`FIELD(Task.status, 'Pending', 'In-Progress', 'Completed') ${direction}`)]]
              : [[sortColumns[query.sortBy] || "createdAt", direction]];
    const { rows: tasks, count: total } = await Task.findAndCountAll({
      where,
      include: includeClause,
      order: [...order, ["id", "DESC"]],
      limit: pageSize,
      offset: (page - 1) * pageSize,
      distinct: true,
    });

    return res.status(200).json({
      success: true,
      message: "Tasks fetched successfully.",
      data: {
        count: tasks.length,
        total,
        page,
        pageSize,
        pageCount: Math.max(1, Math.ceil(total / pageSize)),
        tasks,
      },
    });
  } catch (error) {
    console.error("❌ Get Tasks Error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error while fetching tasks.",
    });
  }
};

const getTaskDashboardSummary = async (req, res) => {
  try {
    const { where } = await buildTaskQuery({
      actor: req.user,
      User,
      DeadlineHistory,
    });
    const today = new Date().toISOString().slice(0, 10);
    const atRiskThrough = new Date();
    atRiskThrough.setUTCDate(atRiskThrough.getUTCDate() + 2);
    const atRiskDate = atRiskThrough.toISOString().slice(0, 10);
    const scopedWhere = (...conditions) => ({ [Op.and]: [where, ...conditions] });

    const [
      total,
      completed,
      inProgress,
      pending,
      overdue,
      groupedTasks,
      groupedProjects,
      overdueProjects,
      atRiskTasks,
      activity,
    ] = await Promise.all([
      Task.count({ where }),
      Task.count({ where: scopedWhere({ status: { [Op.in]: ["Completed", "DONE"] } }) }),
      Task.count({ where: scopedWhere({ status: "In-Progress" }) }),
      Task.count({ where: scopedWhere({ status: "Pending" }) }),
      Task.count({
        where: scopedWhere(
          { status: { [Op.notIn]: ["Completed", "DONE"] } },
          { dueDate: { [Op.lt]: today } }
        ),
      }),
      Task.findAll({
        attributes: [
          "department",
          "status",
          [db.sequelize.fn("COUNT", db.sequelize.col("id")), "count"],
        ],
        where,
        group: ["department", "status"],
        raw: true,
      }),
      Task.findAll({
        attributes: [
          "projectId",
          "status",
          [db.sequelize.fn("COUNT", db.sequelize.col("id")), "count"],
        ],
        where,
        group: ["projectId", "status"],
        raw: true,
      }),
      Task.findAll({
        attributes: [
          "projectId",
          [db.sequelize.fn("COUNT", db.sequelize.col("id")), "count"],
        ],
        where: scopedWhere(
          { status: { [Op.notIn]: ["Completed", "DONE"] } },
          { dueDate: { [Op.lt]: today } }
        ),
        group: ["projectId"],
        raw: true,
      }),
      Task.findAll({
        where: scopedWhere(
          { status: { [Op.notIn]: ["Completed", "DONE"] } },
          { dueDate: { [Op.lte]: atRiskDate } }
        ),
        include: [
          { model: Project, as: "project", attributes: ["id", "title"], required: false },
          { model: User, as: "assignee", attributes: ["id", "name"], required: false },
        ],
        order: [["dueDate", "ASC"], ["id", "ASC"]],
        limit: 5,
      }),
      TaskHistory.findAll({
        attributes: ["id", "taskId", "field", "oldValue", "newValue", "action", "createdAt", "changedBy"],
        include: [
          {
            model: Task,
            as: "task",
            attributes: ["id", "title"],
            where,
            required: true,
          },
          {
            model: User,
            as: "changedByUser",
            attributes: ["id", "name"],
            required: false,
          },
        ],
        order: [["createdAt", "DESC"], ["id", "DESC"]],
        limit: 10,
      }),
    ]);

    const departments = new Map();
    for (const row of groupedTasks) {
      const name = row.department || "Unassigned";
      const department = departments.get(name) || {
        department: name,
        total: 0,
        completed: 0,
        inProgress: 0,
        pending: 0,
      };
      const count = Number(row.count);
      department.total += count;
      if (row.status === "Completed" || row.status === "DONE") department.completed += count;
      else if (row.status === "In-Progress") department.inProgress += count;
      else if (row.status === "Pending") department.pending += count;
      departments.set(name, department);
    }
    const projectStats = new Map();
    for (const row of groupedProjects) {
      if (row.projectId === null) continue;
      const projectId = Number(row.projectId);
      const project = projectStats.get(projectId) || { projectId, total: 0, completed: 0, overdue: 0 };
      const count = Number(row.count);
      project.total += count;
      if (row.status === "Completed" || row.status === "DONE") project.completed += count;
      projectStats.set(projectId, project);
    }
    for (const row of overdueProjects) {
      const project = projectStats.get(Number(row.projectId));
      if (project) project.overdue = Number(row.count);
    }

    return res.status(200).json({
      success: true,
      message: "Task dashboard summary fetched successfully.",
      data: {
        summary: {
          total,
          completed,
          inProgress,
          pending,
          overdue,
          completionRate: total ? Math.round((completed / total) * 100) : 0,
        },
        departments: [...departments.values()].sort((a, b) => a.department.localeCompare(b.department)),
        projectStats: [...projectStats.values()],
        atRiskTasks,
        activity,
      },
    });
  } catch (error) {
    console.error("Get Task Dashboard Summary Error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to load the task dashboard summary.",
    });
  }
};

const updateTask = async (req, res) => {
  try {
    const { id } = req.validatedParams || req.params;
    const changes = req.body;
    const updatedTask = await db.sequelize.transaction(async (transaction) => {
      const task = await findVisibleTask(req.user, id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!task) return { error: "NOT_FOUND" };
      if (!canEditTask(req.user, task)) return { error: "FORBIDDEN" };

      const changedFields = [];
      for (const field of ["title", "description", "priority", "dueDate"]) {
        if (!Object.hasOwn(changes, field) || task[field] === changes[field]) continue;
        const oldValue = task[field] == null ? null : String(task[field]);
        const newValue = changes[field] == null ? null : String(changes[field]);
        task[field] = changes[field];
        changedFields.push({ field, oldValue, newValue });
      }

      if (changedFields.length) {
        await task.save({ transaction });
        for (const change of changedFields) {
          await TaskHistory.create({
            taskId: task.id,
            changedBy: req.user.id,
            field: change.field,
            oldValue: change.oldValue,
            newValue: change.newValue,
            action: change.field === "dueDate" ? "deadline_changed" : "updated",
          }, { transaction });
          if (change.field === "dueDate") {
            await DeadlineHistory.create({
              taskId: task.id,
              oldDeadline: change.oldValue,
              newDeadline: change.newValue,
              changedById: req.user.id,
              reason: changes.reason,
            }, { transaction });
          }
        }
        await ActivityLog.create({
          actorId: req.user.id,
          action: "task.updated",
          entityType: "task",
          entityId: String(task.id),
          metadata: { fields: changedFields.map(({ field }) => field) },
        }, { transaction });
      }
      return task;
    });

    if (updatedTask?.error === "NOT_FOUND") {
      return res.status(404).json({ success: false, message: "Task not found." });
    }
    if (updatedTask?.error === "FORBIDDEN") {
      return res.status(403).json({ success: false, message: "You cannot edit this task." });
    }
    return res.status(200).json({ success: true, data: { task: updatedTask } });
  } catch (error) {
    console.error("Update Task Error:", error);
    return res.status(500).json({ success: false, message: "Unable to update this task." });
  }
};

const deleteTask = async (req, res) => {
  try {
    const { id } = req.validatedParams || req.params;
    const result = await db.sequelize.transaction(async (transaction) => {
      const task = await findVisibleTask(req.user, id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!task) return "NOT_FOUND";
      if (!canDeleteTask(req.user, task)) return "FORBIDDEN";
      await ActivityLog.create({
        actorId: req.user.id,
        action: "task.deleted",
        entityType: "task",
        entityId: String(task.id),
        metadata: { title: task.title },
      }, { transaction });
      await task.destroy({ transaction });
      return "DELETED";
    });
    if (result === "NOT_FOUND") return res.status(404).json({ success: false, message: "Task not found." });
    if (result === "FORBIDDEN") return res.status(403).json({ success: false, message: "You cannot delete this task." });
    return res.status(200).json({ success: true, message: "Task deleted." });
  } catch (error) {
    console.error("Delete Task Error:", error);
    return res.status(500).json({ success: false, message: "Unable to delete this task." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE TASK STATUS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @desc    Update task status (Admin or the assigned Member)
 * @route   PUT /api/tasks/:id/status
 * @access  Private (Authenticated — Admin or assigned Member)
 */
const updateStatus = async (req, res) => {
  try {
    const { id } = req.validatedParams || req.params;
    const { status, completedBy, completedAt } = req.body;

    // ── Validate status value ─────────────────────────────────────────────
    const validStatuses = ["Pending", "In-Progress", "Completed"];

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Please provide a status value.",
      });
    }

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      });
    }

    // ── When marking as Completed, require completedBy and completedAt ────
    if (status === "Completed") {
      if (!completedBy || !completedBy.trim()) {
        return res.status(400).json({
          success: false,
          message: "Please provide the name of the person completing this task (completedBy).",
        });
      }

      if (!completedAt) {
        return res.status(400).json({
          success: false,
          message: "Please provide the completion date (completedAt).",
        });
      }

      // Validate that completedAt is not before today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const completionDate = new Date(completedAt);
      completionDate.setHours(0, 0, 0, 0);

      if (completionDate < today) {
        return res.status(400).json({
          success: false,
          message: "Completion date cannot be in the past. Please select today or a future date.",
        });
      }
    }

    // ── Find the task ─────────────────────────────────────────────────────
    const task = await findVisibleTask(req.user, id, {
      include: [{ model: Project, as: "project", attributes: ["id", "createdBy"] }],
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: `Task with ID ${id} not found.`,
      });
    }
    if (!canUpdateProgress(req.user, task)) {
      return res.status(403).json({ success: false, message: "You cannot update this task's status." });
    }

    // ── Log status change in history ──────────────────────────────────────
    await db.sequelize.transaction(async (transaction) => {
      const oldStatus = task.status;
      const oldProgress = task.progress;
      if (oldStatus !== status) {
        const historyNewValue = status === "Completed"
          ? `Completed by: ${completedBy.trim()} on ${completedAt}`
          : status;

        await TaskHistory.create(
          {
            taskId: task.id,
            changedBy: req.user.id,
            field: "status",
            oldValue: oldStatus,
            newValue: historyNewValue,
            action: "status_changed",
          },
          { transaction }
        );
      }

      task.status = status;
      if (status === "Completed") {
        task.progress = 100;
        task.completedBy = completedBy.trim();
        task.completedAt = completedAt;
      } else {
        if (status === "Pending" || oldStatus === "Completed") task.progress = 0;
        task.completedBy = null;
        task.completedAt = null;
      }
      if (oldProgress !== task.progress) {
        await TaskHistory.create(
          {
            taskId: task.id,
            changedBy: req.user.id,
            field: "progress",
            oldValue: String(oldProgress),
            newValue: String(task.progress),
            action: "updated",
          },
          { transaction }
        );
      }
      await task.save({ transaction });
      if (oldStatus !== status || oldProgress !== task.progress) {
        await ActivityLog.create({
          actorId: req.user.id,
          action: "task.status_updated",
          entityType: "task",
          entityId: String(task.id),
          metadata: { oldStatus, status, progress: task.progress },
        }, { transaction });
      }
    });

    // ── Re-fetch with associations for the response ───────────────────────
    const updatedTask = await findVisibleTask(req.user, id, {
      include: [{ model: Project, as: "project", attributes: ["id", "title", "createdBy"] }],
    });

    return res.status(200).json({
      success: true,
      message: `Task status updated to '${status}' successfully.`,
      data: { task: updatedTask },
    });
  } catch (error) {
    console.error("❌ Update Task Status Error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error while updating task status.",
    });
  }
};

const updateProgress = async (req, res) => {
  try {
    const { id } = req.validatedParams || req.params;
    const { progress } = req.body;
    const task = await findVisibleTask(req.user, id, {
      include: [{ model: Project, as: "project", attributes: ["id", "title", "createdBy"] }],
    });
    if (!task) {
      return res.status(404).json({ success: false, message: `Task with ID ${id} not found.` });
    }
    if (!canUpdateProgress(req.user, task)) {
      return res.status(403).json({ success: false, message: "You cannot update this task's progress." });
    }
    if (task.status === "Completed" && progress !== 100) {
      return res.status(409).json({
        success: false,
        message: "Completed tasks must remain at 100%. Change the task status before editing progress.",
      });
    }
    if (task.status !== "Completed" && progress === 100) {
      return res.status(400).json({
        success: false,
        message: "Complete the task using the completion workflow to set progress to 100%.",
      });
    }
    if (task.progress !== progress) {
      await db.sequelize.transaction(async (transaction) => {
        if (progress > 0 && task.status === "Pending") {
          await TaskHistory.create(
            {
              taskId: task.id,
              changedBy: req.user.id,
              field: "status",
              oldValue: task.status,
              newValue: "In-Progress",
              action: "status_changed",
            },
            { transaction }
          );
          task.status = "In-Progress";
        }
        await TaskHistory.create(
          {
            taskId: task.id,
            changedBy: req.user.id,
            field: "progress",
            oldValue: String(task.progress),
            newValue: String(progress),
            action: "updated",
          },
          { transaction }
        );
        task.progress = progress;
        await task.save({ transaction });
        await ActivityLog.create({
          actorId: req.user.id,
          action: "task.progress_updated",
          entityType: "task",
          entityId: String(task.id),
          metadata: { progress },
        }, { transaction });
      });
    }
    return res.status(200).json({
      success: true,
      message: "Task progress updated successfully.",
      data: { task: { id: task.id, progress: task.progress, status: task.status } },
    });
  } catch (error) {
    console.error("❌ Update Task Progress Error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error while updating task progress.",
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE TASK PRIORITY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @desc    Update task priority (Admin only)
 * @route   PUT /api/tasks/:id/priority
 * @access  Private (Admin only)
 */
const updatePriority = async (req, res) => {
  try {
    const { id } = req.validatedParams || req.params;
    const { priority } = req.body;

    // ── Validate priority value ───────────────────────────────────────────
    const validPriorities = ["Low", "Medium", "High", "Urgent"];

    if (!priority) {
      return res.status(400).json({
        success: false,
        message: "Please provide a priority value.",
      });
    }

    if (!validPriorities.includes(priority)) {
      return res.status(400).json({
        success: false,
        message: `Invalid priority. Must be one of: ${validPriorities.join(", ")}`,
      });
    }

    // ── Find the task ─────────────────────────────────────────────────────
    const task = await findVisibleTask(req.user, id, {
      include: [{ model: Project, as: "project", attributes: ["id", "createdBy"] }],
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: `Task with ID ${id} not found.`,
      });
    }
    if (!canEditTask(req.user, task)) {
      return res.status(403).json({ success: false, message: "You cannot edit this task's priority." });
    }

    // ── Log priority change in history ────────────────────────────────────
    await db.sequelize.transaction(async (transaction) => {
      const oldPriority = task.priority;
      if (oldPriority !== priority) {
        await TaskHistory.create(
          {
            taskId: task.id,
            changedBy: req.user.id,
            field: "priority",
            oldValue: oldPriority,
            newValue: priority,
            action: "priority_changed",
          },
          { transaction }
        );
      }
      task.priority = priority;
      await task.save({ transaction });
      await ActivityLog.create({
        actorId: req.user.id,
        action: "task.priority_updated",
        entityType: "task",
        entityId: String(task.id),
        metadata: { oldPriority, priority },
      }, { transaction });
    });

    // ── Re-fetch with associations ────────────────────────────────────────
    const updatedTask = await findVisibleTask(req.user, id, {
      include: [{ model: Project, as: "project", attributes: ["id", "title", "createdBy"] }],
    });

    return res.status(200).json({
      success: true,
      message: `Task priority updated to '${priority}' successfully.`,
      data: { task: updatedTask },
    });
  } catch (error) {
    console.error("❌ Update Task Priority Error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error while updating task priority.",
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET TASK HISTORY / TIMELINE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @desc    Get the complete timeline/history of a specific task
 * @route   GET /api/tasks/:id/history
 * @access  Private (Authenticated — Admin or assigned Member)
 */
const getTaskHistory = async (req, res) => {
  try {
    const { id } = req.validatedParams || req.params;

    // ── Find the task ─────────────────────────────────────────────────────
    const task = await findVisibleTask(req.user, id, {
      include: [{ model: Project, as: "project", attributes: ["id", "title", "createdBy"] }],
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: `Task with ID ${id} not found.`,
      });
    }

    // ── Fetch history entries ─────────────────────────────────────────────
    const history = await TaskHistory.findAll({
      where: { taskId: id },
      include: [
        {
          model: User,
          as: "changedByUser",
          attributes: ["id", "name", "email"],
        },
      ],
      order: [["createdAt", "ASC"]],
    });

    return res.status(200).json({
      success: true,
      message: "Task history fetched successfully.",
      data: {
        task,
        count: history.length,
        history,
      },
    });
  } catch (error) {
    console.error("❌ Get Task History Error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error while fetching task history.",
    });
  }
};

module.exports = {
  createTask,
  getTasks,
  getTaskDashboardSummary,
  updateTask,
  deleteTask,
  updateStatus,
  updatePriority,
  updateProgress,
  getTaskHistory,
};
