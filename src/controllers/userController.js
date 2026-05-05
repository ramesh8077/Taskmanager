/**
 * User Controller
 * 
 * Handles user-related business logic:
 *   - getMembers: Retrieves all users with the 'Member' role (Admin only).
 *                 Used by the frontend for the task assignment dropdown.
 */

const db = require("../models");

const User = db.User;

// ─────────────────────────────────────────────────────────────────────────────
// GET MEMBERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @desc    Get all users with role 'Member' (for task assignment dropdown)
 * @route   GET /api/users/members
 * @access  Private (Admin only)
 */
const getMembers = async (req, res) => {
  try {
    const members = await User.findAll({
      where: { role: "Member" },
      attributes: ["id", "name", "email", "createdAt"], // Exclude password & role (always 'Member')
      order: [["name", "ASC"]], // Alphabetical for dropdown
    });

    return res.status(200).json({
      success: true,
      message: "Members fetched successfully.",
      data: {
        count: members.length,
        members,
      },
    });
  } catch (error) {
    console.error("❌ Get Members Error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error while fetching members.",
    });
  }
};

module.exports = {
  getMembers,
};
