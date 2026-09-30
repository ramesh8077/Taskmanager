const { DataTypes } = require("sequelize");

async function ensureColumn(queryInterface, name, definition) {
  const columns = await queryInterface.describeTable("tickets");
  if (!columns[name]) await queryInterface.addColumn("tickets", name, definition);
}

async function ensureIndex(queryInterface, table, fields, name, unique = false) {
  const indexes = await queryInterface.showIndex(table);
  if (!indexes.some((index) => index.name === name)) {
    await queryInterface.addIndex(table, fields, { name, unique });
  }
}

module.exports = {
  async up(queryInterface) {
    const tables = (await queryInterface.showAllTables()).map((table) =>
      typeof table === "string" ? table : table.tableName
    );
    if (!tables.includes("tickets")) {
      throw new Error("Required legacy table 'tickets' does not exist.");
    }
    await ensureColumn(queryInterface, "resolved_by", {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "users", key: "id" },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });
    await ensureColumn(queryInterface, "resolved_at", { type: DataTypes.DATE, allowNull: true });
    await ensureColumn(queryInterface, "deadline", { type: DataTypes.DATEONLY, allowNull: true });
    await ensureColumn(queryInterface, "project_id", {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "projects", key: "id" },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });
    await ensureColumn(queryInterface, "task_id", {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "tasks", key: "id" },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });
    await ensureIndex(queryInterface, "tickets", ["status", "deadline"], "tickets_status_deadline_idx");
    await ensureIndex(queryInterface, "tickets", ["created_by", "created_at"], "tickets_creator_created_idx");
    await ensureIndex(queryInterface, "tickets", ["assigned_to", "created_at"], "tickets_assignee_created_idx");

    if (!tables.includes("notifications")) {
      await queryInterface.createTable("notifications", {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        user_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: "users", key: "id" },
          onDelete: "CASCADE",
          onUpdate: "CASCADE",
        },
        type: { type: DataTypes.STRING(40), allowNull: false },
        title: { type: DataTypes.STRING(200), allowNull: false },
        message: { type: DataTypes.STRING(500), allowNull: false },
        link: { type: DataTypes.STRING(255), allowNull: false },
        dedupe_key: { type: DataTypes.STRING(191), allowNull: false },
        read_at: { type: DataTypes.DATE, allowNull: true },
        created_at: { type: DataTypes.DATE, allowNull: false },
        updated_at: { type: DataTypes.DATE, allowNull: false },
      });
      await queryInterface.addIndex("notifications", ["user_id", "dedupe_key"], {
        unique: true,
        name: "notifications_user_dedupe_unique",
      });
      await queryInterface.addIndex("notifications", ["user_id", "read_at"], {
        name: "notifications_user_read_idx",
      });
    }
    await ensureIndex(queryInterface, "notifications", ["user_id", "dedupe_key"], "notifications_user_dedupe_unique", true);
    await ensureIndex(queryInterface, "notifications", ["user_id", "read_at"], "notifications_user_read_idx");

    if (!tables.includes("ticket_attachments")) {
      await queryInterface.createTable("ticket_attachments", {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        ticket_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: "tickets", key: "id" },
          onDelete: "CASCADE",
          onUpdate: "CASCADE",
        },
        uploaded_by: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: "users", key: "id" },
          onDelete: "RESTRICT",
          onUpdate: "CASCADE",
        },
        file_name: { type: DataTypes.STRING(255), allowNull: false },
        storage_name: { type: DataTypes.STRING(100), allowNull: false, unique: true },
        mime_type: { type: DataTypes.STRING(100), allowNull: false },
        file_size: { type: DataTypes.INTEGER, allowNull: false },
        created_at: { type: DataTypes.DATE, allowNull: false },
        updated_at: { type: DataTypes.DATE, allowNull: false },
      });
      await queryInterface.addIndex("ticket_attachments", ["ticket_id"], {
        name: "ticket_attachments_ticket_idx",
      });
    }
    await ensureIndex(queryInterface, "ticket_attachments", ["ticket_id"], "ticket_attachments_ticket_idx");
  },
};
