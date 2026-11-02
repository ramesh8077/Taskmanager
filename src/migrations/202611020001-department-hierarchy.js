const { DataTypes, QueryTypes } = require("sequelize");
const { DEPARTMENTS, POSITIONS } = require("../../shared/organization");

async function ensureColumn(queryInterface, table, name, definition) {
  const columns = await queryInterface.describeTable(table);
  if (!columns[name]) {
    const { references, onDelete, onUpdate, ...columnDefinition } = definition;
    await queryInterface.addColumn(table, name, columnDefinition);
  }

  const { references, onDelete, onUpdate } = definition;
  if (!references) return;
  const foreignKeys = await queryInterface.getForeignKeyReferencesForTable(table);
  if (
    !foreignKeys.some(
      (foreignKey) =>
        foreignKey.columnName === name &&
        foreignKey.referencedTableName === references.model &&
        foreignKey.referencedColumnName === references.key
    )
  ) {
    await queryInterface.addConstraint(table, {
      fields: [name],
      type: "foreign key",
      name: `${table}_${name}_foreign_idx`,
      references: { table: references.model, field: references.key },
      onDelete,
      onUpdate,
    });
  }
}

async function ensureIndex(queryInterface, table, name, fields, unique = false) {
  const indexes = await queryInterface.showIndex(table);
  if (!indexes.some((index) => index.name === name)) {
    await queryInterface.addIndex(table, fields, { name, unique });
  }
}

async function ensureTable(queryInterface, table, columns) {
  const tables = (await queryInterface.showAllTables()).map((entry) =>
    typeof entry === "string" ? entry : entry.tableName
  );
  if (!tables.includes(table)) {
    await queryInterface.createTable(table, columns);
  }
}

