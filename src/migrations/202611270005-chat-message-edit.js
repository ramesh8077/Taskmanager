const { DataTypes } = require("sequelize");

module.exports = {
  async up(queryInterface) {
    const tables = (await queryInterface.showAllTables()).map((table) =>
      typeof table === "string" ? table : table.tableName
    );
    if (tables.includes("chat_messages")) {
      const columns = await queryInterface.describeTable("chat_messages");
      if (!columns.edited_at) {
        await queryInterface.addColumn("chat_messages", "edited_at", {
          type: DataTypes.DATE,
          allowNull: true,
        });
      }
    }
  },

  async down(queryInterface) {
    const tables = (await queryInterface.showAllTables()).map((table) =>
      typeof table === "string" ? table : table.tableName
    );
    if (tables.includes("chat_messages")) {
      const columns = await queryInterface.describeTable("chat_messages");
      if (columns.edited_at) {
        await queryInterface.removeColumn("chat_messages", "edited_at");
      }
    }
  },
};
