/**
 * Project Controller
 * 
 * Handles all project-related business logic:
 *   - createProject: Creates a new project (Admin only).
 *   - getAllProjects: Retrieves all projects with associated tasks (Admin only).
 * 
 * All operations require authentication via verifyToken middleware.
 * Admin-only operations are additionally protected by isAdmin middleware.
 */

const db = require("../models");

const Project = db.Project;
const Task = db.Task;
const User = db.User;

// ─────────────────────────────────────────────────────────────────────────────
// CREATE PROJECT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @desc    Create a new project
 * @route   POST /api/projects
 * @access  Private (Admin only)
 */
const createProject = async (req, res) => {
  try {
    const { title, description } = req.body;

    // ── Validate required fields ──────────────────────────────────────────
    if (!title || !description) {
      return res.status(400).json({
        success: false,
        message: "Please provide both title and description.",
      });
    }

    // ── Create project (createdBy is auto-set from the authenticated user) ─
    const newProject = await Project.create({
      title,
      description,
      createdBy: req.user.id, // From verifyToken middleware
    });

    return res.status(201).json({
      success: true,
      message: "Project created successfully.",
      data: { project: newProject },
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

    console.error("❌ Create Project Error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error while creating project.",
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET ALL PROJECTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @desc    Get all projects with their associated tasks and creator info
 * @route   GET /api/projects
 * @access  Private (Admin only)
 */
const getAllProjects = async (req, res) => {
  try {
    const projects = await Project.findAll({
      include: [
        {
          model: User,
          as: "creator",
          attributes: ["id", "name", "email"], // Exclude password
        },
        {
          model: Task,
          as: "tasks",
          include: [
            {
              model: User,
              as: "assignee",
              attributes: ["id", "name", "email"], // Exclude password
            },
          ],
        },
      ],
      order: [["createdAt", "DESC"]], // Newest projects first
    });

    return res.status(200).json({
      success: true,
      message: "Projects fetched successfully.",
      data: {
        count: projects.length,
        projects,
      },
    });
  } catch (error) {
    console.error("❌ Get All Projects Error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error while fetching projects.",
    });
  }
};

module.exports = {
  createProject,
  getAllProjects,
};
