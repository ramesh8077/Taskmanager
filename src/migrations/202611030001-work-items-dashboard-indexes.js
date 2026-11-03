async function ensureIndex(queryInterface, table, name, fields) {
  const indexes = await queryInterface.showIndex(table);
  if (!indexes.some((index) => index.name === name)) {
    await queryInterface.addIndex(table, fields, { name });
  }
}

module.exports = {
  async up(queryInterface) {
    await ensureIndex(queryInterface, "tasks", "tasks_department_status_idx", ["department", "status"]);
    await ensureIndex(queryInterface, "tasks", "tasks_creator_created_idx", ["created_by_id", "created_at"]);
    await ensureIndex(queryInterface, "tickets", "tickets_department_status_idx", ["department", "status"]);
  },
};
