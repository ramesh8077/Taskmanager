const { DataTypes } = require("sequelize");

module.exports = (sequelize) =>
  sequelize.define(
    "ChatMessageHidden",
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
    },
    { tableName: "chat_message_hidden", timestamps: true, underscored: true }
  );
