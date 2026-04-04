import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { query, queryOne, execute } from "../lib/db.js";
import { sendWhatsAppAlert } from "../lib/whatsapp.js";
import { getDefaultTenantId } from "../lib/tenant.js";

const router = Router();

const POLICY_TYPES = ["Group Health", "Work Accident", "Liability", "Travel", "Equipment"];

// ═══════ POLICIES ═══════

router.get("/insurance/policies", requireAuth, async (req, res) => {
  try {
    const rows = await query(
      `SELECT p.*, (SELECT COUNT(*) FROM insurance_claims c WHERE c.policy_id = p.id AND c.status = 'open') AS open_claims
       FROM insurance_policies p WHERE p.tenant_id = $1 ORDER BY p.end_date ASC NULLS LAST`, [req.tenantId!]);
    res.json({ policies: rows });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

router.post("/insurance/policies", requireAuth, requireRole("Admin", "Executive"), async (req, res) => {
  try {
    const b = req.body as Record<string, any>;
    if (!b.policyName || !b.policyType) return res.status(400).json({ error: "policyName and policyType required" });
    const row = await queryOne(
      `INSERT INTO insurance_policies (tenant_id, policy_name, provider, policy_type, coverage_amount, premium_monthly, start_date, end_date, workers_covered, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [req.tenantId!, b.policyName, b.provider ?? null, b.policyType, b.coverageAmount || 0, b.premiumMonthly || 0, b.startDate ?? null, b.endDate ?? null, b.workersCovered || 0, b.notes ?? null]);
    res.status(201).json({ policy: row });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

router.patch("/insurance/policies/:id", requireAuth, requireRole("Admin", "Executive"), async (req, res) => {
  try {
    const b = req.body as Record<string, unknown>;
    const fm: Record<string, string> = { policyName: "policy_name", provider: "provider", policyType: "policy_type", coverageAmount: "coverage_amount", premiumMonthly: "premium_monthly", startDate: "start_date", endDate: "end_date", status: "status", workersCovered: "workers_covered", notes: "notes" };
    const sets: string[] = []; const vals: unknown[] = []; let idx = 1;
    for (const [k, c] of Object.entries(fm)) { if (b[k] !== undefined) { sets.push(`${c} = $${idx++}`); vals.push(b[k]); } }
    if (!sets.length) return res.status(400).json({ error: "No fields" });
    vals.push(req.params.id, req.tenantId!);
    const row = await queryOne(`UPDATE insurance_policies SET ${sets.join(", ")} WHERE id = $${idx} AND tenant_id = $${idx + 1} RETURNING *`, vals);
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json({ policy: row });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// ═══════ CLAIMS ═══════

router.get("/insurance/claims", requireAuth, async (req, res) => {
  try {
    const rows = await query(
      `SELECT c.*, p.policy_name FROM insurance_claims c LEFT JOIN insurance_policies p ON p.id = c.policy_id
       WHERE c.tenant_id = $1 ORDER BY c.created_at DESC`, [req.tenantId!]);
    res.json({ claims: rows });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

router.post("/insurance/claims", requireAuth, async (req, res) => {
  try {
    const b = req.body as Record<string, any>;
    if (!b.description) return res.status(400).json({ error: "description required" });
    const row = await queryOne(
      `INSERT INTO insurance_claims (tenant_id, worker_id, worker_name, policy_id, incident_date, description, amount_claimed)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.tenantId!, b.workerId ?? null, b.workerName ?? null, b.policyId ?? null, b.incidentDate ?? null, b.description, b.amountClaimed || 0]);
    res.status(201).json({ claim: row });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

router.patch("/insurance/claims/:id/resolve", requireAuth, requireRole("Admin", "Executive"), async (req, res) => {
  try {
    const { resolution } = req.body as { resolution?: string };
    const row = await queryOne(
      "UPDATE insurance_claims SET status = 'resolved', resolution = $1, resolved_at = NOW() WHERE id = $2 AND tenant_id = $3 RETURNING *",
      [resolution || "resolved", req.params.id, req.tenantId!]);
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json({ claim: row });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// ═══════ SUMMARY ═══════

router.get("/insurance/summary", requireAuth, async (req, res) => {
  try {
    const policies = await queryOne<Record<string, any>>(
      `SELECT COUNT(*) AS total, COALESCE(SUM(coverage_amount), 0) AS total_coverage, COALESCE(SUM(premium_monthly), 0) AS monthly_premium, COALESCE(SUM(workers_covered), 0) AS total_workers
       FROM insurance_policies WHERE tenant_id = $1 AND status = 'active'`, [req.tenantId!]);
    const claims = await queryOne<Record<string, any>>(
      `SELECT COUNT(*) FILTER (WHERE status = 'open') AS open_claims, COUNT(*) FILTER (WHERE status = 'resolved') AS resolved, COALESCE(SUM(amount_claimed) FILTER (WHERE status = 'open'), 0) AS outstanding
       FROM insurance_claims WHERE tenant_id = $1`, [req.tenantId!]);
    const expiring = await queryOne<Record<string, any>>(
      "SELECT COUNT(*) AS count FROM insurance_policies WHERE tenant_id = $1 AND end_date <= CURRENT_DATE + 30 AND status = 'active'", [req.tenantId!]);
    res.json({
      totalPolicies: Number(policies?.total ?? 0), totalCoverage: Number(policies?.total_coverage ?? 0),
      monthlyPremium: Number(policies?.monthly_premium ?? 0), workersCovered: Number(policies?.total_workers ?? 0),
      openClaims: Number(claims?.open_claims ?? 0), resolvedClaims: Number(claims?.resolved ?? 0),
      outstandingAmount: Number(claims?.outstanding ?? 0), expiringPolicies: Number(expiring?.count ?? 0),
    });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// Export for cron — alert 30 days before expiry
export async function runInsuranceExpiryAlerts(): Promise<void> {
  try {
    const tenantId = getDefaultTenantId();
    if (!tenantId) return;
    const expiring = await query<Record<string, any>>(
      "SELECT * FROM insurance_policies WHERE tenant_id = $1 AND end_date = CURRENT_DATE + 30 AND status = 'active'", [tenantId]);
    for (const p of expiring) {
      const admins = await query<Record<string, any>>("SELECT phone, full_name AS name FROM admins WHERE tenant_id = $1 AND phone IS NOT NULL LIMIT 2", [tenantId]);
      for (const a of admins) {
        if (a.phone) {
          await sendWhatsAppAlert({ to: a.phone, workerName: a.name, workerI: "system",
            permitType: `INSURANCE EXPIRY: Policy "${p.policy_name}" expires in 30 days (${p.end_date}). Coverage: €${Number(p.coverage_amount).toLocaleString()}.`,
            daysRemaining: 30, tenantId });
        }
      }
    }
    if (expiring.length > 0) console.log(`[Insurance] Alerted for ${expiring.length} expiring policies.`);
  } catch (err) { console.error("[Insurance] Expiry alert failed:", err); }
}

export default router;
