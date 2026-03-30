import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { query, queryOne, execute } from "../lib/db.js";

const router = Router();

// ═══ TABLE SETUP ═════════════════════════════════════════════════════════════

async function ensureTables() {
  await execute(`
    CREATE TABLE IF NOT EXISTS shifts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      site_name TEXT NOT NULL,
      shift_date DATE NOT NULL,
      shift_slot TEXT NOT NULL CHECK (shift_slot IN ('morning', 'afternoon', 'night')),
      worker_ids JSONB DEFAULT '[]',
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

ensureTables().catch(err => console.error("[Shifts] Table creation error:", err.message));

// ═══ ENDPOINTS ═══════════════════════════════════════════════════════════════

// GET /api/shifts?week=2026-03-30 — list shifts for week (Mon–Sun containing that date)
router.get("/shifts", requireAuth, async (req, res) => {
  try {
    const { week } = req.query as Record<string, string>;
    if (!week) return res.status(400).json({ error: "week query parameter is required (YYYY-MM-DD)" });

    const rows = await query(
      `SELECT * FROM shifts
       WHERE shift_date >= date_trunc('week', $1::date)
         AND shift_date < date_trunc('week', $1::date) + INTERVAL '7 days'
       ORDER BY shift_date ASC, shift_slot ASC`,
      [week]
    );
    res.json({ shifts: rows, count: rows.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch shifts" });
  }
});

// POST /api/shifts — create shift
router.post("/shifts", requireAuth, async (req, res) => {
  try {
    const { siteName, shiftDate, shiftSlot, workerIds, notes } = req.body as {
      siteName?: string; shiftDate?: string; shiftSlot?: string;
      workerIds?: string[]; notes?: string;
    };
    if (!siteName || !shiftDate || !shiftSlot) {
      return res.status(400).json({ error: "siteName, shiftDate, and shiftSlot are required" });
    }
    if (!["morning", "afternoon", "night"].includes(shiftSlot)) {
      return res.status(400).json({ error: "shiftSlot must be 'morning', 'afternoon', or 'night'" });
    }

    const row = await queryOne(
      `INSERT INTO shifts (site_name, shift_date, shift_slot, worker_ids, notes)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [siteName, shiftDate, shiftSlot, JSON.stringify(workerIds ?? []), notes ?? null]
    );
    res.status(201).json({ shift: row });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to create shift" });
  }
});

// PATCH /api/shifts/:id — update shift (assign workers, change notes, etc.)
router.patch("/shifts/:id", requireAuth, async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const sets: string[] = [];
    const vals: unknown[] = [];
    let idx = 1;

    if (body.siteName !== undefined) { sets.push(`site_name = $${idx++}`); vals.push(body.siteName); }
    if (body.shiftDate !== undefined) { sets.push(`shift_date = $${idx++}`); vals.push(body.shiftDate); }
    if (body.shiftSlot !== undefined) {
      if (!["morning", "afternoon", "night"].includes(body.shiftSlot as string)) {
        return res.status(400).json({ error: "shiftSlot must be 'morning', 'afternoon', or 'night'" });
      }
      sets.push(`shift_slot = $${idx++}`); vals.push(body.shiftSlot);
    }
    if (body.workerIds !== undefined) { sets.push(`worker_ids = $${idx++}`); vals.push(JSON.stringify(body.workerIds)); }
    if (body.notes !== undefined) { sets.push(`notes = $${idx++}`); vals.push(body.notes); }

    if (sets.length === 0) return res.status(400).json({ error: "No fields to update" });

    vals.push(req.params.id);
    const row = await queryOne(
      `UPDATE shifts SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
      vals
    );
    if (!row) return res.status(404).json({ error: "Shift not found" });
    res.json({ shift: row });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to update shift" });
  }
});

// DELETE /api/shifts/:id
router.delete("/shifts/:id", requireAuth, async (req, res) => {
  try {
    const row = await queryOne(
      "DELETE FROM shifts WHERE id = $1 RETURNING id",
      [req.params.id]
    );
    if (!row) return res.status(404).json({ error: "Shift not found" });
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to delete shift" });
  }
});

export default router;
