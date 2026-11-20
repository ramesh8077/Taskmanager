const { DataTypes } = require("sequelize");

module.exports = {
  async up(queryInterface) {
    const columns = await queryInterface.describeTable("meetings");
    if (!columns.transcript) {
      await queryInterface.addColumn("meetings", "transcript", {
        type: DataTypes.TEXT("long"),
        allowNull: true,
      });
    }
    if (!columns.minutes) {
      await queryInterface.addColumn("meetings", "minutes", {
        type: DataTypes.JSON,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const columns = await queryInterface.describeTable("meetings");
    if (columns.minutes) await queryInterface.removeColumn("meetings", "minutes");
    if (columns.transcript) await queryInterface.removeColumn("meetings", "transcript");
  },
};
