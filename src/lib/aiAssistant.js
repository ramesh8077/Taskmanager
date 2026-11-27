const { Op } = require("sequelize");
const db = require("../models");
const { can } = require("./rbac");
const {
  canEditTask,
  canManageDeadlines,
  canManagePriority,
  isManager,
} = require("./permissions");
const { visibleUserIds } = require("./queryFilters");
const {
  createProjectBody,
  createTaskBody,
  taskStatusBody,
  taskPriorityBody,
  taskProgressBody,
  taskCommentBody,
  taskAssignmentBody,
  updateTaskBody,
  taskQuery,
  memberUpdateBody,
  createTicketBody,
  createTicketCommentBody,
  ticketStatusBody,
  ticketProgressBody,
  ticketAssignmentBody,
  ticketDeadlineBody,
  ticketPriorityBody,
  reopenTicketBody,
  ticketQuery,
  createMeetingBody,
  deadlineExtensionRequestBody,
  deadlineExtensionReviewBody,
  deadlineExtensionQuery,
} = require("../validators/schemas");
const taskController = require("../controllers/taskController");
const ticketController = require("../controllers/ticketController");
const ticketWorkflowController = require("../controllers/ticketWorkflowController");
const projectController = require("../controllers/projectController");
const userController = require("../controllers/userController");
const meetingController = require("../controllers/meetingController");
const deadlineExtensionController = require("../controllers/deadlineExtensionController");
const reportController = require("../controllers/reportController");
const chatController = require("../controllers/chatController");
const { getGeminiApiKey, requestGeminiWithFallback } = require("./geminiMom");

const MAX_TOOL_ROUNDS = 6;

async function invokeController(handler, { user, body = {}, query = {}, params = {} }) {
  let statusCode = 200;
  let payload = null;
  const req = {
    user,
    body,
    query,
    params,
    validatedBody: body,
    validatedQuery: query,
    validatedParams: params,
    headers: {},
  };
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      payload = data;
      return this;
    },
  };
  await handler(req, res);
  return { statusCode, payload };
}

function validateSchema(schema, value) {
  const parsed = schema.safeParse(value);
  if (parsed.success) return { ok: true, data: parsed.data };
  const firstIssue = parsed.error.issues?.[0];
  return {
    ok: false,
    error: firstIssue?.message || "Invalid parameters.",
  };
}

function formatControllerResult({ statusCode, payload }) {
  if (statusCode >= 200 && statusCode < 300 && payload?.success !== false) {
    return {
      ok: true,
      message: payload?.message || "Success",
      data: payload?.data ?? payload,
    };
  }
  return {
    ok: false,
    statusCode,
    message: payload?.message || payload?.error?.message || "Action failed.",
  };
}

async function resolveReportingManager(actor) {
  if (actor?.reportsToId) {
    const manager = await db.User.findOne({
      where: { id: actor.reportsToId, status: "ACTIVE", isActive: true },
      attributes: ["id", "name", "position", "department"],
      raw: true,
    });
    if (manager) return manager;
  }
  const fallback = await db.User.findOne({
    where: {
      position: "MANAGER",
      status: "ACTIVE",
      isActive: true,
      id: { [Op.ne]: actor.id },
    },
    attributes: ["id", "name", "position", "department"],
    order: [["id", "ASC"]],
    raw: true,
  });
  return fallback || null;
}

