/**
 * Application Configuration
 * 
 * Centralizes all application-level configuration values.
 */

require("dotenv").config();

module.exports = {
  PORT: process.env.PORT || 5000,
  NODE_ENV: process.env.NODE_ENV || "development",
  JWT_SECRET: process.env.JWT_SECRET || "",
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",

  // Exact origins only. Credentialed requests never allow "*".
  CORS_ORIGINS: [
    process.env.CORS_ORIGIN,
    process.env.FRONTEND_URL,
    process.env.CLIENT_URL,
    "http://localhost:3000",
    "http://localhost:3001",
  ]
    .filter(Boolean)
    .flatMap((origins) => origins.split(","))
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean),
};
