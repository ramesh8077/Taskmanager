/**
 * TicketComment Model
 */
const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const TicketComment = sequelize.define(
    "TicketComment",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      comment: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      ticketId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "tickets",
          key: "id",
        },
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "users",
          key: "id",
        },
      },
    },
    {
      tableName: "ticket_comments",
      timestamps: true,
      underscored: true,
    }
  );

  return TicketComment;
};
