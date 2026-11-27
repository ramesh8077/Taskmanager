const { DataTypes } = require("sequelize");

module.exports = {
  async up(queryInterface) {
    const tables = (await queryInterface.showAllTables()).map((table) =>
      typeof table === "string" ? table : table.tableName
    );

    if (tables.includes("chat_messages")) {
      const columns = await queryInterface.describeTable("chat_messages");
      await queryInterface.changeColumn("chat_messages", "message", {
        type: DataTypes.STRING(2000),
        allowNull: false,
        defaultValue: "",
      });
      if (!columns.reply_to_id) {
        await queryInterface.addColumn("chat_messages", "reply_to_id", {
          type: DataTypes.INTEGER,
          allowNull: true,
        });
        await queryInterface.addIndex("chat_messages", ["reply_to_id"], {
          name: "chat_messages_reply_to_idx",
        });
        await queryInterface.addConstraint("chat_messages", {
          fields: ["reply_to_id"],
          type: "foreign key",
          name: "chat_messages_reply_to_fk",
          references: {
            table: "chat_messages",
            field: "id",
          },
          onDelete: "SET NULL",
          onUpdate: "CASCADE",
        });
      }
      if (!columns.message_type) {
        await queryInterface.addColumn("chat_messages", "message_type", {
          type: DataTypes.STRING(24),
          allowNull: false,
          defaultValue: "text",
        });
      }
    }

    if (!tables.includes("chat_attachments")) {
      await queryInterface.createTable("chat_attachments", {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        message_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: "chat_messages", key: "id" },
          onDelete: "CASCADE",
          onUpdate: "CASCADE",
        },
        uploaded_by: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: "users", key: "id" },
          onDelete: "CASCADE",
          onUpdate: "CASCADE",
        },
        category: { type: DataTypes.STRING(24), allowNull: false },
        file_name: { type: DataTypes.STRING(255), allowNull: false },
        mime_type: { type: DataTypes.STRING(120), allowNull: false },
        file_size: { type: DataTypes.INTEGER, allowNull: false },
        duration_seconds: { type: DataTypes.INTEGER, allowNull: true },
        file_data: { type: DataTypes.BLOB("long"), allowNull: false },
        created_at: { type: DataTypes.DATE, allowNull: false },
        updated_at: { type: DataTypes.DATE, allowNull: false },
      });
      await queryInterface.addIndex("chat_attachments", ["message_id"], {
        name: "chat_attachments_message_idx",
      });
    }

    if (!tables.includes("chat_message_receipts")) {
      await queryInterface.createTable("chat_message_receipts", {
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
        delivered_at: { type: DataTypes.DATE, allowNull: true },
        seen_at: { type: DataTypes.DATE, allowNull: true },
        created_at: { type: DataTypes.DATE, allowNull: false },
        updated_at: { type: DataTypes.DATE, allowNull: false },
      });
      await queryInterface.addIndex("chat_message_receipts", ["message_id", "user_id"], {
        name: "chat_receipts_message_user_uq",
        unique: true,
      });
      await queryInterface.addIndex("chat_message_receipts", ["user_id", "seen_at"], {
        name: "chat_receipts_user_seen_idx",
      });
    }
  },

  async down(queryInterface) {
    const tables = (await queryInterface.showAllTables()).map((table) =>
      typeof table === "string" ? table : table.tableName
    );
    if (tables.includes("chat_message_receipts")) {
      await queryInterface.dropTable("chat_message_receipts");
    }
    if (tables.includes("chat_attachments")) {
      await queryInterface.dropTable("chat_attachments");
    }
    if (tables.includes("chat_messages")) {
      const columns = await queryInterface.describeTable("chat_messages");
      if (columns.message_type) await queryInterface.removeColumn("chat_messages", "message_type");
      if (columns.reply_to_id) await queryInterface.removeColumn("chat_messages", "reply_to_id");
    }
  },
};
