/**
 * Ticket Model
 */
const { DataTypes } = require("sequelize");
const crypto = require("node:crypto");

module.exports = (sequelize) => {
  const Ticket = sequelize.define(
    "Ticket",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      ticketId: {
        type: DataTypes.STRING(32),
        allowNull: false,
        unique: true,
        defaultValue: () => `TKT-${crypto.randomBytes(8).toString("hex").toUpperCase()}`,
      },
      title: {
        type: DataTypes.STRING(200),
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      screenshotUrl: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      priority: {
        type: DataTypes.ENUM("P0", "P1", "P2", "LOW", "MEDIUM", "HIGH", "URGENT"),
        allowNull: false,
        defaultValue: "P2",
      },
      status: {
        type: DataTypes.ENUM(
          "Open",
          "In-Progress",
          "Resolved",
          "Closed",
          "TODO",
          "IN_PROGRESS",
          "IN_REVIEW",
          "DONE",
          "BLOCKED"
        ),
        allowNull: false,
        defaultValue: "Open",
      },
      department: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      progress: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        validate: { min: 0, max: 100, isInt: true },
      },
      rootCause: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      resolvedBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "users", key: "id" },
      },
      resolvedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      deadline: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      projectId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "projects", key: "id" },
      },
      taskId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "tasks", key: "id" },
      },
      createdBy: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "users",
          key: "id",
        },
      },
      assignedTo: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "users",
          key: "id",
        },
      },
    },
    {
      tableName: "tickets",
      timestamps: true,
      underscored: true,
      hooks: {
        beforeValidate(ticket) {
          if (!ticket.ticketId) {
            ticket.ticketId = `TKT-${crypto.randomBytes(8).toString("hex").toUpperCase()}`;
          }
        },
      },
    }
  );

  return Ticket;
};
