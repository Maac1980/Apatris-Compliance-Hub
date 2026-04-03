import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { query, queryOne, execute } from "../lib/db.js";
import { sendWhatsAppAlert } from "../lib/whatsapp.js";
import { getDefaultTenantId } from "../lib/tenant.js";

const router = Router();

// GET /api/bench — all bench entries with days on bench
router.get("/bench", requireAuth, async (req, res) => {
  try {
    const rows = await query<Record<string, any>>(
      `SELECT b.*, w.phone AS worker_phone, w.specialization,
              GREATEST(0, CURRENT_DATE - b.available_from::date) AS days_on_bench
       FROM bench_entries b
       LEFT JOIN workers w ON w.id = b.worker_id
       WHERE b.tenant_id = $1
       ORDER BY b.available_from ASC`,
      [req.tenantId!]
    );
    res.json({ entries: rows, count: rows.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// POST /api/bench — add worker to bench
router.post("/bench", requireAuth, requireRole("Admin", "Executive", "LegalHead", "TechOps"), async (req, res) => {
  try {
    const b = req.body as Record<string, any>;
    if (!b.workerId || !b.workerName) return res.status(400).json({ error: "workerId and workerName required" });

    // Check if already on bench
    const existing = await queryOne(
      "SELECT id FROM bench_entries WHERE worker_id = $1 AND tenant_id = $2 AND status = 'available'",
      [b.workerId, req.tenantId!]
    );
    if (existing) return res.status(409).json({ error: "Worker already on bench" });

    const row = await queryOne(
      `INSERT INTO bench_entries (tenant_id, worker_id, worker_name, available_from, available_until, last_site, last_role, skills_summary, notes, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [req.tenantId!, b.workerId, b.workerName, b.availableFrom || new Date().toISOString().slice(0, 10),
       b.availableUntil ?? null, b.lastSite ?? null, b.lastRole ?? null,
       b.skillsSummary ?? null, b.notes ?? null, b.status || "available"]
    );
    res.status(201).json({ entry: row });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// PATCH /api/bench/:id — update availability
router.patch("/bench/:id", requireAuth, requireRole("Admin", "Executive", "LegalHead", "TechOps"), async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const fieldMap: Record<string, string> = {
      status: "status", availableFrom: "available_from", availableUntil: "available_until",
      lastSite: "last_site", lastRole: "last_role", skillsSummary: "skills_summary", notes: "notes",
    };
    const sets: string[] = [];
    const vals: unknown[] = [];
    let idx = 1;
    for (const [key, col] of Object.entries(fieldMap)) {
      if (body[key] !== undefined) { sets.push(`${col} = $${idx++}`); vals.push(body[key]); }
    }
    if (sets.length === 0) return res.status(400).json({ error: "No fields" });
    sets.push("updated_at = NOW()");
    vals.push(req.params.id, req.tenantId!);
    const row = await queryOne(
      `UPDATE bench_entries SET ${sets.join(", ")} WHERE id = $${idx} AND tenant_id = $${idx + 1} RETURNING *`,
      vals
    );
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json({ entry: row });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// DELETE /api/bench/:id — remove from bench (assigned)
router.delete("/bench/:id", requireAuth, requireRole("Admin", "Executive", "LegalHead", "TechOps"), async (req, res) => {
  try {
    await execute("DELETE FROM bench_entries WHERE id = $1 AND tenant_id = $2", [req.params.id, req.tenantId!]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/bench/summary — stats
router.get("/bench/summary", requireAuth, async (req, res) => {
  try {
    const stats = await queryOne<Record<string, any>>(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'available') AS available,
         COUNT(*) FILTER (WHERE status = 'partially_available') AS partially_available,
         COUNT(*) FILTER (WHERE status = 'unavailable') AS unavailable,
         COUNT(*) AS total,
         COALESCE(ROUND(AVG(GREATEST(0, CURRENT_DATE - available_from::date))::numeric, 1), 0) AS avg_days,
         COALESCE(MAX(GREATEST(0, CURRENT_DATE - available_from::date)), 0) AS max_days,
         COUNT(*) FILTER (WHERE CURRENT_DATE - available_from::date > 7) AS over_7_days
       FROM bench_entries WHERE tenant_id = $1 AND status != 'unavailable'`,
      [req.tenantId!]
    );
    res.json({
      available: Number(stats?.available ?? 0),
      partiallyAvailable: Number(stats?.partially_available ?? 0),
      unavailable: Number(stats?.unavailable ?? 0),
      total: Number(stats?.total ?? 0),
      avgDays: Number(stats?.avg_days ?? 0),
      maxDays: Number(stats?.max_days ?? 0),
      over7Days: Number(stats?.over_7_days ?? 0),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// Bench alert scan — alert coordinators for workers on bench 7+ days
export async function runBenchAlertScan(): Promise<void> {
  try {
    const tenantId = getDefaultTenantId();
    if (!tenantId) return;
    const longBench = await query<Record<string, any>>(
      `SELECT b.*, w.phone AS worker_phone
       FROM bench_entries b LEFT JOIN workers w ON w.id = b.worker_id
       WHERE b.tenant_id = $1 AND b.status = 'available' AND CURRENT_DATE - b.available_from::date = 7`,
      [tenantId]
    );
    for (const entry of longBench) {
      const coords = await query<Record<string, any>>(
        "SELECT phone, name FROM site_coordinators WHERE tenant_id = $1 LIMIT 3", [tenantId]
      );
      for (const c of coords) {
        if (c.phone) {
          await sendWhatsAppAlert({
            to: c.phone, workerName: c.name, workerI: entry.worker_id,
            permitType: `BENCH ALERT: ${entry.worker_name} has been on bench for 7 days. Last role: ${entry.last_role || "unknown"}. Please assign.`,
            daysRemaining: 0, tenantId,
          });
        }
      }
    }
    if (longBench.length > 0) console.log(`[Bench] Alerted coordinators for ${longBench.length} workers on bench 7+ days.`);
  } catch (err) {
    console.error("[Bench] Alert scan failed:", err);
  }
}

export default router;
