/**
 * Task Routes
 * 
 * Mixed access routes with RBAC enforced at controller level:
 *   POST /api/tasks              → Create a task with task:create permission
 *   GET  /api/tasks              → List tasks in the caller's scope
 *   PUT  /api/tasks/:id/status   → Update a scoped task
 *   PUT  /api/tasks/:id/priority → Update a scoped task
 *   GET  /api/tasks/:id/history  → Get history for a scoped task
 */

const express = require("express");
const router = express.Router();
const taskController = require("../controllers/taskController");
const deadlineExtensionController = require("../controllers/deadlineExtensionController");
const { verifyToken, requirePermission } = require("../middlewares/authMiddleware");
const { validateRequest } = require("../middlewares/validate");
const {
  createTaskBody,
  taskStatusBody,
  taskPriorityBody,
  taskProgressBody,
  updateTaskBody,
  taskQuery,
  idParams,
  deadlineExtensionRequestBody,
  deadlineExtensionReviewBody,
  deadlineExtensionQuery,
  deadlineExtensionRequestParams,
} = require("../validators/schemas");

// ─── Task creation ──────────────────────────────────────────────────────────

router.get(
  "/deadline-requests",
  verifyToken,
  validateRequest(deadlineExtensionQuery, "query"),
  deadlineExtensionController.listRequests
);
router.put(
  "/deadline-requests/:requestId",
  verifyToken,
  validateRequest(deadlineExtensionRequestParams, "params"),
  validateRequest(deadlineExtensionReviewBody),
  deadlineExtensionController.reviewRequest
);
router.post(
  "/",
  verifyToken,
  requirePermission("task:create"),
  validateRequest(createTaskBody),
  taskController.createTask
);
router.post(
  "/:id/deadline-requests",
  verifyToken,
  validateRequest(idParams, "params"),
  validateRequest(deadlineExtensionRequestBody),
  deadlineExtensionController.createRequest
);
router.put(
  "/:id",
  verifyToken,
  validateRequest(idParams, "params"),
  validateRequest(updateTaskBody),
  taskController.updateTask
);
router.delete(
  "/:id",
  verifyToken,
  validateRequest(idParams, "params"),
  taskController.deleteTask
);

// ─── Scoped, permission-guarded routes ─────────────────────────────────────

router.get(
  "/dashboard-summary",
  verifyToken,
  validateRequest(taskQuery, "query"),
  taskController.getTaskDashboardSummary
);
router.get(
  "/",
  verifyToken,
  validateRequest(taskQuery, "query"),
  taskController.getTasks
);
router.put(
  "/:id/status",
  verifyToken,
  validateRequest(idParams, "params"),
  validateRequest(taskStatusBody),
  taskController.updateStatus
);
router.put(
  "/:id/priority",
  verifyToken,
  validateRequest(idParams, "params"),
  validateRequest(taskPriorityBody),
  taskController.updatePriority
);
router.put(
  "/:id/progress",
  verifyToken,
  validateRequest(idParams, "params"),
  validateRequest(taskProgressBody),
  taskController.updateProgress
);
router.get(
  "/:id/history",
  verifyToken,
  validateRequest(idParams, "params"),
  taskController.getTaskHistory
);

module.exports = router;
