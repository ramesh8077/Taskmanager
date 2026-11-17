const { DataTypes } = require("sequelize");

module.exports = {
  async up(queryInterface) {
    const columns = await queryInterface.describeTable("ticket_attachments");
    if (!columns.image_data) {
      await queryInterface.addColumn("ticket_attachments", "image_data", {
        type: DataTypes.BLOB("long"),
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const columns = await queryInterface.describeTable("ticket_attachments");
    if (columns.image_data) await queryInterface.removeColumn("ticket_attachments", "image_data");
  },
};
