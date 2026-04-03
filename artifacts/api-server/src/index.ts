import { createServer } from "http";

const port = Number(process.env["PORT"] || "8080");

// Wrap EVERYTHING in try/catch — the server MUST open port 8080 no matter what
(async () => {
  let app: any;
  let initError: string | null = null;
  try {
    app = (await import("./app")).default;
    console.log("[Startup] App loaded successfully.");
  } catch (err) {
    initError = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
    console.error("[FATAL] Failed to load app:", initError);
    // Minimal Express to serve health check + error details
    const express = (await import("express")).default;
    app = express();
    app.get("/api/healthz", (_req: any, res: any) => res.json({ status: "degraded", error: initError }));
    app.use((_req: any, res: any) => res.status(503).json({ error: "Server failed to initialize", details: initError }));
  }

  // Database init — non-fatal
  try {
    const { initializeDatabase } = await import("./lib/init-db.js");
    await initializeDatabase();
    console.log("[Startup] Database initialized.");

    // Seed sample data if tables are empty
    const { seedSampleData } = await import("./lib/seed.js");
    await seedSampleData();
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

  // Weekly report + monthly invoices — non-fatal
  try {
    const { startWeeklyReport, startMonthlyInvoices } = await import("./lib/scheduler.js");
    startWeeklyReport();
    startMonthlyInvoices();
  } catch {}

  server.listen(port, "0.0.0.0", () => {
    console.log(`Server listening on 0.0.0.0:${port}`);
  });
})();
