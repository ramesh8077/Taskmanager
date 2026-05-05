/**
 * User Model
 * 
 * Represents a user of the Team Task Manager application.
 * Users can be either 'Admin' or 'Member'.
 * - Admins can create projects and assign tasks.
 * - Members can be assigned to tasks within projects.
 */

const { DataTypes } = require("sequelize");

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
        type: DataTypes.ENUM("Admin", "Member"),
        allowNull: false,
        defaultValue: "Member",
        validate: {
          isIn: {
            args: [["Admin", "Member"]],
            msg: "Role must be either 'Admin' or 'Member'.",
          },
        },
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
