/**
 * Database Configuration
 *
 * Uses individual env vars: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
 * SSL is always enabled for TiDB Cloud compatibility.
 */

require("dotenv").config();

const dbConfig = {
  HOST: process.env.DB_HOST || "localhost",
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

  dialectOptions: {
    dateStrings: true,
    typeCast: true,
    ssl: {
      minVersion: "TLSv1.2",
      rejectUnauthorized: false,
    },
  },

  logging: process.env.NODE_ENV === "production" ? false : console.log,
};

module.exports = dbConfig;
