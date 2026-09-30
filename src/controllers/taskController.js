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
const {
  scopedTaskQuery,
  scopedTaskByIdQuery,
  scopedProjectQuery,
  scopedUserQuery,
} = require("../lib/scope");

// ─── Priority weight map for sorting ────────────────────────────────────────
const PRIORITY_ORDER = { Urgent: 1, High: 2, Medium: 3, Low: 4 };

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
    const project = await Project.findOne({
      where: { [Op.and]: [{ id: projectId }, scopedProjectQuery(req.user)] },
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        message: `Project with ID ${projectId} not found.`,
      });
    }

    // ── Verify the assigned user exists and is a Member ───────────────────
    const assignee = await User.findOne({
      where: {
        [Op.and]: [
          { id: assignedTo, status: "ACTIVE", role: "EMPLOYEE" },
          scopedUserQuery(req.user),
        ],
      },
    });

    if (!assignee) {
      return res.status(404).json({
        success: false,
        message: `User with ID ${assignedTo} not found.`,
      });
    }

    if (assignee.role !== "EMPLOYEE") {
      return res.status(400).json({
        success: false,
        message: "Tasks can only be assigned to users with the 'Member' role.",
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
    const {
      status,
      priority,
      assignedTo: filterAssignedTo,
      projectId,
      overdue,
      search,
      sortBy = "createdAt",
      sortOrder = "DESC",
    } = req.validatedQuery || req.query;

    // ── Build the WHERE clause based on user role ─────────────────────────
    const whereClause = { [Op.and]: [scopedTaskQuery(req.user)] };

    // ── Apply filters ────────────────────────────────────────────────────
    if (status) {
      // Support comma-separated status values for bulk filtering
      const statuses = status.split(",").map((s) => s.trim());
      whereClause.status = { [Op.in]: statuses };
    }

    if (priority) {
      // Support comma-separated priority values for bulk filtering
      const priorities = priority.split(",").map((p) => p.trim());
      whereClause.priority = { [Op.in]: priorities };
    }

    if (filterAssignedTo && req.user.permissions.includes("task:assign")) {
      whereClause.assignedTo = filterAssignedTo;
    }

    if (projectId) {
      whereClause.projectId = projectId;
    }

    // Overdue filter: status is NOT Completed & dueDate is in the past
    if (overdue === "true") {
      const today = new Date().toISOString().split("T")[0];
      whereClause.dueDate = { [Op.lt]: today };
      whereClause.status = { [Op.ne]: "Completed" };
    }

    // ── Build search conditions ──────────────────────────────────────────
    const includeClause = [
      {
        model: Project,
        as: "project",
        attributes: ["id", "title", "description"],
      },
      {
        model: User,
        as: "assignee",
        attributes: ["id", "name", "email"],
      },
    ];

    if (search && search.trim()) {
      const searchTerm = search.trim();

      // Check if search term is a number (could be task ID)
      const isNumericSearch = /^\d+$/.test(searchTerm);

      const searchConditions = [
        { title: { [Op.like]: `%${searchTerm}%` } },
        { description: { [Op.like]: `%${searchTerm}%` } },
      ];

      if (isNumericSearch) {
        searchConditions.push({ id: parseInt(searchTerm) });
      }

      // Search by assignee name — use a subquery approach
      searchConditions.push({
        "$assignee.name$": { [Op.like]: `%${searchTerm}%` },
      });

      whereClause[Op.and].push({ [Op.or]: searchConditions });
    }

    // ── Build sort order ─────────────────────────────────────────────────
    let order;
    const direction = sortOrder.toUpperCase() === "ASC" ? "ASC" : "DESC";

    switch (sortBy) {
      case "dueDate":
        order = [["dueDate", direction]];
        break;
      case "priority":
        // Custom priority ordering using FIELD()
        order = [
          [
            db.sequelize.literal(
              `FIELD(Task.priority, 'Urgent', 'High', 'Medium', 'Low') ${direction}`
            ),
          ],
        ];
        break;
      case "status":
        order = [
          [
            db.sequelize.literal(
              `FIELD(Task.status, 'Pending', 'In-Progress', 'Completed') ${direction}`
            ),
          ],
        ];
        break;
      default:
        order = [["createdAt", direction]];
    }

    // ── Fetch tasks with full associations ────────────────────────────────
    const tasks = await Task.findAll({
      where: whereClause,
      include: includeClause,
      order,
    });

    return res.status(200).json({
      success: true,
      message: "Tasks fetched successfully.",
      data: {
        count: tasks.length,
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
    const task = await Task.findOne({
      where: scopedTaskByIdQuery(req.user, id),
      include: [
        { model: Project, as: "project", attributes: ["id", "createdBy"] },
        { model: User, as: "assignee", attributes: ["id", "createdById"] },
      ],
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: `Task with ID ${id} not found.`,
      });
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
    });

    // ── Re-fetch with associations for the response ───────────────────────
    const updatedTask = await Task.findOne({
      where: scopedTaskByIdQuery(req.user, id),
      include: [
        {
          model: Project,
          as: "project",
          attributes: ["id", "title", "createdBy"],
        },
        {
          model: User,
          as: "assignee",
          attributes: ["id", "name", "email"],
        },
      ],
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
    const task = await Task.findOne({
      where: scopedTaskByIdQuery(req.user, id),
      include: [
        { model: Project, as: "project", attributes: ["id", "title", "createdBy"] },
        { model: User, as: "assignee", attributes: ["id", "name", "email", "createdById"] },
      ],
    });
    if (!task) {
      return res.status(404).json({ success: false, message: `Task with ID ${id} not found.` });
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
    const task = await Task.findOne({
      where: scopedTaskByIdQuery(req.user, id),
      include: [
        { model: Project, as: "project", attributes: ["id", "createdBy"] },
        { model: User, as: "assignee", attributes: ["id", "createdById"] },
      ],
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: `Task with ID ${id} not found.`,
      });
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
    });

    // ── Re-fetch with associations ────────────────────────────────────────
    const updatedTask = await Task.findOne({
      where: scopedTaskByIdQuery(req.user, id),
      include: [
        {
          model: Project,
          as: "project",
          attributes: ["id", "title", "createdBy"],
        },
        {
          model: User,
          as: "assignee",
          attributes: ["id", "name", "email"],
        },
      ],
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
    const task = await Task.findOne({
      where: { [Op.and]: [{ id }, scopedTaskQuery(req.user)] },
      include: [
        {
          model: Project,
          as: "project",
          attributes: ["id", "title", "createdBy"],
        },
        {
          model: User,
          as: "assignee",
          attributes: ["id", "createdById"],
        },
      ],
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
  updateStatus,
  updatePriority,
  updateProgress,
  getTaskHistory,
};
