const { DataTypes } = require("sequelize");

module.exports = (sequelize) => sequelize.define("ChatMessage", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: "users", key: "id" } },
  replyToId: { type: DataTypes.INTEGER, allowNull: true, references: { model: "chat_messages", key: "id" } },
  messageType: { type: DataTypes.STRING(24), allowNull: false, defaultValue: "text" },
  message: { type: DataTypes.STRING(2000), allowNull: false, defaultValue: "" },
  mentions: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
  deletedForEveryoneAt: { type: DataTypes.DATE, allowNull: true },
  deletedById: { type: DataTypes.INTEGER, allowNull: true },
}, { tableName: "chat_messages", timestamps: true, underscored: true });
