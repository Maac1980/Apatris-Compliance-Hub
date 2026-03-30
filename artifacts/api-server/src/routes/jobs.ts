import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { query, queryOne, execute } from "../lib/db.js";

const router = Router();

// Ensure job_postings table exists
execute(`
  CREATE TABLE IF NOT EXISTS job_postings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    requirements TEXT,
    location TEXT,
    salary_min NUMERIC(10,2),
    salary_max NUMERIC(10,2),
    contract_type TEXT,
    is_published BOOLEAN DEFAULT false,
    closing_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
`).catch((err) => console.error("[jobs] Table creation error:", err));

// GET /jobs — public, only published jobs
router.get("/jobs", async (_req, res) => {
  try {
    const rows = await query(
      `SELECT * FROM job_postings
       WHERE is_published = true AND (closing_date IS NULL OR closing_date >= CURRENT_DATE)
       ORDER BY created_at DESC`
    );
    res.json({ jobs: rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// GET /jobs/all — requireAuth, all jobs with application counts
router.get("/jobs/all", requireAuth, async (_req, res) => {
  try {
    const rows = await query(
      `SELECT jp.*,
              COALESCE(ac.app_count, 0) AS application_count
       FROM job_postings jp
       LEFT JOIN (
         SELECT job_id, COUNT(*) AS app_count FROM job_applications GROUP BY job_id
       ) ac ON ac.job_id = jp.id
       ORDER BY jp.created_at DESC`
    );
    res.json({ jobs: rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// POST /jobs — create
router.post("/jobs", requireAuth, async (req, res) => {
  try {
    const { title, description, requirements, location, salary_min, salary_max, contract_type, is_published, closing_date } = req.body;
    if (!title?.trim()) {
      res.status(400).json({ error: "Title is required" });
      return;
    }
    const row = await queryOne(
      `INSERT INTO job_postings (title, description, requirements, location, salary_min, salary_max, contract_type, is_published, closing_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [title, description ?? null, requirements ?? null, location ?? null, salary_min ?? null, salary_max ?? null, contract_type ?? null, is_published ?? false, closing_date ?? null]
    );
    res.status(201).json(row);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// PATCH /jobs/:id — update
router.patch("/jobs/:id", requireAuth, async (req, res) => {
  try {
    const allowedFields = ["title", "description", "requirements", "location", "salary_min", "salary_max", "contract_type", "is_published", "closing_date"];
    const sets: string[] = [];
    const vals: unknown[] = [];
    let idx = 1;
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        sets.push(`${field} = $${idx++}`);
        vals.push(req.body[field]);
      }
    }
    if (sets.length === 0) {
      res.status(400).json({ error: "No valid fields to update" });
      return;
    }
    vals.push(req.params.id);
    const row = await queryOne(
      `UPDATE job_postings SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
      vals
    );
    if (!row) { res.status(404).json({ error: "Job not found" }); return; }
    res.json(row);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// DELETE /jobs/:id — delete
router.delete("/jobs/:id", requireAuth, async (req, res) => {
  try {
    const row = await queryOne("DELETE FROM job_postings WHERE id = $1 RETURNING id", [req.params.id]);
    if (!row) { res.status(404).json({ error: "Job not found" }); return; }
    res.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

export default router;
