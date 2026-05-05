/**
 * Ticket Model
 */
const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Ticket = sequelize.define(
    "Ticket",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
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
        type: DataTypes.ENUM("P0", "P1", "P2"),
        allowNull: false,
        defaultValue: "P2",
      },
      status: {
        type: DataTypes.ENUM("Open", "In-Progress", "Resolved", "Closed"),
        allowNull: false,
        defaultValue: "Open",
      },
      department: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      rootCause: {
        type: DataTypes.TEXT,
        allowNull: true,
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
    }
  );

  return Ticket;
};
