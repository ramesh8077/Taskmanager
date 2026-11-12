const { QueryTypes } = require("sequelize");

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      "INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`) " +
        "SELECT `roles`.`id`, `permissions`.`id` " +
        "FROM `roles` CROSS JOIN `permissions` " +
        "WHERE `roles`.`name` = 'EMPLOYEE' AND `permissions`.`name` = 'task:create'",
      { type: QueryTypes.INSERT },
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      "DELETE `role_permissions` FROM `role_permissions` " +
        "INNER JOIN `roles` ON `roles`.`id` = `role_permissions`.`role_id` " +
        "INNER JOIN `permissions` ON `permissions`.`id` = `role_permissions`.`permission_id` " +
        "WHERE `roles`.`name` = 'EMPLOYEE' AND `permissions`.`name` = 'task:create'",
      { type: QueryTypes.DELETE },
    );
  },
};