const TOOL_DECLARATIONS = [
  {
    name: "get_my_profile_and_permissions",
    description: "Get the current authenticated user's profile, role, position, department, reporting manager, deadline extension permission, and effective Task Manager capabilities.",
    parameters: { type: "OBJECT", properties: {} },
  },
  {
    name: "list_tasks",
    description: "List or search tasks visible to the user according to their role and reporting hierarchy.",
    parameters: {
      type: "OBJECT",
      properties: {
        status: { type: "STRING", description: "Optional status filter: Pending, In-Progress, or Completed." },
        priority: { type: "STRING", description: "Optional priority filter: Low, Medium, High, or Urgent." },
        assignedToMe: { type: "BOOLEAN", description: "True to list only tasks assigned to the current user." },
        overdue: { type: "BOOLEAN", description: "True to filter only overdue tasks." },
        search: { type: "STRING", description: "Optional search text for task title, description, or ID." },
        pageSize: { type: "INTEGER", description: "Maximum tasks to return (1-50). Defaults to 20." },
      },
    },
  },
  {
    name: "create_task",
    description: "Create and assign a new task. Requires task:create permission and an assignee within the user's permitted team.",
    parameters: {
      type: "OBJECT",
      required: ["title", "dueDate", "assignedTo"],
      properties: {
        title: { type: "STRING", description: "Task title (3-200 chars)." },
        description: { type: "STRING", description: "Optional detailed description." },
        dueDate: { type: "STRING", description: "Due date in YYYY-MM-DD format." },
        startDate: { type: "STRING", description: "Optional start date in YYYY-MM-DD format." },
        assignedTo: { type: "INTEGER", description: "User ID of the assignee." },
        projectId: { type: "INTEGER", description: "Optional project ID." },
        priority: { type: "STRING", enum: ["Low", "Medium", "High", "Urgent"] },
      },
    },
  },
  {
    name: "update_task_status",
    description: "Update a task's status to Pending, In-Progress, or Completed.",
    parameters: {
      type: "OBJECT",
      required: ["taskId", "status"],
      properties: {
        taskId: { type: "INTEGER" },
        status: { type: "STRING", enum: ["Pending", "In-Progress", "Completed"] },
        completedBy: { type: "STRING", description: "Required when status is Completed (defaults to current user's name)." },
        completedAt: { type: "STRING", description: "YYYY-MM-DD completion date when status is Completed (defaults to today)." },
      },
    },
  },
  {
    name: "update_task_progress",
    description: "Update a task's progress percentage (0 to 100).",
    parameters: {
      type: "OBJECT",
      required: ["taskId", "progress"],
      properties: {
        taskId: { type: "INTEGER" },
        progress: { type: "INTEGER" },
      },
    },
  },
  {
    name: "update_task_details",
    description: "Update a task's title, description, or priority (subject to role/hierarchy permissions).",
    parameters: {
      type: "OBJECT",
      required: ["taskId"],
      properties: {
        taskId: { type: "INTEGER" },
        title: { type: "STRING" },
        description: { type: "STRING" },
        priority: { type: "STRING", enum: ["Low", "Medium", "High", "Urgent"] },
      },
    },
  },
  {
    name: "reassign_task",
    description: "Reassign a task to another teammate inside the user's permitted team.",
    parameters: {
      type: "OBJECT",
      required: ["taskId", "assignedTo"],
      properties: {
        taskId: { type: "INTEGER" },
        assignedTo: { type: "INTEGER" },
      },
    },
  },
  {
    name: "add_task_comment",
    description: "Post a comment on a visible task.",
    parameters: {
      type: "OBJECT",
      required: ["taskId", "comment"],
      properties: {
        taskId: { type: "INTEGER" },
        comment: { type: "STRING" },
      },
    },
  },
  {
    name: "delete_task",
    description: "Delete a task (requires Manager or creator authority over the assignee).",
    parameters: {
      type: "OBJECT",
      required: ["taskId"],
      properties: {
        taskId: { type: "INTEGER" },
      },
    },
  },
  {
    name: "extend_task_deadline",
    description: "Extend or update a task's deadline. If the user does NOT have permission to extend the deadline directly, this returns DEADLINE_PERMISSION_REQUIRED and triggers a Send Request action button to their reporting manager.",
    parameters: {
      type: "OBJECT",
      required: ["taskId"],
      properties: {
        taskId: { type: "INTEGER" },
        newDeadline: { type: "STRING", description: "Requested new deadline in YYYY-MM-DD format." },
        reason: { type: "STRING", description: "Reason for extending the deadline." },
      },
    },
  },
  {
    name: "send_deadline_extension_request",
    description: "Submit a deadline extension request for an assigned task directly to the user's reporting manager.",
    parameters: {
      type: "OBJECT",
      required: ["taskId", "requestedDeadline", "reason"],
      properties: {
        taskId: { type: "INTEGER" },
        requestedDeadline: { type: "STRING", description: "Future YYYY-MM-DD date later than current deadline." },
        reason: { type: "STRING", description: "Reason (at least 5 characters)." },
      },
    },
  },
  {
    name: "list_deadline_requests",
    description: "List deadline extension requests visible to the caller (for Managers, Sub-Managers, and Team Leads).",
    parameters: {
      type: "OBJECT",
      properties: {
        status: { type: "STRING", enum: ["PENDING", "APPROVED", "REJECTED"] },
        assigneeId: { type: "INTEGER" },
        taskId: { type: "INTEGER" },
      },
    },
  },
  {
    name: "review_deadline_request",
    description: "Approve or reject a pending deadline extension request.",
    parameters: {
      type: "OBJECT",
      required: ["requestId", "decision"],
      properties: {
        requestId: { type: "INTEGER" },
        decision: { type: "STRING", enum: ["APPROVED", "REJECTED"] },
        responseNote: { type: "STRING" },
      },
    },
  },
  {
    name: "list_tickets",
    description: "List or search tickets visible to the user.",
    parameters: {
      type: "OBJECT",
      properties: {
        status: { type: "STRING", description: "Open, In-Progress, Resolved, or Closed." },
        priority: { type: "STRING", description: "P0, P1, or P2." },
        view: { type: "STRING", enum: ["all", "assigned", "created"] },
        overdue: { type: "BOOLEAN" },
        search: { type: "STRING" },
      },
    },
  },
  {
    name: "create_ticket",
    description: "Create a new ticket (requires ticket:create permission).",
    parameters: {
      type: "OBJECT",
      required: ["title", "priority"],
      properties: {
        title: { type: "STRING" },
        description: { type: "STRING" },
        priority: { type: "STRING", enum: ["P0", "P1", "P2"] },
        department: { type: "STRING" },
        assignedTo: { type: "INTEGER" },
        deadline: { type: "STRING", description: "Optional YYYY-MM-DD deadline." },
        projectId: { type: "INTEGER" },
        taskId: { type: "INTEGER" },
      },
    },
  },
  {
    name: "update_ticket_status",
    description: "Update a ticket status (In-Progress, Resolved, or Closed). Resolved requires resolutionNote.",
    parameters: {
      type: "OBJECT",
      required: ["ticketId", "status"],
      properties: {
        ticketId: { type: "INTEGER" },
        status: { type: "STRING", enum: ["In-Progress", "Resolved", "Closed"] },
        resolutionNote: { type: "STRING" },
      },
    },
  },
  {
    name: "update_ticket_progress",
    description: "Update an open/in-progress ticket's progress (0-99).",
    parameters: {
      type: "OBJECT",
      required: ["ticketId", "progress"],
      properties: {
        ticketId: { type: "INTEGER" },
        progress: { type: "INTEGER" },
      },
    },
  },
  {
    name: "assign_ticket",
    description: "Assign or unassign a ticket.",
    parameters: {
      type: "OBJECT",
      required: ["ticketId"],
      properties: {
        ticketId: { type: "INTEGER" },
        assignedTo: { type: "INTEGER", description: "User ID to assign, or omit/null to unassign." },
      },
    },
  },
  {
    name: "add_ticket_comment",
    description: "Add a comment to a visible ticket.",
    parameters: {
      type: "OBJECT",
      required: ["ticketId", "comment"],
      properties: {
        ticketId: { type: "INTEGER" },
        comment: { type: "STRING" },
      },
    },
  },
  {
    name: "extend_ticket_deadline",
    description: "Extend a ticket's deadline if the user has deadline management permission on that ticket.",
    parameters: {
      type: "OBJECT",
      required: ["ticketId", "deadline", "reason"],
      properties: {
        ticketId: { type: "INTEGER" },
        deadline: { type: "STRING", description: "YYYY-MM-DD format." },
        reason: { type: "STRING" },
      },
    },
  },
  {
    name: "reopen_ticket",
    description: "Reopen a resolved or closed ticket.",
    parameters: {
      type: "OBJECT",
      required: ["ticketId", "reason"],
      properties: {
        ticketId: { type: "INTEGER" },
        reason: { type: "STRING" },
      },
    },
  },
  {
    name: "list_projects",
    description: "List projects visible to the user.",
    parameters: { type: "OBJECT", properties: {} },
  },
  {
    name: "create_project",
    description: "Create a new project (requires project:create permission).",
    parameters: {
      type: "OBJECT",
      required: ["title", "description"],
      properties: {
        title: { type: "STRING" },
        description: { type: "STRING" },
        department: { type: "STRING", description: "Required for Managers." },
      },
    },
  },
  {
    name: "list_team_members",
    description: "List active team members visible or assignable to the user, including their IDs, positions, departments, and deadline permissions.",
    parameters: {
      type: "OBJECT",
      properties: {
        forPurpose: { type: "STRING", enum: ["visible", "task_assign", "ticket_assign", "meeting_invite"] },
      },
    },
  },
  {
    name: "set_member_deadline_permission",
    description: "Manager-only action: grant or revoke a member's direct deadline extension permission.",
    parameters: {
      type: "OBJECT",
      required: ["memberId", "canExtendDeadline"],
      properties: {
        memberId: { type: "INTEGER" },
        canExtendDeadline: { type: "BOOLEAN" },
      },
    },
  },
  {
    name: "list_meetings",
    description: "List meetings the user hosts or is invited to.",
    parameters: { type: "OBJECT", properties: {} },
  },
  {
    name: "schedule_meeting",
    description: "Schedule a new team meeting with invited teammates.",
    parameters: {
      type: "OBJECT",
      required: ["title", "scheduledAt", "durationMinutes"],
      properties: {
        title: { type: "STRING" },
        agenda: { type: "STRING" },
        scheduledAt: { type: "STRING", description: "Future ISO 8601 datetime with timezone offset, e.g. 2026-11-28T15:00:00+05:30." },
        durationMinutes: { type: "INTEGER", description: "Duration in minutes (15 to 360)." },
        attendeeIds: { type: "ARRAY", items: { type: "INTEGER" } },
      },
    },
  },
  {
    name: "get_workspace_summary",
    description: "Get task, ticket, and workspace summary metrics scoped to the user's permissions.",
    parameters: { type: "OBJECT", properties: {} },
  },
  {
    name: "send_team_chat_message",
    description: "Send a message to the workspace Team Chat.",
    parameters: {
      type: "OBJECT",
      required: ["message"],
      properties: {
        message: { type: "STRING" },
      },
    },
  },
];

