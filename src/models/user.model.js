/**
 * User Model
 * 
 * Represents a user of the Team Task Manager application.
 * User roles are seeded from the Role and Permission tables.
 */

const { DataTypes } = require("sequelize");
const crypto = require("node:crypto");
const { DEPARTMENTS, POSITIONS } = require("../../shared/organization");

module.exports = (sequelize) => {
  const User = sequelize.define(
    "User",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        validate: {
          notEmpty: {
            msg: "Name cannot be empty.",
          },
          len: {
            args: [2, 100],
            msg: "Name must be between 2 and 100 characters.",
          },
        },
      },
      email: {
        type: DataTypes.STRING(150),
        allowNull: false,
        unique: {
          msg: "Email address is already in use.",
        },
        validate: {
          notEmpty: {
            msg: "Email cannot be empty.",
          },
          isEmail: {
            msg: "Please provide a valid email address.",
          },
        },
      },
      password: {
        type: DataTypes.STRING(255),
        allowNull: false,
        validate: {
          notEmpty: {
            msg: "Password cannot be empty.",
          },
          len: {
            args: [6, 255],
            msg: "Password must be at least 6 characters long.",
          },
        },
      },
      role: {
        type: DataTypes.ENUM("SUPER_ADMIN", "ADMIN", "MANAGER", "EMPLOYEE"),
        allowNull: false,
        defaultValue: "EMPLOYEE",
      },
      department: {
        type: DataTypes.ENUM(...DEPARTMENTS),
        allowNull: false,
        defaultValue: "Operations",
      },
      position: {
        type: DataTypes.ENUM(...POSITIONS),
        allowNull: false,
        defaultValue: "EMPLOYEE",
      },
      reportsToId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "users", key: "id" },
      },
      employeeId: {
        type: DataTypes.STRING(32),
        allowNull: false,
        unique: true,
        defaultValue: () => `EMP-${crypto.randomBytes(8).toString("hex").toUpperCase()}`,
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      joinedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      lastActivityAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM("ACTIVE", "INACTIVE"),
        allowNull: false,
        defaultValue: "ACTIVE",
      },
      createdById: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "users",
          key: "id",
        },
      },
      lastLoginAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      tableName: "users",
      timestamps: true,   // Adds createdAt & updatedAt
      underscored: true,  // Uses snake_case column names (e.g., created_at)
    }
  );

  return User;
};
