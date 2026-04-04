import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { query, queryOne, execute } from "../lib/db.js";

const router = Router();

const PLANS: Record<string, { fee: number; limit: number }> = {
  starter: { fee: 199, limit: 25 }, professional: { fee: 499, limit: 100 }, enterprise: { fee: 999, limit: 9999 },
};

// GET /api/whitelabel/agencies
router.get("/whitelabel/agencies", requireAuth, requireRole("Admin", "Executive"), async (req, res) => {
  try {
    const rows = await query(
      `SELECT a.*, (SELECT COUNT(*) FROM agency_workers aw WHERE aw.agency_id = a.id) AS worker_count
       FROM white_label_agencies a WHERE a.tenant_id = $1 ORDER BY a.agency_name`, [req.tenantId!]);
    res.json({ agencies: rows });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// POST /api/whitelabel/agencies
router.post("/whitelabel/agencies", requireAuth, requireRole("Admin", "Executive"), async (req, res) => {
  try {
    const b = req.body as Record<string, any>;
    if (!b.agencyName) return res.status(400).json({ error: "agencyName required" });
    const plan = PLANS[b.plan || "starter"] || PLANS.starter;
    const row = await queryOne(
      `INSERT INTO white_label_agencies (tenant_id, agency_name, domain, logo_url, primary_color, secondary_color, contact_email, plan, worker_limit, monthly_fee)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [req.tenantId!, b.agencyName, b.domain ?? null, b.logoUrl ?? null, b.primaryColor || "#C41E18", b.secondaryColor || "#0f172a", b.contactEmail ?? null, b.plan || "starter", plan.limit, plan.fee]);
    res.status(201).json({ agency: row });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// GET /api/whitelabel/agencies/:id
router.get("/whitelabel/agencies/:id", requireAuth, async (req, res) => {
  try {
    const agency = await queryOne("SELECT * FROM white_label_agencies WHERE id = $1 AND tenant_id = $2", [req.params.id, req.tenantId!]);
    if (!agency) return res.status(404).json({ error: "Not found" });
    res.json({ agency });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// PATCH /api/whitelabel/agencies/:id
router.patch("/whitelabel/agencies/:id", requireAuth, requireRole("Admin", "Executive"), async (req, res) => {
  try {
    const b = req.body as Record<string, unknown>;
    const fm: Record<string, string> = { agencyName: "agency_name", domain: "domain", logoUrl: "logo_url", primaryColor: "primary_color", secondaryColor: "secondary_color", contactEmail: "contact_email", plan: "plan", status: "status" };
    const sets: string[] = []; const vals: unknown[] = []; let idx = 1;
    for (const [k, c] of Object.entries(fm)) { if (b[k] !== undefined) { sets.push(`${c} = $${idx++}`); vals.push(b[k]); } }
    // Update plan limits/fees
    if (b.plan && PLANS[b.plan as string]) {
      sets.push(`worker_limit = $${idx++}`); vals.push(PLANS[b.plan as string].limit);
      sets.push(`monthly_fee = $${idx++}`); vals.push(PLANS[b.plan as string].fee);
    }
    if (!sets.length) return res.status(400).json({ error: "No fields" });
    vals.push(req.params.id, req.tenantId!);
    const row = await queryOne(`UPDATE white_label_agencies SET ${sets.join(", ")} WHERE id = $${idx} AND tenant_id = $${idx + 1} RETURNING *`, vals);
    res.json({ agency: row });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// GET /api/whitelabel/agencies/:id/workers
router.get("/whitelabel/agencies/:id/workers", requireAuth, async (req, res) => {
  try {
    const rows = await query(
      `SELECT w.id, w.full_name, w.specialization, w.assigned_site FROM agency_workers aw
       JOIN workers w ON w.id = aw.worker_id WHERE aw.agency_id = $1`, [req.params.id]);
    res.json({ workers: rows });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// GET /api/whitelabel/agencies/:id/stats
router.get("/whitelabel/agencies/:id/stats", requireAuth, async (req, res) => {
  try {
    const workers = await queryOne<Record<string, any>>("SELECT COUNT(*) AS count FROM agency_workers WHERE agency_id = $1", [req.params.id]);
    const agency = await queryOne<Record<string, any>>("SELECT plan, monthly_fee, worker_limit FROM white_label_agencies WHERE id = $1", [req.params.id]);
    res.json({
      workerCount: Number(workers?.count ?? 0), plan: agency?.plan, monthlyFee: Number(agency?.monthly_fee ?? 0),
      workerLimit: Number(agency?.worker_limit ?? 0), utilisation: Number(agency?.worker_limit) > 0 ? Math.round((Number(workers?.count ?? 0) / Number(agency?.worker_limit)) * 100) : 0,
    });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// GET /api/whitelabel/config — returns branding for current domain
router.get("/whitelabel/config", async (req, res) => {
  try {
    const host = req.headers.host || "";
    const agency = await queryOne<Record<string, any>>("SELECT * FROM white_label_agencies WHERE domain = $1 AND status = 'active'", [host]);
    if (!agency) return res.json({ branded: false, name: "Apatris", primaryColor: "#C41E18", secondaryColor: "#0f172a" });
    res.json({ branded: true, name: agency.agency_name, primaryColor: agency.primary_color, secondaryColor: agency.secondary_color, logoUrl: agency.logo_url });
  } catch (err) { res.json({ branded: false, name: "Apatris", primaryColor: "#C41E18" }); }
});

export default router;
