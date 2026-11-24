const { DataTypes } = require("sequelize");

module.exports = (sequelize) => sequelize.define("ChatMessage", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: "users", key: "id" } },
  message: { type: DataTypes.STRING(2000), allowNull: false },
  mentions: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
}, { tableName: "chat_messages", timestamps: true, underscored: true });
