import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { query, queryOne, execute } from "../lib/db.js";
import { fetchAllWorkers } from "../lib/workers-db.js";
import { mapRowToWorker } from "../lib/compliance.js";
import { sendWhatsAppAlert } from "../lib/whatsapp.js";
import { getDefaultTenantId } from "../lib/tenant.js";

const router = Router();

// PIP fine scales (PLN) — updated April 2026 (PIP Amendment doubled maximums)
// Legal basis: Act on National Labour Inspectorate (amended effective Jan 1, 2026)
const FINE_SCALES: Record<string, { min: number; max: number; legal: string }> = {
  expired_permit:         { min: 3000,  max: 60000, legal: "Art. 120 Ustawa o promocji zatrudnienia" },
  missing_document:       { min: 1000,  max: 60000, legal: "Art. 281 Kodeks pracy" },
  zus_not_filed:          { min: 5000,  max: 60000, legal: "Art. 98 Ustawa o systemie ubezpieczeń społecznych" },
  contract_missing:       { min: 1000,  max: 60000, legal: "Art. 281 §1 pkt 2 Kodeks pracy" },
  oswiadczenie_expired:   { min: 3000,  max: 30000, legal: "Art. 120 Ustawa o promocji zatrudnienia" },
  medical_expired:        { min: 1000,  max: 60000, legal: "Art. 283 §1 Kodeks pracy" },
  bhp_expired:            { min: 2000,  max: 60000, legal: "Art. 283 §1 Kodeks pracy — doubled 2026" },
  pup_notification:       { min: 1000,  max: 3000,  legal: "Art. 120 ust. 11 — 7-day PUP notification failure" },
  b2b_reclassification:   { min: 5000,  max: 60000, legal: "PIP administrative reclassification power (2026)" },
  posted_worker_breach:   { min: 5000,  max: 30000, legal: "Art. 12 Ustawa o delegowaniu pracowników" },
  obstruction_false_info: { min: 1000,  max: 50000, legal: "Art. 283 §2 Kodeks pracy" },
  pay_transparency:       { min: 1000,  max: 30000, legal: "EU Pay Transparency Directive implementation" },
  repeated_violation:     { min: 10000, max: 90000, legal: "Art. 283 §1 — repeat offender (doubled 2026)" },
};

interface RiskItem {
  workerId: string; workerName: string; riskType: string; description: string;
  fineMin: number; fineMax: number; probability: number; priority: string; dueDate: string | null;
}

function assessRisks(worker: any): RiskItem[] {
  const risks: RiskItem[] = [];
  const now = new Date();
  const checks = [
    { field: "trcExpiry", type: "expired_permit", label: "TRC" },
    { field: "passportExpiry", type: "expired_permit", label: "Passport" },
    { field: "workPermitExpiry", type: "expired_permit", label: "Work Permit" },
    { field: "bhpExpiry", type: "bhp_expired", label: "BHP Certificate" },
    { field: "medicalExamExpiry", type: "medical_expired", label: "Medical Exam" },
    { field: "contractEndDate", type: "contract_missing", label: "Contract" },
  ];

  for (const check of checks) {
    const dateStr = worker[check.field];
    if (!dateStr) continue;
    const expiry = new Date(dateStr);
    const days = Math.ceil((expiry.getTime() - now.getTime()) / 86_400_000);

    if (days > 60) continue; // No risk

    const scale = FINE_SCALES[check.type] || { min: 500, max: 5000, legal: "" };
    let probability: number;
    let priority: string;

    if (days < 0) {
      probability = 95;
      priority = "critical";
    } else if (days <= 7) {
      probability = 80;
      priority = "critical";
    } else if (days <= 30) {
      probability = 50;
      priority = "high";
    } else {
      probability = 25;
      priority = "medium";
    }

    const description = days < 0
      ? `${check.label} expired ${Math.abs(days)} days ago — immediate PIP fine risk`
      : `${check.label} expires in ${days} days — fine risk if not renewed`;

    risks.push({
      workerId: worker.id, workerName: worker.name, riskType: check.type,
      description, fineMin: scale.min, fineMax: scale.max,
      probability, priority, dueDate: dateStr,
    });
  }

  return risks;
}

