/**
 * Application Configuration
 * 
 * Centralizes all application-level configuration values.
 */

require("dotenv").config();

module.exports = {
  PORT: process.env.PORT || 5000,
  NODE_ENV: process.env.NODE_ENV || "development",
  JWT_SECRET: process.env.JWT_SECRET || "fallback_secret_change_me",
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",

  // CORS allowed origins
  CORS_ORIGIN: process.env.CORS_ORIGIN || "*",
};
