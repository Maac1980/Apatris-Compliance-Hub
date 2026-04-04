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

export default router;