async function executeToolCall(name, args = {}, actor, pendingActions) {
  switch (name) {
    case "get_my_profile_and_permissions": {
      const reportingTo = await resolveReportingManager(actor);
      return {
        ok: true,
        user: {
          id: actor.id,
          name: actor.name,
          email: actor.email,
          role: actor.role,
          position: actor.position,
          department: actor.department,
          canExtendDeadline: Boolean(actor.canExtendDeadline),
          canManageDeadlines: canManageDeadlines(actor),
          canManagePriority: canManagePriority(actor),
          permissions: actor.permissions || [],
          reportingTo,
        },
      };
    }

    case "list_tasks": {
      const rawQuery = {
        ...(args.status ? { status: args.status } : {}),
        ...(args.priority ? { priority: args.priority } : {}),
        ...(args.assignedToMe ? { assignedToMe: "true" } : {}),
        ...(args.overdue ? { overdue: "true" } : {}),
        ...(args.search ? { search: String(args.search).slice(0, 100) } : {}),
        pageSize: Math.min(50, Math.max(1, Number(args.pageSize) || 20)),
      };
      const parsed = validateSchema(taskQuery, rawQuery);
      if (!parsed.ok) return parsed;
      const result = formatControllerResult(
        await invokeController(taskController.getTasks, { user: actor, query: parsed.data }),
      );
      if (!result.ok) return result;
      return {
        ok: true,
        totalCount: result.data.totalCount,
        tasks: (result.data.tasks || []).map((task) => ({
          id: task.id,
          title: task.title,
          status: task.status,
          priority: task.priority,
          progress: task.progress,
          dueDate: task.dueDate,
          startDate: task.startDate,
          department: task.department,
          assignedTo: task.assignedTo,
          assigneeName: task.assignee?.name || null,
          projectTitle: task.project?.title || null,
        })),
      };
    }

    case "create_task": {
      if (!can(actor, "task:create")) {
        return { ok: false, statusCode: 403, message: "You do not have permission (task:create) to create tasks." };
      }
      const parsed = validateSchema(createTaskBody, {
        title: args.title,
        description: args.description || null,
        dueDate: args.dueDate,
        ...(args.startDate ? { startDate: args.startDate } : {}),
        assignedTo: args.assignedTo,
        ...(args.projectId ? { projectId: args.projectId } : {}),
        ...(args.priority ? { priority: args.priority } : {}),
      });
      if (!parsed.ok) return parsed;
      return formatControllerResult(
        await invokeController(taskController.createTask, { user: actor, body: parsed.data }),
      );
    }

    case "update_task_status": {
      const status = args.status;
      const body = {
        status,
        ...(status === "Completed"
          ? {
              completedBy: String(args.completedBy || actor.name).trim(),
              completedAt: args.completedAt || new Date().toISOString().slice(0, 10),
            }
          : {}),
      };
      const parsed = validateSchema(taskStatusBody, body);
      if (!parsed.ok) return parsed;
      return formatControllerResult(
        await invokeController(taskController.updateStatus, {
          user: actor,
          params: { id: Number(args.taskId) },
          body: parsed.data,
        }),
      );
    }

    case "update_task_progress": {
      const parsed = validateSchema(taskProgressBody, { progress: args.progress });
      if (!parsed.ok) return parsed;
      return formatControllerResult(
        await invokeController(taskController.updateProgress, {
          user: actor,
          params: { id: Number(args.taskId) },
          body: parsed.data,
        }),
      );
    }

    case "update_task_details": {
      const body = {
        ...(args.title !== undefined ? { title: args.title } : {}),
        ...(args.description !== undefined ? { description: args.description } : {}),
        ...(args.priority !== undefined ? { priority: args.priority } : {}),
      };
      const parsed = validateSchema(updateTaskBody, body);
      if (!parsed.ok) return parsed;
      return formatControllerResult(
        await invokeController(taskController.updateTask, {
          user: actor,
          params: { id: Number(args.taskId) },
          body: parsed.data,
        }),
      );
    }

    case "reassign_task": {
      const parsed = validateSchema(taskAssignmentBody, { assignedTo: args.assignedTo });
      if (!parsed.ok) return parsed;
      return formatControllerResult(
        await invokeController(taskController.assignTask, {
          user: actor,
          params: { id: Number(args.taskId) },
          body: parsed.data,
        }),
      );
    }

    case "add_task_comment": {
      const parsed = validateSchema(taskCommentBody, { comment: args.comment });
      if (!parsed.ok) return parsed;
      return formatControllerResult(
        await invokeController(taskController.addTaskComment, {
          user: actor,
          params: { id: Number(args.taskId) },
          body: parsed.data,
        }),
      );
    }

    case "delete_task": {
      const taskId = Number(args.taskId);
      if (!Number.isSafeInteger(taskId) || taskId <= 0) return { ok: false, error: "Invalid taskId." };
      return formatControllerResult(
        await invokeController(taskController.deleteTask, {
          user: actor,
          params: { id: taskId },
        }),
      );
    }

    case "extend_task_deadline": {
      const taskId = Number(args.taskId);
      if (!Number.isSafeInteger(taskId) || taskId <= 0) {
        return { ok: false, error: "Valid taskId is required." };
      }
      const allowedIds = await visibleUserIds(db.User, actor);
      const task = await db.Task.findOne({
        where: isManager(actor)
          ? { id: taskId }
          : { id: taskId, assignedTo: { [Op.in]: allowedIds } },
        include: [
          { model: db.User, as: "assignee", attributes: ["id", "name", "department", "position"], required: false },
        ],
      });
      if (!task) {
        return { ok: false, statusCode: 404, message: "Task not found in your visible scope." };
      }

      const isOwnTask = Number(task.assignedTo) === Number(actor.id);
      const canExtendDirectly = canManageDeadlines(actor) &&
        (canEditTask(actor, task) || (Boolean(actor.canExtendDeadline) && isOwnTask));

      if (canExtendDirectly) {
        if (!args.newDeadline || !args.reason) {
          return {
            ok: false,
            message: "You have permission to extend this deadline. Please provide both newDeadline (YYYY-MM-DD) and reason.",
          };
        }
        const parsed = validateSchema(updateTaskBody, {
          dueDate: args.newDeadline,
          reason: args.reason,
        });
        if (!parsed.ok) return parsed;
        return formatControllerResult(
          await invokeController(taskController.updateTask, {
            user: actor,
            params: { id: taskId },
            body: parsed.data,
          }),
        );
      }

      const reportingTo = await resolveReportingManager(actor);
      const pendingRequest = await db.DeadlineExtensionRequest.findOne({
        where: { taskId: task.id, status: "PENDING" },
        attributes: ["id", "requestedDeadline", "status"],
      });

      if (isOwnTask) {
        const requestedDeadline = typeof args.newDeadline === "string" && /^\d{4}-\d{2}-\d{2}$/.test(args.newDeadline)
          ? args.newDeadline
          : "";
        pendingActions.push({
          type: "SEND_DEADLINE_REQUEST",
          label: "Send Request",
          taskId: task.id,
          taskTitle: task.title,
          currentDeadline: task.dueDate,
          requestedDeadline,
          reason: String(args.reason || "").trim(),
          reportingToId: reportingTo?.id || null,
          reportingToName: reportingTo?.name || "Reporting Manager",
          reportingToPosition: reportingTo?.position || "MANAGER",
          alreadyPending: Boolean(pendingRequest),
        });
      }

      return {
        ok: false,
        statusCode: 403,
        code: "DEADLINE_PERMISSION_REQUIRED",
        canSendRequest: isOwnTask && !pendingRequest,
        alreadyPending: Boolean(pendingRequest),
        task: {
          id: task.id,
          title: task.title,
          currentDeadline: task.dueDate,
        },
        reportingTo,
        message: isOwnTask
          ? pendingRequest
            ? `You do not have permission to extend deadlines directly, and Task #${task.id} already has a pending request for ${pendingRequest.requestedDeadline}.`
            : `You do not have permission to extend deadlines directly. Use the Send Request button to send a request to ${reportingTo?.name || "your reporting manager"}.`
          : "You do not have permission to extend this task's deadline.",
      };
    }

    case "send_deadline_extension_request": {
      const taskId = Number(args.taskId);
      const parsed = validateSchema(deadlineExtensionRequestBody, {
        requestedDeadline: args.requestedDeadline,
        reason: args.reason,
      });
      if (!parsed.ok) return parsed;
      return formatControllerResult(
        await invokeController(deadlineExtensionController.createRequest, {
          user: actor,
          params: { id: taskId },
          body: parsed.data,
        }),
      );
    }

    case "list_deadline_requests": {
      const parsed = validateSchema(deadlineExtensionQuery, {
        ...(args.status ? { status: args.status } : {}),
        ...(args.assigneeId ? { assigneeId: args.assigneeId } : {}),
        ...(args.taskId ? { taskId: args.taskId } : {}),
      });
      if (!parsed.ok) return parsed;
      return formatControllerResult(
        await invokeController(deadlineExtensionController.listRequests, {
          user: actor,
          query: parsed.data,
        }),
      );
    }

    case "review_deadline_request": {
      const requestId = Number(args.requestId);
      const parsed = validateSchema(deadlineExtensionReviewBody, {
        decision: args.decision,
        ...(args.responseNote ? { responseNote: args.responseNote } : {}),
      });
      if (!parsed.ok) return parsed;
      return formatControllerResult(
        await invokeController(deadlineExtensionController.reviewRequest, {
          user: actor,
          params: { requestId },
          body: parsed.data,
        }),
      );
    }

    case "list_tickets": {
      const parsed = validateSchema(ticketQuery, {
        ...(args.status ? { status: args.status } : {}),
        ...(args.priority ? { priority: args.priority } : {}),
        ...(args.view ? { view: args.view } : {}),
        ...(args.overdue ? { overdue: "true" } : {}),
        ...(args.search ? { search: String(args.search).slice(0, 100) } : {}),
        pageSize: 20,
      });
      if (!parsed.ok) return parsed;
      const result = formatControllerResult(
        await invokeController(ticketWorkflowController.getTickets, { user: actor, query: parsed.data }),
      );
      if (!result.ok) return result;
      return {
        ok: true,
        summary: result.data.summary,
        tickets: (result.data.tickets || []).map((ticket) => ({
          id: ticket.id,
          ticketId: ticket.ticketId,
          title: ticket.title,
          status: ticket.status,
          priority: ticket.priority,
          progress: ticket.progress,
          deadline: ticket.deadline,
          department: ticket.department,
          assignedTo: ticket.assignedTo,
          assigneeName: ticket.assignee?.name || null,
        })),
      };
    }

    case "create_ticket": {
      if (!can(actor, "ticket:create")) {
        return { ok: false, statusCode: 403, message: "You do not have permission (ticket:create) to create tickets." };
      }
      const parsed = validateSchema(createTicketBody, {
        title: args.title,
        description: args.description || null,
        priority: args.priority,
        ...(args.department ? { department: args.department } : {}),
        ...(args.assignedTo ? { assignedTo: args.assignedTo } : {}),
        ...(args.deadline ? { deadline: args.deadline } : {}),
        ...(args.projectId ? { projectId: args.projectId } : {}),
        ...(args.taskId ? { taskId: args.taskId } : {}),
      });
      if (!parsed.ok) return parsed;
      return formatControllerResult(
        await invokeController(ticketController.createTicket, { user: actor, body: parsed.data }),
      );
    }

    case "update_ticket_status": {
      const parsed = validateSchema(ticketStatusBody, {
        status: args.status,
        ...(args.resolutionNote ? { resolutionNote: args.resolutionNote } : {}),
      });
      if (!parsed.ok) return parsed;
      return formatControllerResult(
        await invokeController(ticketWorkflowController.updateTicketStatus, {
          user: actor,
          params: { id: Number(args.ticketId) },
          body: parsed.data,
        }),
      );
    }

    case "update_ticket_progress": {
      const parsed = validateSchema(ticketProgressBody, { progress: args.progress });
      if (!parsed.ok) return parsed;
      return formatControllerResult(
        await invokeController(ticketWorkflowController.updateTicketProgress, {
          user: actor,
          params: { id: Number(args.ticketId) },
          body: parsed.data,
        }),
      );
    }

    case "assign_ticket": {
      const parsed = validateSchema(ticketAssignmentBody, {
        assignedTo: args.assignedTo ?? null,
      });
      if (!parsed.ok) return parsed;
      return formatControllerResult(
        await invokeController(ticketWorkflowController.assignTicket, {
          user: actor,
          params: { id: Number(args.ticketId) },
          body: parsed.data,
        }),
      );
    }

    case "add_ticket_comment": {
      const parsed = validateSchema(createTicketCommentBody, { comment: args.comment });
      if (!parsed.ok) return parsed;
      return formatControllerResult(
        await invokeController(ticketWorkflowController.addComment, {
          user: actor,
          params: { id: Number(args.ticketId) },
          body: parsed.data,
        }),
      );
    }

    case "extend_ticket_deadline": {
      const ticketId = Number(args.ticketId);
      const parsed = validateSchema(ticketDeadlineBody, {
        deadline: args.deadline,
        reason: args.reason,
      });
      if (!parsed.ok) return parsed;
      const response = await invokeController(ticketWorkflowController.updateDeadline, {
        user: actor,
        params: { id: ticketId },
        body: parsed.data,
      });
      if (response.statusCode === 403) {
        const reportingTo = await resolveReportingManager(actor);
        const ticket = await db.Ticket.findByPk(ticketId, { attributes: ["id", "title", "taskId", "assignedTo"] });
        if (ticket?.taskId) {
          const linkedTask = await db.Task.findByPk(ticket.taskId, { attributes: ["id", "title", "dueDate", "assignedTo"] });
          if (linkedTask && Number(linkedTask.assignedTo) === Number(actor.id)) {
            pendingActions.push({
              type: "SEND_DEADLINE_REQUEST",
              label: "Send Request",
              taskId: linkedTask.id,
              taskTitle: linkedTask.title,
              currentDeadline: linkedTask.dueDate,
              requestedDeadline: parsed.data.deadline,
              reason: parsed.data.reason,
              reportingToId: reportingTo?.id || null,
              reportingToName: reportingTo?.name || "Reporting Manager",
              reportingToPosition: reportingTo?.position || "MANAGER",
              alreadyPending: false,
            });
          }
        }
        return {
          ok: false,
          statusCode: 403,
          code: "DEADLINE_PERMISSION_REQUIRED",
          reportingTo,
          message: response.payload?.message || "You do not have permission to change this ticket's deadline.",
        };
      }
      return formatControllerResult(response);
    }

    case "reopen_ticket": {
      const parsed = validateSchema(reopenTicketBody, { reason: args.reason });
      if (!parsed.ok) return parsed;
      return formatControllerResult(
        await invokeController(ticketWorkflowController.reopenTicket, {
          user: actor,
          params: { id: Number(args.ticketId) },
          body: parsed.data,
        }),
      );
    }

    case "list_projects": {
      const result = formatControllerResult(
        await invokeController(projectController.getAllProjects, { user: actor }),
      );
      if (!result.ok) return result;
      return {
        ok: true,
        projects: (result.data.projects || []).map((project) => ({
          id: project.id,
          title: project.title,
          department: project.department,
          description: project.description,
        })),
      };
    }

    case "create_project": {
      if (!can(actor, "project:create")) {
        return { ok: false, statusCode: 403, message: "You do not have permission (project:create) to create projects." };
      }
      const parsed = validateSchema(createProjectBody, {
        title: args.title,
        description: args.description,
        ...(args.department ? { department: args.department } : {}),
      });
      if (!parsed.ok) return parsed;
      return formatControllerResult(
        await invokeController(projectController.createProject, { user: actor, body: parsed.data }),
      );
    }

    case "list_team_members": {
      const purpose = args.forPurpose || "visible";
      if (purpose === "meeting_invite") {
        return formatControllerResult(
          await invokeController(meetingController.listInviteablePeople, { user: actor }),
        );
      }
      if (purpose === "task_assign" || purpose === "ticket_assign") {
        return formatControllerResult(
          await invokeController(userController.getMembers, {
            user: actor,
            query: purpose === "ticket_assign" ? { for: "ticket" } : {},
          }),
        );
      }
      if (can(actor, "user:view:any")) {
        return formatControllerResult(
          await invokeController(userController.getDirectory, { user: actor }),
        );
      }
      if (can(actor, "user:view:team")) {
        return formatControllerResult(
          await invokeController(userController.getTeamDirectory, { user: actor }),
        );
      }
      return { ok: true, members: [{ id: actor.id, name: actor.name, department: actor.department, position: actor.position }] };
    }

    case "set_member_deadline_permission": {
      if (!isManager(actor)) {
        return { ok: false, statusCode: 403, message: "Only a Manager can grant or revoke deadline extension permission." };
      }
      const memberId = Number(args.memberId);
      const parsed = validateSchema(memberUpdateBody, { canExtendDeadline: Boolean(args.canExtendDeadline) });
      if (!parsed.ok) return parsed;
      return formatControllerResult(
        await invokeController(userController.updateMember, {
          user: actor,
          params: { id: memberId },
          body: parsed.data,
        }),
      );
    }

    case "list_meetings": {
      const result = formatControllerResult(
        await invokeController(meetingController.listMeetings, { user: actor }),
      );
      if (!result.ok) return result;
      return {
        ok: true,
        meetings: (result.data.meetings || []).slice(0, 20).map((meeting) => ({
          id: meeting.id,
          title: meeting.title,
          status: meeting.status,
          scheduledAt: meeting.scheduledAt,
          durationMinutes: meeting.durationMinutes,
          hostName: meeting.host?.name || null,
          hasMinutes: meeting.hasMinutes,
        })),
      };
    }

    case "schedule_meeting": {
      const parsed = validateSchema(createMeetingBody, {
        title: args.title,
        agenda: args.agenda || null,
        scheduledAt: args.scheduledAt,
        durationMinutes: Number(args.durationMinutes) || 30,
        attendeeIds: Array.isArray(args.attendeeIds) ? args.attendeeIds : [],
      });
      if (!parsed.ok) return parsed;
      return formatControllerResult(
        await invokeController(meetingController.createMeeting, { user: actor, body: parsed.data }),
      );
    }

    case "get_workspace_summary": {
      if (can(actor, "report:view:any")) {
        return formatControllerResult(
          await invokeController(reportController.getWorkspaceReport, { user: actor }),
        );
      }
      const [taskRes, ticketRes] = await Promise.all([
        invokeController(taskController.getTaskDashboardSummary, { user: actor, query: {} }),
        invokeController(ticketWorkflowController.getTickets, { user: actor, query: { page: 1, pageSize: 5 } }),
      ]);
      return {
        ok: true,
        tasks: taskRes.payload?.data || null,
        tickets: ticketRes.payload?.data?.summary || null,
      };
    }

    case "send_team_chat_message": {
      return formatControllerResult(
        await invokeController(chatController.createMessage, {
          user: actor,
          body: { message: String(args.message || "").trim() },
        }),
      );
    }

    default:
      return { ok: false, error: `Unknown tool: ${name}` };
  }
}

