/**
 * Task Model
 * 
 * Represents a task within a project.
 * Each task belongs to a project and is assigned to a user (Member).
 */

const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Task = sequelize.define(
    "Task",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      title: {
        type: DataTypes.STRING(200),
        allowNull: false,
        validate: {
          notEmpty: {
            msg: "Task title cannot be empty.",
          },
          len: {
            args: [3, 200],
            msg: "Task title must be between 3 and 200 characters.",
          },
        },
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM("Pending", "In-Progress", "Completed"),
        allowNull: false,
        defaultValue: "Pending",
        validate: {
          isIn: {
            args: [["Pending", "In-Progress", "Completed"]],
            msg: "Status must be 'Pending', 'In-Progress', or 'Completed'.",
          },
        },
      },
      priority: {
        type: DataTypes.ENUM("Low", "Medium", "High", "Urgent"),
        allowNull: false,
        defaultValue: "Medium",
        validate: {
          isIn: {
            args: [["Low", "Medium", "High", "Urgent"]],
            msg: "Priority must be 'Low', 'Medium', 'High', or 'Urgent'.",
          },
        },
      },
      dueDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        validate: {
          notEmpty: {
            msg: "Due date is required.",
          },
          isDate: {
            msg: "Please provide a valid date.",
          },
        },
      },
      projectId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "projects",
          key: "id",
        },
        comment: "Foreign key referencing the project this task belongs to.",
      },
      assignedTo: {
        type: DataTypes.INTEGER,
        allowNull: true,  // Must be nullable — FK uses ON DELETE SET NULL
        references: {
          model: "users",
          key: "id",
        },
        comment: "Foreign key referencing the user assigned to this task.",
      },
      completedBy: {
        type: DataTypes.STRING(150),
        allowNull: true,
        comment: "Name of the person who completed this task.",
      },
      completedAt: {
        type: DataTypes.DATEONLY,
        allowNull: true,
        comment: "Date when this task was marked as completed.",
      },
    },
    {
      tableName: "tasks",
      timestamps: true,
      underscored: true,
    }
  );

  return Task;
};
