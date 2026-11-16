const { DataTypes } = require("sequelize");

module.exports = {
  async up(queryInterface) {
    const columns = await queryInterface.describeTable("tasks");
    if (!columns.project_id) {
      throw new Error("Cannot make task projects optional: tasks.project_id does not exist.");
    }

    await queryInterface.changeColumn("tasks", "project_id", {
      type: DataTypes.INTEGER,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    const [rows] = await queryInterface.sequelize.query(
      "SELECT COUNT(*) AS count FROM `tasks` WHERE `project_id` IS NULL"
    );
    if (Number(rows[0]?.count || 0) > 0) {
      throw new Error("Cannot require task projects while tasks without a project exist.");
    }

    await queryInterface.changeColumn("tasks", "project_id", {
      type: DataTypes.INTEGER,
      allowNull: false,
    });
  },
};
