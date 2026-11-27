const { DataTypes } = require("sequelize");

module.exports = (sequelize) =>
  sequelize.define(
    "ChatAttachmentChunk",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      attachmentId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "chat_attachments", key: "id" },
      },
      chunkIndex: { type: DataTypes.INTEGER, allowNull: false },
      chunkData: { type: DataTypes.BLOB("long"), allowNull: false },
    },
    { tableName: "chat_attachment_chunks", timestamps: true, underscored: true }
  );
