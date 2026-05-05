/**
 * TicketHistory Model
 */
const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const TicketHistory = sequelize.define(
    "TicketHistory",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      ticketId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "tickets",
          key: "id",
        },
      },
      changedBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "users",
          key: "id",
        },
      },
      field: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      oldValue: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      newValue: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      action: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: "updated",
      },
    },
    {
      tableName: "ticket_history",
      timestamps: true,
      underscored: true,
    }
  );

  return TicketHistory;
};
