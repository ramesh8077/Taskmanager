const { DataTypes } = require("sequelize");

async function ensureTable(queryInterface) {
  const tables = (await queryInterface.showAllTables()).map((entry) =>
    typeof entry === "string" ? entry : entry.tableName
  );
  if (!tables.includes("deadline_extension_requests")) {
    await queryInterface.createTable("deadline_extension_requests", {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      task_id: { type: DataTypes.INTEGER, allowNull: false },
      requested_by_id: { type: DataTypes.INTEGER, allowNull: false },
      current_deadline: { type: DataTypes.DATEONLY, allowNull: false },
      requested_deadline: { type: DataTypes.DATEONLY, allowNull: false },
      reason: { type: DataTypes.TEXT, allowNull: false },
      status: {
        type: DataTypes.ENUM("PENDING", "APPROVED", "REJECTED"),
        allowNull: false,
        defaultValue: "PENDING",
      },
      reviewed_by_id: { type: DataTypes.INTEGER, allowNull: true },
      reviewed_at: { type: DataTypes.DATE, allowNull: true },
      response_note: { type: DataTypes.TEXT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
  }
}

async function ensureForeignKey(queryInterface, field, table, nullable = false) {
  const foreignKeys = await queryInterface.getForeignKeyReferencesForTable("deadline_extension_requests");
  if (foreignKeys.some((key) => key.columnName === field)) return;
  await queryInterface.addConstraint("deadline_extension_requests", {
    fields: [field],
    type: "foreign key",
    name: `deadline_extension_requests_${field}_fk`,
    references: { table, field: "id" },
    onDelete: nullable ? "SET NULL" : "CASCADE",
    onUpdate: "CASCADE",
  });
}

async function ensureIndex(queryInterface, name, fields) {
  const indexes = await queryInterface.showIndex("deadline_extension_requests");
  if (!indexes.some((index) => index.name === name)) {
    await queryInterface.addIndex("deadline_extension_requests", fields, { name });
  }
}

module.exports = {
  async up(queryInterface) {
    await ensureTable(queryInterface);
    await ensureForeignKey(queryInterface, "task_id", "tasks");
    await ensureForeignKey(queryInterface, "requested_by_id", "users");
    await ensureForeignKey(queryInterface, "reviewed_by_id", "users", true);
    await ensureIndex(queryInterface, "deadline_requests_task_status_idx", ["task_id", "status"]);
    await ensureIndex(queryInterface, "deadline_requests_requester_created_idx", ["requested_by_id", "created_at"]);
  },
};
