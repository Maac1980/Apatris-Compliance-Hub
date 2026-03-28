import { createServer } from "http";
import app from "./app";
import { initializeDatabase } from "./lib/init-db.js";
import { initWebSocket } from "./lib/websocket.js";
import { startWeeklyReport } from "./lib/scheduler.js";

// ── Pre-flight checks: crash loudly if critical env vars are missing ────────
const REQUIRED_ENV = ["DATABASE_URL", "JWT_SECRET", "PORT"];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length > 0) {
  console.error("╔══════════════════════════════════════════════════════════╗");
  console.error("║  FATAL: Missing required environment variables:         ║");
  for (const k of missing) {
    console.error(`║    • ${k.padEnd(50)}║`);
  }
  console.error("║                                                          ║");
  console.error("║  Set these in Replit Secrets or .env file.               ║");
  console.error("╚══════════════════════════════════════════════════════════╝");
  process.exit(1);
}

// Warn about optional but important vars
const RECOMMENDED_ENV = ["APATRIS_PASS_MANISH", "APATRIS_PASS_AKSHAY", "SMTP_USER", "SMTP_PASS"];
const missingOpt = RECOMMENDED_ENV.filter(k => !process.env[k]);
if (missingOpt.length > 0) {
  console.warn(`[Startup] ⚠ Missing recommended env vars: ${missingOpt.join(", ")} — some features will be disabled.`);
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

(async () => {
  await initializeDatabase();
  const server = createServer(app);
  initWebSocket(server);
  startWeeklyReport();
  server.listen(port, "0.0.0.0", () => {
    console.log(`Server listening on 0.0.0.0:${port} (HTTP + WebSocket)`);
  });
})();
