import { createServer } from "http";

const port = Number(process.env["PORT"] || "8080");

// Wrap EVERYTHING in try/catch — the server MUST open port 8080 no matter what
(async () => {
  let app: any;
  try {
    app = (await import("./app")).default;
  } catch (err) {
    console.error("[FATAL] Failed to load app:", err);
    // Minimal Express to serve health check even if app fails to load
    const express = (await import("express")).default;
    app = express();
    app.get("/api/healthz", (_req: any, res: any) => res.json({ status: "ok", degraded: true }));
    app.use((_req: any, res: any) => res.status(503).json({ error: "Server failed to initialize" }));
  }

  // Database init — non-fatal
  try {
    const { initializeDatabase } = await import("./lib/init-db.js");
    await initializeDatabase();
    console.log("[Startup] Database initialized.");
  } catch (err) {
    console.error("[Startup] Database init failed:", err instanceof Error ? err.message : err);
  }

  const server = createServer(app);

  // WebSocket — non-fatal
  try {
    const { initWebSocket } = await import("./lib/websocket.js");
    initWebSocket(server);
  } catch (err) {
    console.error("[Startup] WebSocket init failed:", err instanceof Error ? err.message : err);
  }

  // Weekly report — non-fatal
  try {
    const { startWeeklyReport } = await import("./lib/scheduler.js");
    startWeeklyReport();
  } catch {}

  server.listen(port, "0.0.0.0", () => {
    console.log(`Server listening on 0.0.0.0:${port}`);
  });
})();
