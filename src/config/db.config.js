/**
 * Database Configuration
 *
 * Uses individual env vars: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
 * SSL is always enabled for TiDB Cloud compatibility.
 */

require("dotenv").config();

const host = process.env.DB_HOST || "localhost";
const sslEnabled =
  process.env.DB_SSL === "true" ||
  (process.env.DB_SSL !== "false" &&
    !["localhost", "127.0.0.1", "::1"].includes(host));

const dbConfig = {
  HOST: host,
  PORT: process.env.DB_PORT || 3306,
  USER: process.env.DB_USER || "root",
  PASSWORD: process.env.DB_PASSWORD || "",
  DB: process.env.DB_NAME || "team_task_manager",

  dialect: "mysql",

  pool: {
    max: 10,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },

  dialectOptions: sslEnabled
    ? {
        ssl: {
          minVersion: "TLSv1.2",
        },
      }
    : {},

  logging: process.env.NODE_ENV === "production" ? false : console.log,
};

module.exports = dbConfig;
