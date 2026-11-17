const { DataTypes } = require("sequelize");

module.exports = {
  async up(queryInterface) {
    for (const table of ["tasks", "tickets"]) {
      const columns = await queryInterface.describeTable(table);
      if (!columns.start_date) {
        await queryInterface.addColumn(table, "start_date", {
          type: DataTypes.DATEONLY,
          allowNull: true,
        });
      }
    }
  },

  async down(queryInterface) {
    for (const table of ["tickets", "tasks"]) {
      const columns = await queryInterface.describeTable(table);
      if (columns.start_date) await queryInterface.removeColumn(table, "start_date");
    }
  },
};
