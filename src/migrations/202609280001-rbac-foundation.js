const { DataTypes, QueryTypes } = require("sequelize");

const tableNames = async (queryInterface) =>
  (await queryInterface.showAllTables()).map((table) =>
    typeof table === "string" ? table : table.tableName
  );

const ensureColumn = async (queryInterface, table, name, definition) => {
  const columns = await queryInterface.describeTable(table);
  if (!columns[name]) {
    await queryInterface.addColumn(table, name, definition);
  }
};

const ensureIndex = async (queryInterface, table, name, fields) => {
  const indexes = await queryInterface.showIndex(table);
  if (!indexes.some((index) => index.name === name)) {
    await queryInterface.addIndex(table, fields, { name });
  }
};

module.exports = {
  async up(queryInterface) {
    const existingTables = await tableNames(queryInterface);
    if (!existingTables.includes("roles")) {
      await queryInterface.createTable("roles", {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        name: { type: DataTypes.STRING(32), allowNull: false, unique: true },
        is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
        created_at: { type: DataTypes.DATE, allowNull: false },
        updated_at: { type: DataTypes.DATE, allowNull: false },
      });
    }
    if (!existingTables.includes("permissions")) {
      await queryInterface.createTable("permissions", {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        name: { type: DataTypes.STRING(100), allowNull: false, unique: true },
        description: { type: DataTypes.STRING(255), allowNull: false },
        created_at: { type: DataTypes.DATE, allowNull: false },
        updated_at: { type: DataTypes.DATE, allowNull: false },
      });
    }
    if (!existingTables.includes("role_permissions")) {
      await queryInterface.createTable("role_permissions", {
        role_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          primaryKey: true,
          references: { model: "roles", key: "id" },
          onDelete: "CASCADE",
          onUpdate: "CASCADE",
        },
        permission_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          primaryKey: true,
          references: { model: "permissions", key: "id" },
          onDelete: "CASCADE",
          onUpdate: "CASCADE",
        },
      });
    }

    await ensureColumn(queryInterface, "users", "status", {
      type: DataTypes.ENUM("ACTIVE", "INACTIVE"),
      allowNull: false,
      defaultValue: "ACTIVE",
    });
    await ensureColumn(queryInterface, "users", "created_by_id", {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "users", key: "id" },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });
    await ensureColumn(queryInterface, "users", "last_login_at", {
      type: DataTypes.DATE,
      allowNull: true,
    });

    await queryInterface.changeColumn("users", "role", {
      type: DataTypes.ENUM(
        "Admin",
        "Member",
        "SUPER_ADMIN",
        "ADMIN",
        "MANAGER",
        "EMPLOYEE"
      ),
      allowNull: false,
      defaultValue: "EMPLOYEE",
    });
    await queryInterface.sequelize.query(
      "UPDATE `users` SET `role` = CASE `role` WHEN 'Admin' THEN 'ADMIN' WHEN 'Member' THEN 'EMPLOYEE' ELSE `role` END",
      { type: QueryTypes.UPDATE }
    );
    await queryInterface.changeColumn("users", "role", {
      type: DataTypes.ENUM("SUPER_ADMIN", "ADMIN", "MANAGER", "EMPLOYEE"),
      allowNull: false,
      defaultValue: "EMPLOYEE",
    });

    await ensureColumn(queryInterface, "tasks", "assigned_by_id", {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "users", key: "id" },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });
    await queryInterface.sequelize.query(
      "UPDATE `users` AS `employee` " +
        "INNER JOIN (" +
        "SELECT `tasks`.`assigned_to` AS `employee_id`, MIN(`projects`.`created_by`) AS `owner_id` " +
        "FROM `tasks` INNER JOIN `projects` ON `projects`.`id` = `tasks`.`project_id` " +
        "WHERE `tasks`.`assigned_to` IS NOT NULL " +
        "GROUP BY `tasks`.`assigned_to` " +
        "HAVING COUNT(DISTINCT `projects`.`created_by`) = 1" +
        ") AS `owners` ON `owners`.`employee_id` = `employee`.`id` " +
        "SET `employee`.`created_by_id` = `owners`.`owner_id` " +
        "WHERE `employee`.`role` = 'EMPLOYEE' AND `employee`.`created_by_id` IS NULL",
      { type: QueryTypes.UPDATE }
    );
    await ensureIndex(queryInterface, "tasks", "tasks_assigned_to_id_idx", ["assigned_to"]);
    await ensureIndex(queryInterface, "tasks", "tasks_assigned_by_id_idx", ["assigned_by_id"]);
    await ensureIndex(queryInterface, "tasks", "tasks_project_id_idx", ["project_id"]);
    await ensureIndex(queryInterface, "tasks", "tasks_status_idx", ["status"]);
    await ensureIndex(queryInterface, "tasks", "tasks_due_date_idx", ["due_date"]);
    await ensureIndex(queryInterface, "users", "users_created_by_id_idx", ["created_by_id"]);
  },
};
