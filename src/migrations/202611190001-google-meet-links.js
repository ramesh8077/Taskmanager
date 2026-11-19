const { DataTypes } = require("sequelize");

module.exports = {
  async up(queryInterface) {
    const columns = await queryInterface.describeTable("meetings");
    if (!columns.meeting_uri) {
      await queryInterface.addColumn("meetings", "meeting_uri", {
        type: DataTypes.STRING(255),
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const columns = await queryInterface.describeTable("meetings");
    if (columns.meeting_uri) await queryInterface.removeColumn("meetings", "meeting_uri");
  },
};
