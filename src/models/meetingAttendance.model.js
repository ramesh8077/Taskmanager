const { DataTypes } = require("sequelize");

module.exports = (sequelize) => sequelize.define(
  "MeetingAttendance",
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
    joinedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    leftAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    tableName: "meeting_attendance",
    timestamps: false,
    underscored: true,
    indexes: [
      { fields: ["meeting_id", "user_id", "joined_at"], name: "meeting_attendance_session_idx" },
    ],
  },
);
