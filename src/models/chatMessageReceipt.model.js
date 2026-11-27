const { DataTypes } = require("sequelize");

module.exports = (sequelize) =>
  sequelize.define(
    "ChatMessageReceipt",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      messageId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "chat_messages", key: "id" },
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" },
      },
      deliveredAt: { type: DataTypes.DATE, allowNull: true },
      seenAt: { type: DataTypes.DATE, allowNull: true },
    },
    { tableName: "chat_message_receipts", timestamps: true, underscored: true }
  );
