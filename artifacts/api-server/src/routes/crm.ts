import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { query, queryOne, execute } from "../lib/db.js";

const router = Router();

const DEAL_STAGES = ["Lead", "Contacted", "Proposal Sent", "Negotiation", "Active", "Lost"];

// ═══════════════════════════════════════════════════════════════════════════
// COMPANIES
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/crm/companies
router.get("/crm/companies", requireAuth, async (req, res) => {
  try {
    const rows = await query(
      `SELECT c.*,
              (SELECT COUNT(*) FROM crm_deals d WHERE d.company_id = c.id AND d.stage NOT IN ('Lost')) AS active_deals
       FROM crm_companies c
       WHERE c.tenant_id = $1
       ORDER BY c.company_name ASC`,
      [req.tenantId!]
    );
    res.json({ companies: rows, count: rows.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch companies" });
  }
});

// POST /api/crm/companies
router.post("/crm/companies", requireAuth, requireRole("Admin", "Executive", "LegalHead"), async (req, res) => {
  try {
    const { companyName, nip, contactName, contactEmail, contactPhone, country, notes } = req.body as Record<string, string>;
    if (!companyName) return res.status(400).json({ error: "companyName is required" });
    const row = await queryOne(
      `INSERT INTO crm_companies (tenant_id, company_name, nip, contact_name, contact_email, contact_phone, country, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.tenantId!, companyName, nip ?? null, contactName ?? null, contactEmail ?? null, contactPhone ?? null, country || "PL", notes ?? null]
    );
    res.status(201).json({ company: row });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to create company" });
  }
});

// GET /api/crm/companies/:id
router.get("/crm/companies/:id", requireAuth, async (req, res) => {
  try {
    const company = await queryOne(
      "SELECT * FROM crm_companies WHERE id = $1 AND tenant_id = $2",
      [req.params.id, req.tenantId!]
    );
    if (!company) return res.status(404).json({ error: "Company not found" });
    const deals = await query(
      "SELECT * FROM crm_deals WHERE company_id = $1 AND tenant_id = $2 ORDER BY created_at DESC",
      [req.params.id, req.tenantId!]
    );
    res.json({ company, deals });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch company" });
  }
});

// PATCH /api/crm/companies/:id
router.patch("/crm/companies/:id", requireAuth, requireRole("Admin", "Executive", "LegalHead"), async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const fieldMap: Record<string, string> = {
      companyName: "company_name", nip: "nip", contactName: "contact_name",
      contactEmail: "contact_email", contactPhone: "contact_phone",
      country: "country", status: "status", notes: "notes",
    };
    const sets: string[] = [];
    const vals: unknown[] = [];
    let idx = 1;
    for (const [key, col] of Object.entries(fieldMap)) {
      if (body[key] !== undefined) { sets.push(`${col} = $${idx++}`); vals.push(body[key]); }
    }
    if (sets.length === 0) return res.status(400).json({ error: "No fields to update" });
    sets.push("updated_at = NOW()");
    vals.push(req.params.id, req.tenantId!);
    const row = await queryOne(
      `UPDATE crm_companies SET ${sets.join(", ")} WHERE id = $${idx} AND tenant_id = $${idx + 1} RETURNING *`,
      vals
    );
    if (!row) return res.status(404).json({ error: "Company not found" });
    res.json({ company: row });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Update failed" });
  }
});

// DELETE /api/crm/companies/:id
router.delete("/crm/companies/:id", requireAuth, requireRole("Admin", "Executive"), async (req, res) => {
  try {
    await execute(
      "DELETE FROM crm_companies WHERE id = $1 AND tenant_id = $2",
      [req.params.id, req.tenantId!]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Delete failed" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// DEALS
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/crm/deals — all deals with company name, optionally filter by stage
router.get("/crm/deals", requireAuth, async (req, res) => {
  try {
    const { stage, companyId } = req.query as Record<string, string>;
    let sql = `SELECT d.*, c.company_name FROM crm_deals d LEFT JOIN crm_companies c ON c.id = d.company_id WHERE d.tenant_id = $1`;
    const params: unknown[] = [req.tenantId!];
    if (stage) { params.push(stage); sql += ` AND d.stage = $${params.length}`; }
    if (companyId) { params.push(companyId); sql += ` AND d.company_id = $${params.length}`; }
    sql += " ORDER BY d.created_at DESC";
    const rows = await query(sql, params);
    res.json({ deals: rows, count: rows.length, stages: DEAL_STAGES });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch deals" });
  }
});

// GET /api/crm/deals/pipeline — grouped by stage with totals
router.get("/crm/deals/pipeline", requireAuth, async (req, res) => {
  try {
    const rows = await query<Record<string, any>>(
      `SELECT d.stage,
              COUNT(*) AS deal_count,
              COALESCE(SUM(d.value_eur), 0) AS total_value,
              COALESCE(SUM(d.workers_needed), 0) AS total_workers
       FROM crm_deals d
       WHERE d.tenant_id = $1
       GROUP BY d.stage`,
      [req.tenantId!]
    );
    const pipeline = DEAL_STAGES.map(stage => {
      const row = rows.find(r => r.stage === stage);
      return {
        stage,
        deal_count: Number(row?.deal_count ?? 0),
        total_value: Number(row?.total_value ?? 0),
        total_workers: Number(row?.total_workers ?? 0),
      };
    });
    res.json({ pipeline, stages: DEAL_STAGES });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch pipeline" });
  }
});

// POST /api/crm/deals
router.post("/crm/deals", requireAuth, requireRole("Admin", "Executive", "LegalHead"), async (req, res) => {
  try {
    const { companyId, dealName, stage, valueEur, workersNeeded, roleType, startDate, notes } = req.body as Record<string, any>;
    if (!companyId || !dealName) return res.status(400).json({ error: "companyId and dealName are required" });
    if (stage && !DEAL_STAGES.includes(stage)) return res.status(400).json({ error: `Invalid stage. Must be: ${DEAL_STAGES.join(", ")}` });
    const row = await queryOne(
      `INSERT INTO crm_deals (tenant_id, company_id, deal_name, stage, value_eur, workers_needed, role_type, start_date, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.tenantId!, companyId, dealName, stage || "Lead", valueEur || 0, workersNeeded || 0, roleType ?? null, startDate ?? null, notes ?? null]
    );
    res.status(201).json({ deal: row });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to create deal" });
  }
});

// GET /api/crm/deals/:id
router.get("/crm/deals/:id", requireAuth, async (req, res) => {
  try {
    const row = await queryOne(
      `SELECT d.*, c.company_name FROM crm_deals d LEFT JOIN crm_companies c ON c.id = d.company_id WHERE d.id = $1 AND d.tenant_id = $2`,
      [req.params.id, req.tenantId!]
    );
    if (!row) return res.status(404).json({ error: "Deal not found" });
    res.json({ deal: row });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch deal" });
  }
});

// PATCH /api/crm/deals/:id
router.patch("/crm/deals/:id", requireAuth, requireRole("Admin", "Executive", "LegalHead"), async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    if (body.stage && !DEAL_STAGES.includes(body.stage as string)) {
      return res.status(400).json({ error: `Invalid stage. Must be: ${DEAL_STAGES.join(", ")}` });
    }
    const fieldMap: Record<string, string> = {
      dealName: "deal_name", stage: "stage", valueEur: "value_eur",
      workersNeeded: "workers_needed", roleType: "role_type",
      startDate: "start_date", notes: "notes", companyId: "company_id",
    };
    const sets: string[] = [];
    const vals: unknown[] = [];
    let idx = 1;
    for (const [key, col] of Object.entries(fieldMap)) {
      if (body[key] !== undefined) { sets.push(`${col} = $${idx++}`); vals.push(body[key]); }
    }
    if (sets.length === 0) return res.status(400).json({ error: "No fields to update" });
    sets.push("updated_at = NOW()");
    vals.push(req.params.id, req.tenantId!);
    const row = await queryOne(
      `UPDATE crm_deals SET ${sets.join(", ")} WHERE id = $${idx} AND tenant_id = $${idx + 1} RETURNING *`,
      vals
    );
    if (!row) return res.status(404).json({ error: "Deal not found" });
    res.json({ deal: row });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Update failed" });
  }
});

export default router;
