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

// ─── Import Routes ──────────────────────────────────────────────────────────

const authRoutes = require("../src/routes/authRoutes");
const userRoutes = require("../src/routes/userRoutes");
const projectRoutes = require("../src/routes/projectRoutes");
const taskRoutes = require("../src/routes/taskRoutes");
const ticketRoutes = require("../src/routes/ticketRoutes");

// ─── Import Database ────────────────────────────────────────────────────────

const db = require("../src/models");

// ─── Initialize Express App ─────────────────────────────────────────────────

const app = express();
app.set("trust proxy", 1);

// ─── Middleware ──────────────────────────────────────────────────────────────

app.use(
  cors({
    origin: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ─── Database Singleton (one-time init per cold start) ──────────────────────

let dbReady = null;

function ensureDB() {
  if (!dbReady) {
    dbReady = db.sequelize
      .authenticate()
      .then(() => db.sequelize.sync())
      .then(() => console.log("✅ DB connected & synced on Vercel"))
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
      success: false,
      message: "Database connection failed. Please check environment variables.",
      error: err.message,
      debug: {
        nodeEnv: process.env.NODE_ENV,
        DB_HOST: process.env.DB_HOST || "(not set)",
        DB_PORT: process.env.DB_PORT || "(not set)",
        DB_USER: process.env.DB_USER || "(not set)",
        DB_NAME: process.env.DB_NAME || "(not set)",
        DB_PASSWORD_LENGTH: (process.env.DB_PASSWORD || "").length,
      },
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

// ─── Export for Vercel ──────────────────────────────────────────────────────

module.exports = app;
