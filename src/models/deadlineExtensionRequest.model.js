const { DataTypes } = require("sequelize");

module.exports = (sequelize) =>
  sequelize.define(
    "DeadlineExtensionRequest",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      taskId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "tasks", key: "id" },
      },
      requestedById: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" },
      },
      currentDeadline: { type: DataTypes.DATEONLY, allowNull: false },
      requestedDeadline: { type: DataTypes.DATEONLY, allowNull: false },
      reason: { type: DataTypes.TEXT, allowNull: false },
      status: {
        type: DataTypes.ENUM("PENDING", "APPROVED", "REJECTED"),
        allowNull: false,
        defaultValue: "PENDING",
      },
      reviewedById: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "users", key: "id" },
      },
      reviewedAt: { type: DataTypes.DATE, allowNull: true },
      responseNote: { type: DataTypes.TEXT, allowNull: true },
    },
    {
      tableName: "deadline_extension_requests",
      timestamps: true,
      underscored: true,
    }
  );
