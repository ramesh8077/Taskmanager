const { DataTypes } = require("sequelize");

module.exports = {
  async up(queryInterface) {
    const columns = await queryInterface.describeTable("users");
    if (!columns.can_extend_deadline) {
      await queryInterface.addColumn("users", "can_extend_deadline", {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }
  },

  async down(queryInterface) {
    const columns = await queryInterface.describeTable("users");
    if (columns.can_extend_deadline) {
      await queryInterface.removeColumn("users", "can_extend_deadline");
    }
  },
};
