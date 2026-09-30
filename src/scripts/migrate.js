require("dotenv").config();

const fs = require("node:fs");
const path = require("node:path");
const db = require("../models");

async function migrate() {
  await db.sequelize.authenticate();
  const existingTables = (await db.sequelize.getQueryInterface().showAllTables()).map(
    (table) => (typeof table === "string" ? table : table.tableName)
  );
  for (const requiredTable of ["users", "projects", "tasks"]) {
    if (!existingTables.includes(requiredTable)) {
      throw new Error(
        `Required legacy table '${requiredTable}' does not exist; this migration targets an existing Taskmanager database.`
      );
    }
  }
  await db.sequelize.query(
    "CREATE TABLE IF NOT EXISTS `schema_migrations` (`migration_name` VARCHAR(255) NOT NULL PRIMARY KEY, `applied_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)"
  );

  const [appliedRows] = await db.sequelize.query(
    "SELECT `migration_name` FROM `schema_migrations`"
  );
  const applied = new Set(appliedRows.map((row) => row.migration_name));
  const migrationDirectory = path.join(__dirname, "..", "migrations");
  const migrations = fs
    .readdirSync(migrationDirectory)
    .filter((file) => file.endsWith(".js"))
    .sort();

  for (const file of migrations) {
    if (applied.has(file)) continue;
    const migration = require(path.join(migrationDirectory, file));
    console.log(`Applying migration ${file}`);
    await migration.up(db.sequelize.getQueryInterface());
    await db.sequelize.query(
      "INSERT INTO `schema_migrations` (`migration_name`) VALUES (?)",
      { replacements: [file] }
    );
  }
}

migrate()
  .catch((error) => {
    console.error("Database migration failed:", error);
    process.exitCode = 1;
  })
  .finally(() => db.sequelize.close());
