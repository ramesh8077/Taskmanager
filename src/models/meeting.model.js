const { DataTypes } = require("sequelize");

module.exports = (sequelize) => sequelize.define(
  "Meeting",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    title: { type: DataTypes.STRING(160), allowNull: false },
    agenda: { type: DataTypes.TEXT, allowNull: true },
    transcript: { type: DataTypes.TEXT("long"), allowNull: true },
    minutes: { type: DataTypes.JSON, allowNull: true },
    scheduledAt: { type: DataTypes.DATE, allowNull: false },
    durationMinutes: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: false },
    status: {
      type: DataTypes.ENUM("SCHEDULED", "LIVE", "ENDED", "CANCELLED"),
      allowNull: false,
      defaultValue: "SCHEDULED",
    },
    roomName: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    meetingUri: { type: DataTypes.STRING(255), allowNull: true },
    hostId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "users", key: "id" },
    },
    startedAt: { type: DataTypes.DATE, allowNull: true },
    endedAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    tableName: "meetings",
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ["host_id", "scheduled_at"], name: "meetings_host_schedule_idx" },
      { fields: ["status", "scheduled_at"], name: "meetings_status_schedule_idx" },
    ],
  },
);
