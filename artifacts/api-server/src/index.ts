import { createServer } from "http";

const port = Number(process.env["PORT"] || "8080");

// Wrap EVERYTHING in try/catch — the server MUST open port 8080 no matter what
(async () => {
  // Sentry error monitoring (optional)
  try {
    if (process.env.SENTRY_DSN) {
      const Sentry = await import("@sentry/node");
      Sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.NODE_ENV ?? "production", tracesSampleRate: 0.1 });
      console.log("[Sentry] Initialized.");
    }
  } catch { /* Sentry is optional */ }

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

  // Database init — track readiness state for health checks
  try {
    const { setDbReady } = await import("./routes/health.js");
    try {
      const { initializeDatabase } = await import("./lib/init-db.js");
      await initializeDatabase();
      console.log("[Startup] Database initialized.");

      // Seed demo data only in non-production environments
      if (process.env.NODE_ENV !== "production") {
        const { seedSampleData } = await import("./lib/seed.js");
        await seedSampleData();
        const { seedComprehensiveData } = await import("./lib/seed-comprehensive.js");
        await seedComprehensiveData();
      } else {
        console.log("[Startup] Production mode — skipping worker/comprehensive seeders.");
      }

      // Test scenario workers — seeds realistic legal test data (idempotent, skips if >15 workers exist)
      try {
        const { seedTestScenarios } = await import("./lib/seed-test-scenarios.js");
        const { getDefaultTenantId: getTid } = await import("./lib/tenant.js");
        await seedTestScenarios(getTid());
      } catch (err) {
        console.error("[Startup] Test scenario seed failed:", err instanceof Error ? err.message : err);
      }

      // Module demo data (clients, jobs, etc.) seeds in ALL environments
      // if tables are empty — it's idempotent and non-destructive
      try {
        const { seedModuleDemoData } = await import("./lib/seed-modules.js");
        await seedModuleDemoData(true);
      } catch (err) {
        console.error("[Startup] Module seed failed:", err instanceof Error ? err.message : err);
      }

      setDbReady(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[Startup] Database init failed:", msg);
      setDbReady(false, msg);
    }
  } catch {
    console.error("[Startup] Could not import health module for readiness signal.");
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
    const { startWeeklyReport, startMonthlyInvoices, startWeeklyMoodPrompts, startWeeklyCompetitorScan, startWeeklySignalScan, startDailyRegulatoryScan } = await import("./lib/scheduler.js");
    startWeeklyReport();
    startMonthlyInvoices();
    startWeeklyMoodPrompts();
    startWeeklyCompetitorScan();
    startWeeklySignalScan();
    startDailyRegulatoryScan();

    // Report scheduler + notification scanner — checks every hour
    try {
      const { runScheduledReports } = await import("./routes/reports.js");
      const { scanAndCreateNotifications } = await import("./routes/legal-notifications.js");
      const { getDefaultTenantId } = await import("./lib/tenant.js");

      // Run notification scan once at startup
      scanAndCreateNotifications(getDefaultTenantId()).catch(() => {});

      setInterval(async () => {
        const tid = getDefaultTenantId();
        try {
          const r = await runScheduledReports(tid);
          if (r.sent > 0 || r.errors > 0) console.log(`[Scheduler] Reports: ${r.sent} sent, ${r.errors} errors`);
        } catch (e) { console.error("[Scheduler] Report run failed:", e instanceof Error ? e.message : e); }
        try {
          await scanAndCreateNotifications(tid);
        } catch (e) { console.error("[Scheduler] Notification scan failed:", e instanceof Error ? e.message : e); }
      }, 60 * 60 * 1000); // every hour
      console.log("[Scheduler] Report + notification scheduler active (hourly check).");
    } catch (e) { console.error("[Scheduler] Scheduler init failed:", e instanceof Error ? e.message : e); }

    console.log("[Startup] Schedulers started.");
  } catch (err) {
    console.error("[Startup] Scheduler init failed:", err instanceof Error ? err.message : err);
  }

  server.listen(port, "0.0.0.0", () => {
    console.log(`Server listening on 0.0.0.0:${port}`);
  });
})();
