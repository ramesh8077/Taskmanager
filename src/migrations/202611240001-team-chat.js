const { DataTypes } = require("sequelize");

module.exports = {
  async up(queryInterface) {
    const tables = (await queryInterface.showAllTables()).map((table) => typeof table === "string" ? table : table.tableName);
    if (tables.includes("chat_messages")) return;
    await queryInterface.createTable("chat_messages", {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      user_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: "users", key: "id" }, onDelete: "CASCADE", onUpdate: "CASCADE" },
      message: { type: DataTypes.STRING(2000), allowNull: false },
      mentions: { type: DataTypes.JSON, allowNull: false },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });
    await queryInterface.addIndex("chat_messages", ["id"], { name: "chat_messages_id_idx" });
  },
  async down(queryInterface) {
    const tables = (await queryInterface.showAllTables()).map((table) => typeof table === "string" ? table : table.tableName);
    if (tables.includes("chat_messages")) await queryInterface.dropTable("chat_messages");
  },
};
