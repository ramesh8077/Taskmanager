const { DataTypes } = require("sequelize");

module.exports = {
  async up(queryInterface) {
    const existing = new Set(
      (await queryInterface.showAllTables()).map((table) =>
        typeof table === "string" ? table : table.tableName,
      ),
    );

    if (!existing.has("meetings")) {
      await queryInterface.createTable("meetings", {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        title: { type: DataTypes.STRING(160), allowNull: false },
        agenda: { type: DataTypes.TEXT, allowNull: true },
        scheduled_at: { type: DataTypes.DATE, allowNull: false },
        duration_minutes: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: false },
        status: {
          type: DataTypes.ENUM("SCHEDULED", "LIVE", "ENDED", "CANCELLED"),
          allowNull: false,
          defaultValue: "SCHEDULED",
        },
        room_name: { type: DataTypes.STRING(64), allowNull: false, unique: true },
        host_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: "users", key: "id" },
          onDelete: "RESTRICT",
          onUpdate: "CASCADE",
        },
        started_at: { type: DataTypes.DATE, allowNull: true },
        ended_at: { type: DataTypes.DATE, allowNull: true },
        created_at: { type: DataTypes.DATE, allowNull: false },
        updated_at: { type: DataTypes.DATE, allowNull: false },
      });
      await queryInterface.addIndex("meetings", ["host_id", "scheduled_at"], { name: "meetings_host_schedule_idx" });
      await queryInterface.addIndex("meetings", ["status", "scheduled_at"], { name: "meetings_status_schedule_idx" });
    }

    const tables = new Set(
      (await queryInterface.showAllTables()).map((table) =>
        typeof table === "string" ? table : table.tableName,
      ),
    );
    if (!tables.has("meeting_participants")) {
      await queryInterface.createTable("meeting_participants", {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        meeting_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: "meetings", key: "id" },
          onDelete: "CASCADE",
          onUpdate: "CASCADE",
        },
        user_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: "users", key: "id" },
          onDelete: "CASCADE",
          onUpdate: "CASCADE",
        },
        invited_by_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: "users", key: "id" },
          onDelete: "CASCADE",
          onUpdate: "CASCADE",
        },
        participant_role: {
          type: DataTypes.ENUM("HOST", "PARTICIPANT"),
          allowNull: false,
          defaultValue: "PARTICIPANT",
        },
        created_at: { type: DataTypes.DATE, allowNull: false },
        updated_at: { type: DataTypes.DATE, allowNull: false },
      });
      await queryInterface.addIndex("meeting_participants", ["meeting_id", "user_id"], {
        unique: true,
        name: "meeting_participants_unique_idx",
      });
      await queryInterface.addIndex("meeting_participants", ["user_id", "meeting_id"], {
        name: "meeting_participants_user_idx",
      });
    }

    const currentTables = new Set(
      (await queryInterface.showAllTables()).map((table) =>
        typeof table === "string" ? table : table.tableName,
      ),
    );
    if (!currentTables.has("meeting_attendance")) {
      await queryInterface.createTable("meeting_attendance", {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        meeting_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: "meetings", key: "id" },
          onDelete: "CASCADE",
          onUpdate: "CASCADE",
        },
        user_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: "users", key: "id" },
          onDelete: "CASCADE",
          onUpdate: "CASCADE",
        },
        joined_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        left_at: { type: DataTypes.DATE, allowNull: true },
      });
      await queryInterface.addIndex("meeting_attendance", ["meeting_id", "user_id", "joined_at"], {
        name: "meeting_attendance_session_idx",
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable("meeting_attendance");
    await queryInterface.dropTable("meeting_participants");
    await queryInterface.dropTable("meetings");
  },
};
