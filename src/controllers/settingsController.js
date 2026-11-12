const db = require("../models");
const { DEPARTMENTS, POSITIONS, REPORTING_POSITIONS } = require("../../shared/organization");

async function getWorkspaceSettings(req, res) {
  try {
    const roles = await db.Role.findAll({
      attributes: ["id", "name", "isActive"],
      include: [{ model: db.Permission, as: "permissions", attributes: ["name", "description"], through: { attributes: [] } }],
      order: [["name", "ASC"]],
    });
    return res.status(200).json({
      success: true,
      message: "Workspace settings fetched successfully.",
      data: { departments: DEPARTMENTS, positions: POSITIONS, reportingPositions: REPORTING_POSITIONS, roles },
    });
  } catch (error) {
    console.error("Get Workspace Settings Error:", error);
    return res.status(500).json({ success: false, message: "Unable to load workspace settings." });
  }
}

module.exports = { getWorkspaceSettings };