module.exports = {
  async up(queryInterface) {
    await ensureColumn(queryInterface, "users", "department", {
      type: DataTypes.ENUM(...DEPARTMENTS),
      allowNull: false,
      defaultValue: "Operations",
    });
    await ensureColumn(queryInterface, "users", "position", {
      type: DataTypes.ENUM(...POSITIONS),
      allowNull: false,
      defaultValue: "EMPLOYEE",
    });
    await ensureColumn(queryInterface, "users", "reports_to_id", {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "users", key: "id" },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });
    await ensureColumn(queryInterface, "users", "employee_id", {
      type: DataTypes.STRING(32),
      allowNull: true,
    });
    await ensureColumn(queryInterface, "users", "is_active", {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });
    await ensureColumn(queryInterface, "users", "joined_at", {
      type: DataTypes.DATE,
      allowNull: true,
    });
    await ensureColumn(queryInterface, "users", "last_activity_at", {
      type: DataTypes.DATE,
      allowNull: true,
    });

    await queryInterface.sequelize.query(
      "UPDATE `users` SET `employee_id` = CONCAT('EMP-', LPAD(`id`, 6, '0')) WHERE `employee_id` IS NULL",
      { type: QueryTypes.UPDATE }
    );
    await queryInterface.sequelize.query(
      "UPDATE `users` SET `joined_at` = `created_at` WHERE `joined_at` IS NULL",
      { type: QueryTypes.UPDATE }
    );
    const userColumns = await queryInterface.describeTable("users");
    if (userColumns.last_login_at) {
      await queryInterface.sequelize.query(
        "UPDATE `users` SET `last_activity_at` = `last_login_at` WHERE `last_activity_at` IS NULL",
        { type: QueryTypes.UPDATE }
      );
    }
    await queryInterface.sequelize.query(
      "UPDATE `users` SET `is_active` = (`status` = 'ACTIVE')",
      { type: QueryTypes.UPDATE }
    );
    await queryInterface.sequelize.query(
      "UPDATE `users` SET `position` = 'MANAGER' WHERE `role` IN ('SUPER_ADMIN', 'MANAGER') AND `reports_to_id` IS NULL",
      { type: QueryTypes.UPDATE }
    );
    await queryInterface.changeColumn("users", "employee_id", {
      type: DataTypes.STRING(32),
      allowNull: false,
    });
    await queryInterface.changeColumn("users", "joined_at", {
      type: DataTypes.DATE,
      allowNull: false,
    });
    await ensureIndex(queryInterface, "users", "users_employee_id_unique", ["employee_id"], true);
    await ensureIndex(queryInterface, "users", "users_department_position_idx", ["department", "position"]);
    await ensureIndex(queryInterface, "users", "users_reports_to_id_idx", ["reports_to_id"]);
    await ensureIndex(queryInterface, "users", "users_name_idx", ["name"]);

    await ensureColumn(queryInterface, "tasks", "department", {
      type: DataTypes.STRING(100),
      allowNull: true,
    });
    await ensureColumn(queryInterface, "tasks", "created_by_id", {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "users", key: "id" },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });
    await ensureColumn(queryInterface, "tasks", "progress", {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.sequelize.query(
      "UPDATE `tasks` SET `department` = COALESCE((SELECT `users`.`department` FROM `users` WHERE `users`.`id` = `tasks`.`assigned_to`), 'Operations') WHERE `department` IS NULL",
      { type: QueryTypes.UPDATE }
    );
    const taskColumns = await queryInterface.describeTable("tasks");
    if (taskColumns.assigned_by_id) {
      await queryInterface.sequelize.query(
        "UPDATE `tasks` SET `created_by_id` = `assigned_by_id` WHERE `created_by_id` IS NULL",
        { type: QueryTypes.UPDATE }
      );
    }
    await queryInterface.changeColumn("tasks", "department", {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: "Operations",
    });
    await queryInterface.changeColumn("tasks", "status", {
      type: DataTypes.ENUM(
        "Pending",
        "In-Progress",
        "Completed",
        "TODO",
        "IN_PROGRESS",
        "IN_REVIEW",
        "DONE",
        "BLOCKED"
      ),
      allowNull: false,
      defaultValue: "Pending",
    });
    await queryInterface.changeColumn("tasks", "priority", {
      type: DataTypes.ENUM("Low", "Medium", "High", "Urgent", "LOW", "MEDIUM", "HIGH", "URGENT"),
      allowNull: false,
      defaultValue: "Medium",
    });
    await ensureIndex(queryInterface, "tasks", "tasks_assignee_status_idx", ["assigned_to", "status"]);
    await ensureIndex(queryInterface, "tasks", "tasks_priority_idx", ["priority"]);
    await ensureIndex(queryInterface, "tasks", "tasks_department_idx", ["department"]);
    await ensureIndex(queryInterface, "tasks", "tasks_created_at_idx", ["created_at"]);

    await ensureColumn(queryInterface, "tickets", "ticket_id", {
      type: DataTypes.STRING(32),
      allowNull: true,
    });
    await ensureColumn(queryInterface, "tickets", "progress", {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.sequelize.query(
      "UPDATE `tickets` SET `ticket_id` = CONCAT('TKT-', LPAD(`id`, 6, '0')) WHERE `ticket_id` IS NULL",
      { type: QueryTypes.UPDATE }
    );
    await queryInterface.changeColumn("tickets", "ticket_id", {
      type: DataTypes.STRING(32),
      allowNull: false,
    });
    await queryInterface.changeColumn("tickets", "priority", {
      type: DataTypes.ENUM("P0", "P1", "P2", "LOW", "MEDIUM", "HIGH", "URGENT"),
      allowNull: false,
      defaultValue: "P2",
    });
    await queryInterface.changeColumn("tickets", "status", {
      type: DataTypes.ENUM(
        "Open",
        "In-Progress",
        "Resolved",
        "Closed",
        "TODO",
        "IN_PROGRESS",
        "IN_REVIEW",
        "DONE",
        "BLOCKED"
      ),
      allowNull: false,
      defaultValue: "Open",
    });
    await ensureIndex(queryInterface, "tickets", "tickets_ticket_id_unique", ["ticket_id"], true);
    await ensureIndex(queryInterface, "tickets", "tickets_department_idx", ["department"]);

    await ensureTable(queryInterface, "deadline_history", {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      task_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "tasks", key: "id" },
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      },
      ticket_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "tickets", key: "id" },
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      },
      old_deadline: { type: DataTypes.DATEONLY, allowNull: true },
      new_deadline: { type: DataTypes.DATEONLY, allowNull: false },
      changed_by_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" },
        onDelete: "RESTRICT",
        onUpdate: "CASCADE",
      },
      changed_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      reason: { type: DataTypes.TEXT, allowNull: false },
    });
    await ensureIndex(queryInterface, "deadline_history", "deadline_history_task_idx", ["task_id"]);
    await ensureIndex(queryInterface, "deadline_history", "deadline_history_ticket_idx", ["ticket_id"]);
    await ensureIndex(queryInterface, "deadline_history", "deadline_history_changed_by_idx", ["changed_by_id"]);

    await ensureTable(queryInterface, "activity_logs", {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      actor_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" },
        onDelete: "RESTRICT",
        onUpdate: "CASCADE",
      },
      action: { type: DataTypes.STRING(100), allowNull: false },
      entity_type: { type: DataTypes.STRING(50), allowNull: false },
      entity_id: { type: DataTypes.STRING(64), allowNull: false },
      metadata: { type: DataTypes.JSON, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
    await ensureIndex(queryInterface, "activity_logs", "activity_logs_actor_created_idx", ["actor_id", "created_at"]);
    await ensureIndex(queryInterface, "activity_logs", "activity_logs_entity_idx", ["entity_type", "entity_id"]);
  },
};
