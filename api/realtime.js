/**
 * Vercel WebSocket Function for authenticated notification delivery.
 * REST endpoints stay on api/index.js; keeping the HTTP API export as Express
 * preserves standard Vercel request handling.
 */
require("dotenv").config();

const { createServer } = require("http");
const db = require("../src/models");
const appConfig = require("../src/config/app.config");
const { attachRealtimeNotifications } = require("../src/lib/realtimeNotifications");

let dbReady = null;

function ensureDB() {
  if (!dbReady) {
    dbReady = db.sequelize.authenticate()
      .then(async () => {
        if (!appConfig.JWT_SECRET || appConfig.JWT_SECRET.length < 32) {
          throw new Error("JWT_SECRET must contain at least 32 characters.");
        }
        const [migrationRows] = await db.sequelize.query(
          "SELECT `migration_name` FROM `schema_migrations`"
        );
        const requiredMigration = "202611160002-push-subscriptions.js";
        if (!migrationRows.some((row) => row.migration_name === requiredMigration)) {
          throw new Error("Push subscription migration is missing.");
        }
      })
      .catch((error) => {
        dbReady = null;
        throw error;
      });
  }
  return dbReady;
}

const server = createServer((_request, response) => {
  response.writeHead(404, { "Content-Type": "text/plain" });
  response.end("WebSocket endpoint only.");
});

attachRealtimeNotifications(server, ensureDB);

module.exports = server;
