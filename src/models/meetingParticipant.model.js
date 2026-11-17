const { DataTypes } = require("sequelize");

module.exports = (sequelize) => sequelize.define(
  "MeetingParticipant",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    meetingId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "meetings", key: "id" },
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "users", key: "id" },
    },
    invitedById: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "users", key: "id" },
    },
    participantRole: {
      type: DataTypes.ENUM("HOST", "PARTICIPANT"),
      allowNull: false,
      defaultValue: "PARTICIPANT",
    },
  },
  {
    tableName: "meeting_participants",
    timestamps: true,
    underscored: true,
    indexes: [
      { unique: true, fields: ["meeting_id", "user_id"], name: "meeting_participants_unique_idx" },
      { fields: ["user_id", "meeting_id"], name: "meeting_participants_user_idx" },
    ],
  },
);
