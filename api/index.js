/**
 * Vercel Serverless Function — Express API Handler
 *
 * Wraps the Express backend so it runs as a Vercel Serverless Function.
 * All /api/* requests are routed here by vercel.json.
 *
 * DB connection is initialized once per cold start (singleton pattern).
 */

// Explicit imports so Vercel's bundler includes these packages
// (Sequelize loads mysql2 dynamically, which the bundler can't trace)
require("mysql2");

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const appConfig = require("../src/config/app.config");

// ─── Import Routes ──────────────────────────────────────────────────────────

const authRoutes = require("../src/routes/authRoutes");
const userRoutes = require("../src/routes/userRoutes");
const projectRoutes = require("../src/routes/projectRoutes");
const taskRoutes = require("../src/routes/taskRoutes");
const ticketRoutes = require("../src/routes/ticketRoutes");

// ─── Import Database ────────────────────────────────────────────────────────

const db = require("../src/models");
const apiResponse = require("../src/middlewares/apiResponse");

// ─── Initialize Express App ─────────────────────────────────────────────────

const app = express();
app.set("trust proxy", 1);

// ─── Middleware ──────────────────────────────────────────────────────────────

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || appConfig.CORS_ORIGINS.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Origin is not allowed by CORS."));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(apiResponse);

// ─── Database Singleton (one-time init per cold start) ──────────────────────

let dbReady = null;

function ensureDB() {
  if (!dbReady) {
    dbReady = db.sequelize
      .authenticate()
      .then(async () => {
        if (!appConfig.JWT_SECRET || appConfig.JWT_SECRET.length < 32) {
          throw new Error("JWT_SECRET must contain at least 32 characters.");
        }
        const [migrationRows] = await db.sequelize.query(
          "SELECT `migration_name` FROM `schema_migrations`"
        );
        if (
          !migrationRows.some(
            (row) => row.migration_name === "202609280001-rbac-foundation.js"
          )
        ) {
          throw new Error("Database migrations are missing.");
        }
        console.log("✅ DB connected and migrations checked on Vercel");
      })
      .catch((err) => {
        console.error("❌ DB connection failed:", err.message);
        dbReady = null; // Reset so next request retries
        throw err;
      });
  }
  return dbReady;
}

// Middleware: ensure DB is ready before handling any request
app.use(async (req, res, next) => {
  try {
    await ensureDB();
    next();
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: "DATABASE_UNAVAILABLE", message: "The API is temporarily unavailable." },
      success: false,
      message: "The API is temporarily unavailable.",
    });
  }
});

// ─── Health Check ───────────────────────────────────────────────────────────

app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Team Task Manager API is running on Vercel!",
    timestamp: new Date().toISOString(),
  });
});

// ─── API Routes ─────────────────────────────────────────────────────────────

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/tickets", ticketRoutes);

// ─── 404 Handler ────────────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `API route ${req.originalUrl} not found.`,
  });
});

app.use((error, req, res, next) => {
  console.error("Request middleware failed:", error);
  if (res.headersSent) return next(error);
  return res.status(500).json({
    ok: false,
    error: { code: "REQUEST_FAILED", message: "The request could not be completed." },
    success: false,
    message: "The request could not be completed.",
  });
});

// ─── Export for Vercel ──────────────────────────────────────────────────────

module.exports = app;
