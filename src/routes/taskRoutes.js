/**
 * Task Routes
 * 
 * Mixed access routes with RBAC enforced at controller level:
 *   POST /api/tasks              → Create a task (Admin only)
 *   GET  /api/tasks              → Get tasks (Admin: all, Member: own) with filtering/search/sort
 *   PUT  /api/tasks/:id/status   → Update task status (Admin or assigned Member)
 *   PUT  /api/tasks/:id/priority → Update task priority (Admin only)
 *   GET  /api/tasks/:id/history  → Get task timeline/history (Admin or assigned Member)
 */

const express = require("express");
const router = express.Router();
const taskController = require("../controllers/taskController");
const { verifyToken, isAdmin } = require("../middlewares/authMiddleware");

// ─── Admin-only Route ───────────────────────────────────────────────────────

router.post("/", verifyToken, isAdmin, taskController.createTask);

// ─── Authenticated Routes (RBAC logic handled in controller) ────────────────

router.get("/", verifyToken, taskController.getTasks);
router.put("/:id/status", verifyToken, taskController.updateStatus);
router.put("/:id/priority", verifyToken, isAdmin, taskController.updatePriority);
router.get("/:id/history", verifyToken, taskController.getTaskHistory);

module.exports = router;
