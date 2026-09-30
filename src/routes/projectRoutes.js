/**
 * Project Routes
 * 
 * All project routes are Admin-only:
 *   POST /api/projects       → Create a new project
 *   GET  /api/projects       → Get all projects with tasks
 */

const express = require("express");
const router = express.Router();
const projectController = require("../controllers/projectController");
const { verifyToken, requirePermission } = require("../middlewares/authMiddleware");
const { validateRequest } = require("../middlewares/validate");
const { createProjectBody, idParams } = require("../validators/schemas");

// ─── Admin-only Routes ──────────────────────────────────────────────────────

router.post(
  "/",
  verifyToken,
  requirePermission("project:create"),
  validateRequest(createProjectBody),
  projectController.createProject
);
router.get(
  "/",
  verifyToken,
  requirePermission("project:view:any", "project:view:own"),
  projectController.getAllProjects
);
router.get(
  "/:id",
  verifyToken,
  requirePermission("project:view:any", "project:view:own"),
  validateRequest(idParams, "params"),
  projectController.getProject
);

module.exports = router;
