const { DataTypes } = require("sequelize");

module.exports = (sequelize) =>
  sequelize.define(
    "ActivityLog",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      actorId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" },
      },
      action: { type: DataTypes.STRING(100), allowNull: false },
      entityType: { type: DataTypes.STRING(50), allowNull: false },
      entityId: { type: DataTypes.STRING(64), allowNull: false },
      metadata: { type: DataTypes.JSON, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      tableName: "activity_logs",
      timestamps: false,
      underscored: true,
    }
  );
