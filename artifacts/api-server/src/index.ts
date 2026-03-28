import { createServer } from "http";
import app from "./app";
import { initializeDatabase } from "./lib/init-db.js";
import { initWebSocket } from "./lib/websocket.js";
import { startWeeklyReport } from "./lib/scheduler.js";

// ── Pre-flight checks: warn about missing env vars (don't crash — Replit injects some at runtime) ──
const CRITICAL_ENV = ["DATABASE_URL", "JWT_SECRET"];
const missingCritical = CRITICAL_ENV.filter(k => !process.env[k]);
if (missingCritical.length > 0) {
  console.warn(`[Startup] ⚠ Missing env vars: ${missingCritical.join(", ")} — database features may fail.`);
}
const OPTIONAL_ENV = ["APATRIS_PASS_MANISH", "APATRIS_PASS_AKSHAY", "SMTP_USER", "SMTP_PASS"];
const missingOpt = OPTIONAL_ENV.filter(k => !process.env[k]);
if (missingOpt.length > 0) {
  console.warn(`[Startup] ⚠ Missing optional env vars: ${missingOpt.join(", ")} — some features disabled.`);
}

const port = Number(process.env["PORT"] || "8080");

(async () => {
  try {
    await initializeDatabase();
    console.log("[Startup] Database initialized.");
  } catch (err) {
    console.error("[Startup] Database init failed:", err instanceof Error ? err.message : err);
    console.warn("[Startup] Server will start anyway — DB features may be unavailable.");
  }

  const server = createServer(app);
  initWebSocket(server);

  try { startWeeklyReport(); } catch { /* non-fatal */ }

  server.listen(port, "0.0.0.0", () => {
    console.log(`Server listening on 0.0.0.0:${port} (HTTP + WebSocket)`);
  });
})();
