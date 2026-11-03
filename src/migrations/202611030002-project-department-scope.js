const { DataTypes } = require("sequelize");

module.exports = {
  async up(queryInterface) {
    const columns = await queryInterface.describeTable("projects");
    if (!columns.department) {
      await queryInterface.addColumn("projects", "department", {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "Department that owns this project; null is reserved for legacy or unscoped projects.",
      });
    }

    await queryInterface.sequelize.query(`
      UPDATE projects AS project
      LEFT JOIN users AS creator ON creator.id = project.created_by
      LEFT JOIN (
        SELECT project_id, MIN(department) AS department, COUNT(DISTINCT department) AS department_count
        FROM tasks
        WHERE department IS NOT NULL AND department <> ''
        GROUP BY project_id
      ) AS task_department ON task_department.project_id = project.id
      SET project.department = CASE
        WHEN task_department.department_count = 1 THEN task_department.department
        WHEN task_department.department_count > 1 AND creator.position = 'MANAGER' THEN NULL
        ELSE creator.department
      END
      WHERE project.department IS NULL
    `);

    const indexes = await queryInterface.showIndex("projects");
    if (!indexes.some((index) => index.name === "projects_department_created_idx")) {
      await queryInterface.addIndex("projects", ["department", "created_at"], {
        name: "projects_department_created_idx",
      });
    }
  },

  async down(queryInterface) {
    const indexes = await queryInterface.showIndex("projects");
    if (indexes.some((index) => index.name === "projects_department_created_idx")) {
      await queryInterface.removeIndex("projects", "projects_department_created_idx");
    }
    const columns = await queryInterface.describeTable("projects");
    if (columns.department) await queryInterface.removeColumn("projects", "department");
  },
};
