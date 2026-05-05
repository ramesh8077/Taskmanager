/**
 * Project Model
 * 
 * Represents a project within the Team Task Manager.
 * A project is created by an Admin user and can contain multiple tasks.
 */

const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Project = sequelize.define(
    "Project",
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
            msg: "Project title cannot be empty.",
          },
          len: {
            args: [3, 200],
            msg: "Project title must be between 3 and 200 characters.",
          },
        },
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: false,
        validate: {
          notEmpty: {
            msg: "Project description cannot be empty.",
          },
        },
      },
      createdBy: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "users",
          key: "id",
        },
        comment: "Foreign key referencing the Admin user who created this project.",
      },
    },
    {
      tableName: "projects",
      timestamps: true,
      underscored: true,
    }
  );

  return Project;
};
