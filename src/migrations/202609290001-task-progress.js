const { DataTypes } = require("sequelize");

module.exports = {
  async up(queryInterface) {
    const columns = await queryInterface.describeTable("tasks");
    if (!columns.progress) {
      await queryInterface.addColumn("tasks", "progress", {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      });
    }
    await queryInterface.sequelize.query(
      "UPDATE `tasks` SET `progress` = 100 WHERE `status` = 'Completed' AND `progress` = 0"
    );
  },
};
