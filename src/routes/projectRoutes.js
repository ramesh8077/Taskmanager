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
const { verifyToken, isAdmin } = require("../middlewares/authMiddleware");

// ─── Admin-only Routes ──────────────────────────────────────────────────────

router.post("/", verifyToken, isAdmin, projectController.createProject);
router.get("/", verifyToken, isAdmin, projectController.getAllProjects);

module.exports = router;
