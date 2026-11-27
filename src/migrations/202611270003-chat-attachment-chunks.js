const { DataTypes } = require("sequelize");

module.exports = {
  async up(queryInterface) {
    const tables = (await queryInterface.showAllTables()).map((table) =>
      typeof table === "string" ? table : table.tableName
    );

    if (tables.includes("chat_attachments")) {
      const columns = await queryInterface.describeTable("chat_attachments");
      await queryInterface.changeColumn("chat_attachments", "file_data", {
        type: DataTypes.BLOB("long"),
        allowNull: true,
      });
      if (!columns.is_chunked) {
        await queryInterface.addColumn("chat_attachments", "is_chunked", {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        });
      }
    }

    if (!tables.includes("chat_attachment_chunks")) {
      await queryInterface.createTable("chat_attachment_chunks", {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        attachment_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: "chat_attachments", key: "id" },
          onDelete: "CASCADE",
          onUpdate: "CASCADE",
        },
        chunk_index: { type: DataTypes.INTEGER, allowNull: false },
        chunk_data: { type: DataTypes.BLOB("long"), allowNull: false },
        created_at: { type: DataTypes.DATE, allowNull: false },
        updated_at: { type: DataTypes.DATE, allowNull: false },
      });
      await queryInterface.addIndex("chat_attachment_chunks", ["attachment_id", "chunk_index"], {
        name: "chat_att_chunks_att_idx",
        unique: true,
      });
    }
  },

  async down(queryInterface) {
    const tables = (await queryInterface.showAllTables()).map((table) =>
      typeof table === "string" ? table : table.tableName
    );
    if (tables.includes("chat_attachment_chunks")) {
      await queryInterface.dropTable("chat_attachment_chunks");
    }
    if (tables.includes("chat_attachments")) {
      const columns = await queryInterface.describeTable("chat_attachments");
      if (columns.is_chunked) await queryInterface.removeColumn("chat_attachments", "is_chunked");
    }
  },
};
