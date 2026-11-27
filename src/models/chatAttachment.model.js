const { DataTypes } = require("sequelize");

module.exports = (sequelize) =>
  sequelize.define(
    "ChatAttachment",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      messageId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "chat_messages", key: "id" },
      },
      uploadedBy: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" },
      },
      category: { type: DataTypes.STRING(24), allowNull: false },
      fileName: { type: DataTypes.STRING(255), allowNull: false },
      mimeType: { type: DataTypes.STRING(120), allowNull: false },
      fileSize: { type: DataTypes.INTEGER, allowNull: false },
      durationSeconds: { type: DataTypes.INTEGER, allowNull: true },
      isChunked: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      fileData: { type: DataTypes.BLOB("long"), allowNull: true },
    },
    { tableName: "chat_attachments", timestamps: true, underscored: true }
  );
