const { DataTypes } = require("sequelize");

module.exports = (sequelize) =>
  sequelize.define(
    "Role",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: DataTypes.STRING(32), allowNull: false, unique: true },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    { tableName: "roles", timestamps: true, underscored: true }
  );
