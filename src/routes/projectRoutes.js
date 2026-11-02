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
const { verifyToken } = require("../middlewares/authMiddleware");
const { validateRequest } = require("../middlewares/validate");
const { createProjectBody, idParams } = require("../validators/schemas");

// ─── Admin-only Routes ──────────────────────────────────────────────────────

router.post(
  "/",
  verifyToken,
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
