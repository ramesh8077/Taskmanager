"use strict";

const { DataTypes } = require("sequelize");

module.exports = {
  async up(queryInterface) {
    for (const table of ["task_history", "ticket_comments"]) {
      const columns = await queryInterface.describeTable(table);
      if (!columns.image_data) {
        await queryInterface.addColumn(table, "image_data", {
          type: DataTypes.BLOB("medium"),
          allowNull: true,
        });
      }
      if (!columns.image_mime_type) {
        await queryInterface.addColumn(table, "image_mime_type", {
          type: DataTypes.STRING(50),
          allowNull: true,
        });
      }
      if (!columns.image_file_name) {
        await queryInterface.addColumn(table, "image_file_name", {
          type: DataTypes.STRING(255),
          allowNull: true,
        });
      }
    }
  },

  async down(queryInterface) {
    for (const table of ["ticket_comments", "task_history"]) {
      const columns = await queryInterface.describeTable(table);
      if (columns.image_file_name) await queryInterface.removeColumn(table, "image_file_name");
      if (columns.image_mime_type) await queryInterface.removeColumn(table, "image_mime_type");
      if (columns.image_data) await queryInterface.removeColumn(table, "image_data");
    }
  },
};