const DEVANAGARI_RE = /[\u0900-\u097F]/;
const HINDI_ROMAN_MARKERS_RE =
  /\b(mera|meri|mere|mujhe|mujhko|hum|humko|aap|aapka|tum|karo|kardo|karna|karein|dikhao|dikhaiye|batao|bataiye|banao|banado|badha|badhao|samjhe|chahiye|nahi|nhi|kya|kab|kaun|kitne|kitna|bhej|bhejo|aaj|kal|parso|haan|bhai|bas|itna|gaya|rahi|raha|hain|hai|kaam|tarikh|kyu|kyunki|abhi|jaldi)\b/i;

function detectAssistantLanguage(text) {
  const sample = String(text || "").trim();
  if (!sample) return "en";
  if (DEVANAGARI_RE.test(sample)) return "hi";
  if (HINDI_ROMAN_MARKERS_RE.test(sample)) return "hi";
  return "en";
}

function buildSystemPrompt(actor, reportingTo, detectedLanguage = "en") {
  const today = new Date().toISOString().slice(0, 10);
  const nowIso = new Date().toISOString();
  return [
    "You are FlipPro AI, an intelligent voice-enabled Task Manager Assistant inside the FlipPro Team Task Manager application.",
    `Current authenticated user: ${actor.name} (ID: ${actor.id}, Position: ${actor.position}, Department: ${actor.department}, Role: ${actor.role}, Direct Deadline Extend Permission: ${Boolean(actor.canExtendDeadline)}).`,
    reportingTo
      ? `User's reporting manager: ${reportingTo.name} (${reportingTo.position}, ID: ${reportingTo.id}).`
      : "User's reporting manager: Workspace Manager.",
    `Today's date is ${today} (current UTC timestamp: ${nowIso}).`,
    `Detected user language for this turn: ${detectedLanguage === "hi" ? "Hindi" : "English"}.`,
    "You can perform Task Manager operations for the user ONLY via the provided tools, which strictly enforce their role, department, and reporting-hierarchy permissions.",
    "Rules:",
    "1. Always use tools to look up real tasks, tickets, projects, team members, meetings, or stats—never invent IDs, statuses, dates, or people.",
    "2. If the user refers to a task/ticket/member by name instead of ID, first search/list to find the exact record. If ambiguous, ask a concise clarifying question.",
    "3. When the user asks to extend or change a task deadline, call extend_task_deadline (if you don't know the task ID yet, call list_tasks first to find it). If extend_task_deadline returns code DEADLINE_PERMISSION_REQUIRED, clearly explain in the user's detected language that they do not have permission to extend the deadline directly, and let them know they can click the 'Send Request' button below to send the request to their reporting manager.",
    "4. If the user is a Manager and asks to grant or revoke someone's deadline extension permission, look up the member via list_team_members and call set_member_deadline_permission.",
    "5. Auto Language Detection & Voice Clarity: Automatically detect the user's language. If the user speaks or writes in Hindi or Hindi-dominant Hinglish, reply in natural, clear Hindi (using Devanagari script for Hindi sentences while keeping task titles, IDs, dates, and technical terms readable) so a Hindi TTS voice speaks it fluently. If the user speaks or writes in English, reply in clear, natural English so an English TTS voice speaks it fluently.",
  ].join("\n");
}

