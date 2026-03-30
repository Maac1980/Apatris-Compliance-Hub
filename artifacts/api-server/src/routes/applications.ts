import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { query, queryOne, execute } from "../lib/db.js";

const router = Router();

// Ensure job_applications table exists
execute(`
  CREATE TABLE IF NOT EXISTS job_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID,
    worker_id TEXT,
    worker_name TEXT,
    worker_email TEXT,
    stage TEXT DEFAULT 'New',
    match_score REAL DEFAULT 0,
    notes TEXT,
    applied_at TIMESTAMPTZ DEFAULT NOW()
  );
`).catch((err) => console.error("[applications] Table creation error:", err));

// GET /applications — list all, optional ?stage= filter
router.get("/applications", requireAuth, async (req, res) => {
  try {
    const { stage } = req.query as Record<string, string>;
    let sql = `SELECT ja.*, jp.title AS job_title
               FROM job_applications ja
               LEFT JOIN job_postings jp ON jp.id = ja.job_id`;
    const params: unknown[] = [];
    if (stage) {
      sql += ` WHERE ja.stage = $1`;
      params.push(stage);
    }
    sql += ` ORDER BY ja.applied_at DESC`;
    const rows = await query(sql, params);
    res.json({ applications: rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// PATCH /applications/:id/stage — update stage
router.patch("/applications/:id/stage", requireAuth, async (req, res) => {
  try {
    const { stage } = req.body;
    if (!stage) {
      res.status(400).json({ error: "Stage is required" });
      return;
    }
    const row = await queryOne(
      `UPDATE job_applications SET stage = $1 WHERE id = $2 RETURNING *`,
      [stage, req.params.id]
    );
    if (!row) { res.status(404).json({ error: "Application not found" }); return; }
    res.json(row);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

export default router;
