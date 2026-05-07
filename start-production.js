/**
 * Combined Production Server for Railway
 * 
 * Runs BOTH Express API (internal port 5000) and Next.js frontend (Railway's PORT)
 * in a single service. Next.js rewrites proxy /api/* to Express.
 */

const { spawn } = require("child_process");
const path = require("path");

const RAILWAY_PORT = process.env.PORT || 3000;
const BACKEND_PORT = 5000;
const frontendDir = path.join(__dirname, "frontend");

console.log("═══════════════════════════════════════════════════");
console.log("  🚀 Team Task Manager — Production Server");
console.log("═══════════════════════════════════════════════════");
console.log(`  📡 Express API  → http://0.0.0.0:${BACKEND_PORT} (internal)`);
console.log(`  🌐 Next.js App  → http://0.0.0.0:${RAILWAY_PORT} (public)`);
console.log("═══════════════════════════════════════════════════\n");

// ─── Start Express Backend on internal port ────────────────────────────────
const backend = spawn("node", ["server.js"], {
  cwd: __dirname,
  stdio: "inherit",
  env: {
    ...process.env,
    PORT: String(BACKEND_PORT),  // Force Express to use internal port
  },
});

// ─── Start Next.js Frontend on Railway's public port ───────────────────────
// Small delay to let Express boot first
setTimeout(() => {
  const frontend = spawn("npx", ["next", "start", "-p", String(RAILWAY_PORT), "-H", "0.0.0.0"], {
    cwd: frontendDir,
    stdio: "inherit",
    env: {
      ...process.env,
      PORT: String(RAILWAY_PORT),
      NEXT_PUBLIC_API_URL: `http://localhost:${BACKEND_PORT}`,
    },
  });

  frontend.on("exit", (code) => {
    console.error(`❌ Frontend exited with code ${code}`);
    process.exit(code || 1);
  });

  // Cleanup on termination
  const cleanup = () => {
    backend.kill();
    frontend.kill();
    process.exit(0);
  };

  process.on("SIGTERM", cleanup);
  process.on("SIGINT", cleanup);
}, 2000);

backend.on("exit", (code) => {
  console.error(`❌ Backend exited with code ${code}`);
  process.exit(code || 1);
});
