/**
 * Project Routes
 * 
 * Project creation and listing are restricted by controller and hierarchy scope:
 *   POST /api/projects       → Create a new project
 *   GET  /api/projects       → Get all projects with tasks
 */

const express = require("express");
const router = express.Router();
const projectController = require("../controllers/projectController");
const { verifyToken, requirePermission } = require("../middlewares/authMiddleware");
const { validateRequest } = require("../middlewares/validate");
const { createProjectBody, idParams } = require("../validators/schemas");

// ─── Project Routes ─────────────────────────────────────────────────────────

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
  projectController.getAllProjects
);
router.get(
  "/:id",
  verifyToken,
  validateRequest(idParams, "params"),
  projectController.getProject
);

module.exports = router;