// POST /api/fines/scan — scan all workers
router.post("/fines/scan", requireAuth, requireRole("Admin", "Executive"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const result = await runFineScan(tenantId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Scan failed" });
  }
});

async function runFineScan(tenantId: string) {
  // Clear old active predictions
  await execute("DELETE FROM fine_predictions WHERE tenant_id = $1 AND status = 'active'", [tenantId]);

  const dbRows = await fetchAllWorkers(tenantId);
  const workers = dbRows.map((r) => mapRowToWorker(r));
  let totalRisks = 0;
  let criticalCount = 0;

  for (const w of workers) {
    const risks = assessRisks(w);
    for (const r of risks) {
      await execute(
        `INSERT INTO fine_predictions (tenant_id, worker_id, worker_name, risk_type, risk_description, predicted_fine_min, predicted_fine_max, probability, priority, due_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [tenantId, r.workerId, r.workerName, r.riskType, r.description, r.fineMin, r.fineMax, r.probability, r.priority, r.dueDate]
      );
      totalRisks++;
      if (r.priority === "critical") criticalCount++;
    }
  }

  // WhatsApp alert coordinators for critical risks
  if (criticalCount > 0) {
    try {
      const coords = await query<Record<string, any>>(
        "SELECT phone, name FROM site_coordinators WHERE tenant_id = $1 LIMIT 3", [tenantId]
      );
      for (const c of coords) {
        if (c.phone) {
          await sendWhatsAppAlert({
            to: c.phone, workerName: c.name, workerI: "system",
            permitType: `FINE ALERT: ${criticalCount} CRITICAL risks detected. Immediate action required to prevent PIP fines.`,
            daysRemaining: 0, tenantId,
          });
        }
      }
    } catch { /* non-blocking */ }
  }

  return { scanned: workers.length, risksFound: totalRisks, critical: criticalCount };
}

// GET /api/fines/predictions — all active
router.get("/fines/predictions", requireAuth, async (req, res) => {
  try {
    const rows = await query(
      "SELECT * FROM fine_predictions WHERE tenant_id = $1 AND status = 'active' ORDER BY priority DESC, probability DESC",
      [req.tenantId!]
    );
    res.json({ predictions: rows });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// PATCH /api/fines/predictions/:id/resolve — mark resolved
router.patch("/fines/predictions/:id/resolve", requireAuth, async (req, res) => {
  try {
    const row = await queryOne(
      "UPDATE fine_predictions SET status = 'resolved', resolved_at = NOW() WHERE id = $1 AND tenant_id = $2 RETURNING *",
      [req.params.id, req.tenantId!]
    );
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json({ prediction: row });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/fines/summary
router.get("/fines/summary", requireAuth, async (req, res) => {
  try {
    const active = await queryOne<Record<string, any>>(
      `SELECT COUNT(*) AS count, COALESCE(SUM(predicted_fine_max), 0) AS total_max,
              COUNT(*) FILTER (WHERE priority = 'critical') AS critical
       FROM fine_predictions WHERE tenant_id = $1 AND status = 'active'`,
      [req.tenantId!]
    );
    const resolved = await queryOne<Record<string, any>>(
      `SELECT COUNT(*) AS count, COALESCE(SUM(predicted_fine_max), 0) AS total_prevented
       FROM fine_predictions WHERE tenant_id = $1 AND status = 'resolved'`,
      [req.tenantId!]
    );
    res.json({
      activeRisks: Number(active?.count ?? 0),
      outstandingFines: Number(active?.total_max ?? 0),
      criticalRisks: Number(active?.critical ?? 0),
      resolvedRisks: Number(resolved?.count ?? 0),
      finesPrevented: Number(resolved?.total_prevented ?? 0),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// Export for daily cron
export { runFineScan };

export default router;
