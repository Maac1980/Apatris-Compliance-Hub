import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { query, queryOne, execute } from "../lib/db.js";

const router = Router();

// GET /api/guarantees
router.get("/guarantees", requireAuth, async (req, res) => {
  try {
    const rows = await query(
      `SELECT g.*, (SELECT COUNT(*) FROM compliance_incidents ci WHERE ci.guarantee_id = g.id) AS incident_count,
        (SELECT COALESCE(SUM(ci.fine_amount), 0) FROM compliance_incidents ci WHERE ci.guarantee_id = g.id AND ci.covered = TRUE) AS total_covered
       FROM compliance_guarantees g WHERE g.tenant_id = $1 ORDER BY g.guarantee_end DESC`, [req.tenantId!]);
    res.json({ guarantees: rows });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// POST /api/guarantees
router.post("/guarantees", requireAuth, requireRole("Admin", "Executive"), async (req, res) => {
  try {
    const b = req.body as Record<string, any>;
    if (!b.companyId || !b.companyName) return res.status(400).json({ error: "companyId and companyName required" });
    const row = await queryOne(
      `INSERT INTO compliance_guarantees (tenant_id, company_id, company_name, guarantee_start, guarantee_end, max_coverage_eur, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.tenantId!, b.companyId, b.companyName, b.guaranteeStart || new Date().toISOString().slice(0, 10),
       b.guaranteeEnd || new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10), b.maxCoverageEur || 50000, b.notes ?? null]);
    res.status(201).json({ guarantee: row });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// GET /api/guarantees/:id
router.get("/guarantees/:id", requireAuth, async (req, res) => {
  try {
    const g = await queryOne("SELECT * FROM compliance_guarantees WHERE id = $1 AND tenant_id = $2", [req.params.id, req.tenantId!]);
    if (!g) return res.status(404).json({ error: "Not found" });
    const incidents = await query("SELECT * FROM compliance_incidents WHERE guarantee_id = $1 ORDER BY created_at DESC", [req.params.id]);
    res.json({ guarantee: g, incidents });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// PATCH /api/guarantees/:id
router.patch("/guarantees/:id", requireAuth, requireRole("Admin", "Executive"), async (req, res) => {
  try {
    const b = req.body as Record<string, unknown>;
    const fm: Record<string, string> = { maxCoverageEur: "max_coverage_eur", guaranteeEnd: "guarantee_end", status: "status", notes: "notes" };
    const sets: string[] = []; const vals: unknown[] = []; let idx = 1;
    for (const [k, c] of Object.entries(fm)) { if (b[k] !== undefined) { sets.push(`${c} = $${idx++}`); vals.push(b[k]); } }
    if (!sets.length) return res.status(400).json({ error: "No fields" });
    vals.push(req.params.id, req.tenantId!);
    const row = await queryOne(`UPDATE compliance_guarantees SET ${sets.join(", ")} WHERE id = $${idx} AND tenant_id = $${idx + 1} RETURNING *`, vals);
    res.json({ guarantee: row });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// POST /api/guarantees/:id/incident
router.post("/guarantees/:id/incident", requireAuth, requireRole("Admin", "Executive"), async (req, res) => {
  try {
    const b = req.body as Record<string, any>;
    if (!b.incidentType) return res.status(400).json({ error: "incidentType required" });
    const inc = await queryOne(
      `INSERT INTO compliance_incidents (tenant_id, guarantee_id, worker_id, worker_name, incident_type, fine_amount, covered, resolution)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.tenantId!, req.params.id, b.workerId ?? null, b.workerName ?? null, b.incidentType, b.fineAmount || 0, b.covered !== false, b.resolution ?? null]);

    // Update guarantee counters
    await execute(
      `UPDATE compliance_guarantees SET incidents = incidents + 1, fines_covered = fines_covered + $1 WHERE id = $2`,
      [b.covered !== false ? (b.fineAmount || 0) : 0, req.params.id]);

    res.status(201).json({ incident: inc });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// GET /api/guarantees/summary
router.get("/guarantees/summary", requireAuth, async (req, res) => {
  try {
    const stats = await queryOne<Record<string, any>>(
      `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'active') AS active,
        COALESCE(SUM(max_coverage_eur), 0) AS total_coverage, COALESCE(SUM(fines_covered), 0) AS total_fines_covered,
        COALESCE(SUM(incidents), 0) AS total_incidents,
        COUNT(*) FILTER (WHERE incidents = 0 AND status = 'active') AS zero_incidents
       FROM compliance_guarantees WHERE tenant_id = $1`, [req.tenantId!]);
    res.json({
      totalGuarantees: Number(stats?.total ?? 0), activeGuarantees: Number(stats?.active ?? 0),
      totalCoverage: Number(stats?.total_coverage ?? 0), totalFinesCovered: Number(stats?.total_fines_covered ?? 0),
      totalIncidents: Number(stats?.total_incidents ?? 0), zeroIncidentClients: Number(stats?.zero_incidents ?? 0),
    });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

export default router;
