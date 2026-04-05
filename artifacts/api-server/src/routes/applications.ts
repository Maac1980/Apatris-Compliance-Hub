import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { query, queryOne, execute } from "../lib/db.js";

const router = Router();

// Ensure job_applications table exists (must complete before requests)
// Table job_applications is created by init-db.ts at startup

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

// GET /applications/:id — single application with job details
router.get("/applications/:id", requireAuth, async (req, res) => {
  try {
    const row = await queryOne(
      `SELECT ja.*, jp.title AS job_title, jp.location AS job_location, jp.description AS job_description
       FROM job_applications ja
       LEFT JOIN job_postings jp ON jp.id = ja.job_id
       WHERE ja.id = $1`,
      [req.params.id]
    );
    if (!row) { res.status(404).json({ error: "Application not found" }); return; }
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// PATCH /applications/:id/notes — update notes
router.patch("/applications/:id/notes", requireAuth, async (req, res) => {
  try {
    const { notes } = req.body;
    if (notes === undefined) { res.status(400).json({ error: "notes field required" }); return; }
    const row = await queryOne(
      "UPDATE job_applications SET notes = $1 WHERE id = $2 RETURNING *",
      [notes, req.params.id]
    );
    if (!row) { res.status(404).json({ error: "Application not found" }); return; }
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

export default router;
