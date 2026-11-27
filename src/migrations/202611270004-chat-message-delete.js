const { DataTypes } = require("sequelize");

module.exports = {
  async up(queryInterface) {
    const tables = (await queryInterface.showAllTables()).map((table) =>
      typeof table === "string" ? table : table.tableName
    );

    if (tables.includes("chat_messages")) {
      const columns = await queryInterface.describeTable("chat_messages");
      if (!columns.deleted_for_everyone_at) {
        await queryInterface.addColumn("chat_messages", "deleted_for_everyone_at", {
          type: DataTypes.DATE,
          allowNull: true,
        });
      }
      if (!columns.deleted_by_id) {
        await queryInterface.addColumn("chat_messages", "deleted_by_id", {
          type: DataTypes.INTEGER,
          allowNull: true,
        });
      }
    }

    if (!tables.includes("chat_message_hidden")) {
      await queryInterface.createTable("chat_message_hidden", {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        message_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: "chat_messages", key: "id" },
          onDelete: "CASCADE",
          onUpdate: "CASCADE",
        },
        user_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: "users", key: "id" },
          onDelete: "CASCADE",
          onUpdate: "CASCADE",
        },
        created_at: { type: DataTypes.DATE, allowNull: false },
        updated_at: { type: DataTypes.DATE, allowNull: false },
      });
      await queryInterface.addIndex("chat_message_hidden", ["message_id", "user_id"], {
        name: "chat_hidden_msg_user_uq",
        unique: true,
      });
      await queryInterface.addIndex("chat_message_hidden", ["user_id", "message_id"], {
        name: "chat_hidden_user_msg_idx",
      });
    }
  },

  async down(queryInterface) {
    const tables = (await queryInterface.showAllTables()).map((table) =>
      typeof table === "string" ? table : table.tableName
    );
    if (tables.includes("chat_message_hidden")) {
      await queryInterface.dropTable("chat_message_hidden");
    }
    if (tables.includes("chat_messages")) {
      const columns = await queryInterface.describeTable("chat_messages");
      if (columns.deleted_by_id) await queryInterface.removeColumn("chat_messages", "deleted_by_id");
      if (columns.deleted_for_everyone_at) {
        await queryInterface.removeColumn("chat_messages", "deleted_for_everyone_at");
      }
    }
  },
};
