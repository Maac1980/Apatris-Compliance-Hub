import { Router, type IRouter } from "express";
import { pool } from "../lib/db.js";

const router: IRouter = Router();

// Startup state — set by index.ts after init completes
let dbReady = false;
let dbError: string | null = null;

export function setDbReady(ready: boolean, error?: string) {
  dbReady = ready;
  dbError = error ?? null;
}

// Liveness probe — always 200 if the process is running (Fly.io keeps it alive)
router.get("/healthz", (_req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

// Readiness probe — returns 503 if DB is not connected or init failed
router.get("/readyz", async (_req, res) => {
  if (!dbReady) {
    return res.status(503).json({ status: "not_ready", db: false, error: dbError ?? "Database not initialized" });
  }
  // Quick DB ping to verify the connection is alive
  try {
    const client = await pool.connect();
    try { await client.query("SELECT 1"); } finally { client.release(); }
    res.json({ status: "ready", db: true, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: "degraded", db: false, error: err instanceof Error ? err.message : "DB unreachable" });
  }
});

// POST /api/error-report — tenant-aware error reporting from frontend
router.post("/error-report", async (req, res) => {
  try {
    const { execute } = await import("../lib/db.js");
    const { errorType, route, message, userAgent } = req.body as Record<string, string>;
    const tenantId = (req as any).tenantId ?? null;
    const userEmail = (req as any).user?.email ?? null;
    await execute(
      "INSERT INTO error_reports (tenant_id, user_email, error_type, route, message, user_agent) VALUES ($1,$2,$3,$4,$5,$6)",
      [tenantId, userEmail, errorType ?? "unknown", route ?? "", message ?? "", userAgent ?? ""]
    );
    res.json({ reported: true });
  } catch {
    res.json({ reported: false });
  }
});

// GET /api/v1/system/status — system status report
router.get("/v1/system/status", async (_req, res) => {
  try {
    const { query, queryOne } = await import("../lib/db.js");
    const tableCount = await queryOne<any>("SELECT COUNT(*)::int AS c FROM information_schema.tables WHERE table_schema = 'public'");
    const workerCount = await queryOne<any>("SELECT COUNT(*)::int AS c FROM workers");
    const caseCount = await queryOne<any>("SELECT COUNT(*)::int AS c FROM legal_cases");
    const kbCount = await queryOne<any>("SELECT COUNT(*)::int AS c FROM legal_knowledge");
    const nodeCount = await queryOne<any>("SELECT COUNT(*)::int AS c FROM kg_nodes");
    const edgeCount = await queryOne<any>("SELECT COUNT(*)::int AS c FROM kg_edges");
    const docCount = await queryOne<any>("SELECT COUNT(*)::int AS c FROM case_generated_docs");
    const notebookCount = await queryOne<any>("SELECT COUNT(*)::int AS c FROM case_notebook_entries");

    res.json({
      status: "operational",
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      database: {
        tables: tableCount?.c ?? 0,
        workers: workerCount?.c ?? 0,
        legalCases: caseCount?.c ?? 0,
        kbArticles: kbCount?.c ?? 0,
        graphNodes: nodeCount?.c ?? 0,
        graphEdges: edgeCount?.c ?? 0,
        generatedDocs: docCount?.c ?? 0,
        notebookEntries: notebookCount?.c ?? 0,
      },
      build: {
        nodeVersion: process.version,
        env: process.env.NODE_ENV ?? "development",
      },
    });
  } catch (err) {
    res.status(500).json({ status: "error", error: err instanceof Error ? err.message : "Failed" });
  }
});

export default router;
