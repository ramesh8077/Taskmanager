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
const { verifyToken, requirePermission } = require("../middlewares/authMiddleware");
const { validateRequest } = require("../middlewares/validate");
const {
  createTaskBody,
  taskStatusBody,
  taskPriorityBody,
  taskProgressBody,
  taskQuery,
  idParams,
} = require("../validators/schemas");

// ─── Task creation ──────────────────────────────────────────────────────────

router.post(
  "/",
  verifyToken,
  requirePermission("task:create"),
  validateRequest(createTaskBody),
  taskController.createTask
);

// ─── Scoped, permission-guarded routes ─────────────────────────────────────

router.get(
  "/",
  verifyToken,
  requirePermission("task:view:any", "task:view:own"),
  validateRequest(taskQuery, "query"),
  taskController.getTasks
);
router.put(
  "/:id/status",
  verifyToken,
  requirePermission("task:update:any", "task:update:own"),
  validateRequest(idParams, "params"),
  validateRequest(taskStatusBody),
  taskController.updateStatus
);
router.put(
  "/:id/priority",
  verifyToken,
  requirePermission("task:update:any", "task:update:own"),
  validateRequest(idParams, "params"),
  validateRequest(taskPriorityBody),
  taskController.updatePriority
);
router.put(
  "/:id/progress",
  verifyToken,
  requirePermission("task:update:any", "task:update:own"),
  validateRequest(idParams, "params"),
  validateRequest(taskProgressBody),
  taskController.updateProgress
);
router.get(
  "/:id/history",
  verifyToken,
  requirePermission("task:view:any", "task:view:own"),
  validateRequest(idParams, "params"),
  taskController.getTaskHistory
);

module.exports = router;
