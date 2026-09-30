const { DataTypes } = require("sequelize");

module.exports = (sequelize) =>
  sequelize.define(
    "Notification",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" },
      },
      type: { type: DataTypes.STRING(40), allowNull: false },
      title: { type: DataTypes.STRING(200), allowNull: false },
      message: { type: DataTypes.STRING(500), allowNull: false },
      link: { type: DataTypes.STRING(255), allowNull: false },
      dedupeKey: { type: DataTypes.STRING(191), allowNull: false },
      readAt: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: "notifications",
      timestamps: true,
      underscored: true,
      indexes: [{ unique: true, fields: ["user_id", "dedupe_key"] }],
    }
  );
