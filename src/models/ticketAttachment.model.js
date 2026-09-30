const { DataTypes } = require("sequelize");

module.exports = (sequelize) =>
  sequelize.define(
    "TicketAttachment",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      ticketId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "tickets", key: "id" },
      },
      uploadedBy: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" },
      },
      fileName: { type: DataTypes.STRING(255), allowNull: false },
      storageName: { type: DataTypes.STRING(100), allowNull: false, unique: true },
      mimeType: { type: DataTypes.STRING(100), allowNull: false },
      fileSize: { type: DataTypes.INTEGER, allowNull: false },
    },
    { tableName: "ticket_attachments", timestamps: true, underscored: true }
  );
