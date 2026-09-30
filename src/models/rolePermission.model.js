const { DataTypes } = require("sequelize");

module.exports = (sequelize) =>
  sequelize.define(
    "RolePermission",
    {
      roleId: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        references: { model: "roles", key: "id" },
      },
      permissionId: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        references: { model: "permissions", key: "id" },
      },
    },
    { tableName: "role_permissions", timestamps: false, underscored: true }
  );
