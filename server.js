/**
 * Server Entry Point
 * 
 * Bootstraps the Express application:
 *   1. Loads environment variables.
 *   2. Configures essential middleware (CORS, JSON parsing, Cookie parsing).
 *   3. Authenticates & syncs the Sequelize database connection.
 *   4. Mounts route handlers.
 *   5. In production: also serves the Next.js frontend.
 *   6. Starts the HTTP server.
 */

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const path = require("path");
const appConfig = require("./src/config/app.config");
const db = require("./src/models");

// ─── Import Routes ──────────────────────────────────────────────────────────

const authRoutes = require("./src/routes/authRoutes");
const userRoutes = require("./src/routes/userRoutes");
const projectRoutes = require("./src/routes/projectRoutes");
const taskRoutes = require("./src/routes/taskRoutes");
const ticketRoutes = require("./src/routes/ticketRoutes");

// ─── Initialize Express App ─────────────────────────────────────────────────

const app = express();
app.set("trust proxy", 1);

// ─── Middleware ──────────────────────────────────────────────────────────────

// Enable CORS for all origins (tighten in production)
app.use(
  cors({
    origin: appConfig.CORS_ORIGIN,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true, // Required for cookies to be sent cross-origin
  })
);

// Parse incoming JSON payloads
app.use(express.json({ limit: "10mb" }));

// Parse URL-encoded form data
app.use(express.urlencoded({ extended: true }));

// Parse cookies from incoming requests (needed for JWT auth)
app.use(cookieParser());

// ─── Health Check Route ─────────────────────────────────────────────────────

app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Team Task Manager API is running.",
    environment: appConfig.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// ─── API Routes ─────────────────────────────────────────────────────────────

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/tickets", ticketRoutes);

// ─── Database Sync & Server Start ────────────────────────────────────────────

const PORT = appConfig.PORT;

const startServer = async () => {
  try {
    // Test database connection
    await db.sequelize.authenticate();
    console.log("✅ Database connection established successfully.");

    // Sync all models with the database
    // Use { force: true } to drop & recreate tables (DEVELOPMENT ONLY)
    // Use { alter: true } to alter existing tables to match models
    await db.sequelize.sync({ alter: true });
    console.log("✅ All models synchronized with database.");

      app.use((req, res) => {
        res.status(404).json({
          success: false,
          message: `Route ${req.originalUrl} not found. Backend API sirf /api routes par kaam karti hai.`,
        });
      });

    // Start Express server — bind to 0.0.0.0 for Railway/Docker compatibility
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`\n🚀 Server is running on http://0.0.0.0:${PORT}`);
      console.log(`📡 Environment: ${appConfig.NODE_ENV}`);
      console.log(`🔐 Auth     → /api/auth`);
      console.log(`👥 Users    → /api/users`);
      console.log(`📁 Projects → /api/projects`);
      console.log(`✅ Tasks    → /api/tasks\n`);
    });
  } catch (error) {
    console.error("❌ Unable to start server:", error.message);
    process.exit(1);
  }
};

/**
 * Setup Next.js as request handler within Express (Production only)
 * 
 * Express handles /api/* routes (defined above).
 * Everything else is forwarded to Next.js (pages, static assets, etc.)
 */
async function setupNextJS() {
  try {
    const next = require("next");
    const frontendDir = path.join(__dirname, "frontend");

    const nextApp = next({
      dev: false,
      dir: frontendDir,
    });

    await nextApp.prepare();
    console.log("✅ Next.js frontend prepared successfully.");

    const nextHandler = nextApp.getRequestHandler();

    // Serve all non-API routes through Next.js
    app.all("*", (req, res) => {
      return nextHandler(req, res);
    });
  } catch (error) {
    console.error("⚠️ Next.js setup failed, serving API only:", error.message);
    // Fallback: just add 404 handler for non-API routes
    // app.use((req, res) => {
    //   res.status(404).json({
    //     success: false,
    //     message: `Route ${req.originalUrl} not found.`,
    //   });
    // });
  }
}

startServer();

