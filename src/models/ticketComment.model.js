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
      imageData: { type: DataTypes.BLOB("medium"), allowNull: true },
      imageMimeType: { type: DataTypes.STRING(50), allowNull: true },
      imageFileName: { type: DataTypes.STRING(255), allowNull: true },
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