function extractModelReply(candidate) {
  const parts = candidate?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts
    .filter((part) => typeof part?.text === "string" && !part?.thought)
    .map((part) => part.text)
    .join("")
    .trim();
}

async function runAssistantTurn({ actor, message, history = [] }) {
  if (!getGeminiApiKey()) {
    const error = new Error("Add GEMINI_API_KEY to the backend environment to enable the AI assistant.");
    error.status = 503;
    error.code = "AI_NOT_CONFIGURED";
    throw error;
  }

  const userLanguage = detectAssistantLanguage(message);
  const reportingTo = await resolveReportingManager(actor);
  const systemInstruction = {
    parts: [{ text: buildSystemPrompt(actor, reportingTo, userLanguage) }],
  };

  const contents = [];
  for (const item of history.slice(-10)) {
    if (!item || typeof item.text !== "string" || !item.text.trim()) continue;
    contents.push({
      role: item.role === "assistant" ? "model" : "user",
      parts: [{ text: item.text.trim().slice(0, 4000) }],
    });
  }
  contents.push({
    role: "user",
    parts: [{ text: message.trim() }],
  });

  const pendingActions = [];
  const executedTools = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const data = await requestGeminiWithFallback(
      {
        systemInstruction,
        contents,
        tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
        generationConfig: {
          temperature: 0.2,
        },
      },
      "ai assistant",
    );

    const candidate = data?.candidates?.[0];
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
    const functionCalls = parts
      .filter((part) => part?.functionCall?.name)
      .map((part) => part.functionCall);

    if (functionCalls.length === 0) {
      const reply = extractModelReply(candidate) || "Request processed.";
      return {
        reply,
        replyLanguage: detectAssistantLanguage(reply),
        actions: deduplicateActions(pendingActions),
        toolsUsed: executedTools,
      };
    }

    contents.push({
      role: "model",
      parts,
    });

    const responseParts = [];
    for (const call of functionCalls) {
      executedTools.push(call.name);
      const output = await executeToolCall(call.name, call.args || {}, actor, pendingActions);
      responseParts.push({
        functionResponse: {
          name: call.name,
          response: { result: output },
        },
      });
    }

    contents.push({
      role: "user",
      parts: responseParts,
    });
  }

  return {
    reply: "I ran several lookups but reached the action step limit. Please refine your request with the exact task or ticket ID.",
    replyLanguage: userLanguage,
    actions: deduplicateActions(pendingActions),
    toolsUsed: executedTools,
  };
}

