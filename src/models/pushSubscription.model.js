const { DataTypes } = require("sequelize");

module.exports = (sequelize) =>
  sequelize.define(
    "PushSubscription",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" },
      },
      endpoint: { type: DataTypes.STRING(512), allowNull: false, unique: true },
      p256dh: { type: DataTypes.STRING(255), allowNull: false },
      auth: { type: DataTypes.STRING(255), allowNull: false },
      expirationTime: { type: DataTypes.BIGINT, allowNull: true },
    },
    {
      tableName: "push_subscriptions",
      timestamps: true,
      underscored: true,
      indexes: [{ fields: ["user_id"], name: "push_subscriptions_user_idx" }],
    }
  );
