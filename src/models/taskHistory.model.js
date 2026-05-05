/**
 * TaskHistory Model
 * 
 * Tracks the complete timeline/history of changes made to a task.
 * Every status change, reassignment, or update is logged here.
 */

const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const TaskHistory = sequelize.define(
    "TaskHistory",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      taskId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "tasks",
          key: "id",
        },
        comment: "Foreign key referencing the task this history entry belongs to.",
      },
      changedBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "users",
          key: "id",
        },
        comment: "The user who made this change.",
      },
      field: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: "The field that was changed (e.g., 'status', 'priority', 'assignedTo').",
      },
      oldValue: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: "The previous value of the field.",
      },
      newValue: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: "The new value of the field.",
      },
      action: {
        type: DataTypes.ENUM("created", "status_changed", "priority_changed", "reassigned", "updated"),
        allowNull: false,
        defaultValue: "updated",
        comment: "Type of action performed.",
      },
    },
    {
      tableName: "task_history",
      timestamps: true,
      updatedAt: false, // History entries are immutable — only createdAt matters
      underscored: true,
    }
  );

  return TaskHistory;
};
