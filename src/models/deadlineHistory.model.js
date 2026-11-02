const { DataTypes } = require("sequelize");

module.exports = (sequelize) =>
  sequelize.define(
    "DeadlineHistory",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      taskId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "tasks", key: "id" },
      },
      ticketId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "tickets", key: "id" },
      },
      oldDeadline: { type: DataTypes.DATEONLY, allowNull: true },
      newDeadline: { type: DataTypes.DATEONLY, allowNull: false },
      changedById: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" },
      },
      changedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      reason: { type: DataTypes.TEXT, allowNull: false, validate: { notEmpty: true } },
    },
    {
      tableName: "deadline_history",
      timestamps: false,
      underscored: true,
      validate: {
        exactlyOneTarget() {
          if (Boolean(this.taskId) === Boolean(this.ticketId)) {
            throw new Error("Deadline history must reference exactly one task or ticket.");
          }
        },
      },
    }
  );
