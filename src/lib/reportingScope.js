const { Op } = require("sequelize");
const { REPORTING_POSITIONS } = require("../../shared/organization");

function reportingManagerScope({ department, position, excludeIds = [] }) {
  const allowedPositions = REPORTING_POSITIONS[position] || [];
  return {
    [Op.and]: [
      { position: { [Op.in]: allowedPositions } },
      {
        [Op.or]: [
          { position: "MANAGER" },
          { department },
        ],
      },
      { status: "ACTIVE" },
      { isActive: true },
      ...(excludeIds.length ? [{ id: { [Op.notIn]: excludeIds } }] : []),
    ],
  };
}

module.exports = { reportingManagerScope };
