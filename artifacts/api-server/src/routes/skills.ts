import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { query, queryOne, execute } from "../lib/db.js";

const router = Router();

// ═══ TABLE SETUP ═════════════════════════════════════════════════════════════

async function ensureTables() {
  await execute(`
    CREATE TABLE IF NOT EXISTS worker_skills (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      worker_id TEXT NOT NULL,
      category TEXT NOT NULL,
      rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
      assessed_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(worker_id, category)
    )
  `);
}

ensureTables().catch(err => console.error("[Skills] Table creation error:", err.message));

// ═══ ENDPOINTS ═══════════════════════════════════════════════════════════════

// GET /api/skills/matrix — all workers' skills for management view (must be before :workerId)
router.get("/skills/matrix", requireAuth, async (req, res) => {
  try {
    const rows = await query(
      `SELECT worker_id, category, rating, assessed_at
       FROM worker_skills ORDER BY worker_id ASC, category ASC`,
      []
    );

    // Group by worker_id
    const matrix: Record<string, Array<{ category: string; rating: number; assessed_at: string }>> = {};
    for (const row of rows as Array<{ worker_id: string; category: string; rating: number; assessed_at: string }>) {
      if (!matrix[row.worker_id]) matrix[row.worker_id] = [];
      matrix[row.worker_id].push({ category: row.category, rating: row.rating, assessed_at: row.assessed_at });
    }

    res.json({ matrix, workerCount: Object.keys(matrix).length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch skills matrix" });
  }
});

// GET /api/skills/:workerId — get worker's skills
router.get("/skills/:workerId", requireAuth, async (req, res) => {
  try {
    const rows = await query(
      "SELECT * FROM worker_skills WHERE worker_id = $1 ORDER BY category ASC",
      [req.params.workerId]
    );
    res.json({ skills: rows, workerId: req.params.workerId });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch skills" });
  }
});

// POST /api/skills — add/update skill { workerId, category, rating }
router.post("/skills", requireAuth, async (req, res) => {
  try {
    const { workerId, category, rating } = req.body as {
      workerId?: string; category?: string; rating?: number;
    };
    if (!workerId || !category || rating === undefined) {
      return res.status(400).json({ error: "workerId, category, and rating are required" });
    }
    if (typeof rating !== "number" || rating < 1 || rating > 5) {
      return res.status(400).json({ error: "rating must be an integer between 1 and 5" });
    }

    const row = await queryOne(
      `INSERT INTO worker_skills (worker_id, category, rating)
       VALUES ($1, $2, $3)
       ON CONFLICT (worker_id, category) DO UPDATE SET rating = $3, assessed_at = NOW()
       RETURNING *`,
      [workerId, category, rating]
    );
    res.status(201).json({ skill: row });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to save skill" });
  }
});

export default router;
