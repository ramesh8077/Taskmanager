/**
 * Server Entry Point
 * 
 * Bootstraps the Express application:
 *   1. Loads environment variables.
 *   2. Configures essential middleware (CORS, JSON parsing, Cookie parsing).
 *   3. Authenticates & syncs the Sequelize database connection.
 *   4. Mounts route handlers.
 *   5. Starts the HTTP server.
 */

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
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

// ─── 404 Handler ─────────────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found.`,
  });
});

// ─── Global Error Handler ────────────────────────────────────────────────────

app.use((err, req, res, next) => {
  console.error("❌ Unhandled Error:", err.message);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
    ...(appConfig.NODE_ENV === "development" && { stack: err.stack }),
  });
});

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

    // Start Express server
    app.listen(PORT, () => {
      console.log(`\n🚀 Server is running on http://localhost:${PORT}`);
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

startServer();