function deduplicateActions(actions) {
  const seen = new Set();
  const result = [];
  for (const action of actions) {
    const key = `${action.type}:${action.taskId || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(action);
  }
  return result;
}

async function transcribeVoiceCommand(file) {
  if (!getGeminiApiKey()) {
    const error = new Error("Add GEMINI_API_KEY to the backend environment to enable voice transcription.");
    error.status = 503;
    error.code = "AI_NOT_CONFIGURED";
    throw error;
  }

  const data = await requestGeminiWithFallback(
    {
      contents: [
        {
          role: "user",
          parts: [
            {
              text: "Transcribe this short Task Manager voice command accurately in its spoken language. Use Devanagari script for Hindi words and standard Latin script for English words or technical terms. Return only the spoken text without quotes or commentary.",
            },
            {
              inlineData: {
                mimeType: file.mimetype || "audio/webm",
                data: file.buffer.toString("base64"),
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
      },
    },
    "voice transcription",
  );

  const candidate = data?.candidates?.[0];
  const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
  return parts
    .filter((part) => typeof part?.text === "string" && !part?.thought)
    .map((part) => part.text)
    .join("")
    .trim();
}

module.exports = {
  TOOL_DECLARATIONS,
  detectAssistantLanguage,
  executeToolCall,
  runAssistantTurn,
  transcribeVoiceCommand,
};
