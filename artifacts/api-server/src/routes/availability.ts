import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { query, queryOne, execute } from "../lib/db.js";

const router = Router();

// ═══ TABLE SETUP ═════════════════════════════════════════════════════════════

async function ensureTables() {
  await execute(`
    CREATE TABLE IF NOT EXISTS worker_availability (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      worker_id TEXT NOT NULL,
      available_date DATE NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(worker_id, available_date)
    )
  `);
}

ensureTables().catch(err => console.error("[Availability] Table creation error:", err.message));

// ═══ ENDPOINTS ═══════════════════════════════════════════════════════════════

// GET /api/availability?month=2026-03&workerId=xxx — list available dates
router.get("/availability", requireAuth, async (req, res) => {
  try {
    const { month, workerId } = req.query as Record<string, string>;
    let sql = "SELECT * FROM worker_availability WHERE 1=1";
    const params: unknown[] = [];

    if (workerId) {
      params.push(workerId);
      sql += ` AND worker_id = $${params.length}`;
    }
    if (month) {
      // month format: "2026-03" — match all dates in that month
      params.push(month + "-01");
      params.push(month + "-01");
      sql += ` AND available_date >= $${params.length - 1}::date AND available_date < ($${params.length}::date + INTERVAL '1 month')`;
    }

    sql += " ORDER BY available_date ASC";
    const rows = await query(sql, params);
    res.json({ availability: rows, count: rows.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch availability" });
  }
});

// POST /api/availability — set available dates { workerId, dates: string[] }
router.post("/availability", requireAuth, async (req, res) => {
  try {
    const { workerId, dates } = req.body as { workerId?: string; dates?: string[] };
    if (!workerId || !dates || !Array.isArray(dates) || dates.length === 0) {
      return res.status(400).json({ error: "workerId and dates (non-empty array) are required" });
    }

    const inserted: unknown[] = [];
    for (const date of dates) {
      const row = await queryOne(
        `INSERT INTO worker_availability (worker_id, available_date)
         VALUES ($1, $2)
         ON CONFLICT (worker_id, available_date) DO NOTHING
         RETURNING *`,
        [workerId, date]
      );
      if (row) inserted.push(row);
    }

    res.status(201).json({ added: inserted, count: inserted.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to set availability" });
  }
});

// DELETE /api/availability — remove dates { workerId, dates: string[] }
router.delete("/availability", requireAuth, async (req, res) => {
  try {
    const { workerId, dates } = req.body as { workerId?: string; dates?: string[] };
    if (!workerId || !dates || !Array.isArray(dates) || dates.length === 0) {
      return res.status(400).json({ error: "workerId and dates (non-empty array) are required" });
    }

    // Build parameterized IN clause
    const placeholders = dates.map((_, i) => `$${i + 2}`).join(", ");
    await execute(
      `DELETE FROM worker_availability WHERE worker_id = $1 AND available_date IN (${placeholders})`,
      [workerId, ...dates]
    );

    res.json({ removed: true, workerId, dates });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to remove availability" });
  }
});

export default router;
