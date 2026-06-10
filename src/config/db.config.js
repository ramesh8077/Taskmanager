/**
 * Database Configuration
 * 
 * Supports two connection modes:
 *   1. DATABASE_URL — Single connection string (preferred, e.g., mysql://user:pass@host:port/db)
 *   2. Individual env vars — DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
 * 
 * If DATABASE_URL is set, it takes priority.
 */

require("dotenv").config();

// ─── Parse DATABASE_URL if available ────────────────────────────────────────

const DATABASE_URL = process.env.DATABASE_URL;

let connectionConfig;

if (DATABASE_URL) {
  // Use connection URI directly — Sequelize accepts this in the constructor
  connectionConfig = {
    url: DATABASE_URL,
  };
} else {
  // Fallback to individual environment variables
  connectionConfig = {
    HOST: process.env.DB_HOST || "localhost",
    PORT: process.env.DB_PORT || 3306,
    USER: process.env.DB_USER || "root",
    PASSWORD: process.env.DB_PASSWORD || "",
    DB: process.env.DB_NAME || "team_task_manager",
  };
}

module.exports = {
  ...connectionConfig,

  dialect: "mysql",

  pool: {
    max: 10,        // Maximum number of connections in pool
    min: 0,         // Minimum number of connections in pool
    acquire: 30000, // Max time (ms) to try getting a connection before throwing error
    idle: 10000,    // Max time (ms) a connection can be idle before being released
  },

  dialectOptions: {
    // Ensures proper date handling
    dateStrings: true,
    typeCast: true,
    // TiDB Cloud requires SSL/TLS for connections
    ...(DATABASE_URL
      ? {
          ssl: {
            minVersion: "TLSv1.2",
            rejectUnauthorized: true,
          },
        }
      : {}),
  },

  // Sequelize logging — disable in production
  logging: process.env.NODE_ENV === "production" ? false : console.log,
};
