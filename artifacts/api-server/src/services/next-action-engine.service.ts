/**
 * Next Action Engine — calculates next action, risk level, and deadline
 * tracking per worker using deterministic rules only.
 *
 * NO AI. NO side effects. Pure computation from worker data.
 *
 * Inputs: worker record, legal case, evidence counts, document counts
 * Outputs: nextAction, riskLevel, urgency, deadlines, alerts
 */

import { query, queryOne } from "../lib/db.js";

// ═══ TYPES ══════════════════════════════════════════════════════════════════

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type UrgencyLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface NextAction {
  action: string;
  category: "document" | "legal" | "compliance" | "recruitment" | "medical" | "contract";
  priority: "low" | "medium" | "high" | "critical";
  daysUntilDeadline?: number | null;
}

export interface DeadlineEntry {
  label: string;
  date: string;
  daysLeft: number;
  status: "ok" | "warning" | "urgent" | "expired";
}

export interface WorkerAlert {
  type: "expired" | "expiring" | "missing" | "mismatch" | "overdue";
  severity: "low" | "medium" | "high" | "critical";
  message: string;
}

export interface WorkerIntelligence {
  workerId: string;
  workerName: string;
  nextActions: NextAction[];
  primaryAction: string;
  riskLevel: RiskLevel;
  urgency: UrgencyLevel;
  deadlines: DeadlineEntry[];
  alerts: WorkerAlert[];
  scores: {
    documentCompleteness: number;  // 0-100
    complianceHealth: number;      // 0-100
    deadlineRisk: number;          // 0-100 (higher = more risk)
  };
  computedAt: string;
}

export interface FleetSignals {
  totalWorkers: number;
  expiringSoon: number;    // docs expiring within 30 days
  expired: number;         // any expired document
  casesNeedingAction: number;
  criticalRisk: number;
  highRisk: number;
  missingCriticalDocs: number;
  computedAt: string;
}

// ═══ HELPERS ════════════════════════════════════════════════════════════════

const now = () => new Date();
const daysUntil = (d: string | null | undefined): number | null => {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - now().getTime()) / 86400000);
};

function deadlineStatus(days: number | null): "ok" | "warning" | "urgent" | "expired" {
  if (days === null) return "ok";
  if (days < 0) return "expired";
  if (days < 14) return "urgent";
  if (days < 30) return "warning";
  return "ok";
}

// ═══ PER-WORKER INTELLIGENCE ════════════════════════════════════════════════

export async function getWorkerIntelligence(workerId: string, tenantId: string): Promise<WorkerIntelligence> {
  // Load worker
  const w = await queryOne<Record<string, any>>(
    `SELECT * FROM workers WHERE id = $1 AND (tenant_id = $2 OR tenant_id IS NULL)`,
    [workerId, tenantId],
  );
  if (!w) throw new Error("Worker not found");

  // Load active case
  const activeCase = await queryOne<Record<string, any>>(
    `SELECT * FROM legal_cases WHERE worker_id = $1 AND tenant_id = $2
       AND status NOT IN ('APPROVED','CLOSED','resolved')
     ORDER BY created_at DESC LIMIT 1`,
    [workerId, tenantId],
  );

  // Evidence count
  const evRow = await queryOne<{ total: number }>(
    `SELECT COUNT(*)::int as total FROM legal_evidence WHERE worker_id = $1 AND tenant_id = $2`,
    [workerId, tenantId],
  ).catch(() => ({ total: 0 }));

  // Document count
  const docRow = await queryOne<{ total: number; approved: number }>(
    `SELECT COUNT(*)::int as total, COUNT(CASE WHEN status = 'approved' THEN 1 END)::int as approved
     FROM legal_documents WHERE worker_id = $1 AND tenant_id = $2`,
    [workerId, tenantId],
  ).catch(() => ({ total: 0, approved: 0 }));

  // ── Compute deadlines ────────────────────────────────────────────────────
  const deadlines: DeadlineEntry[] = [];
  const addDeadline = (label: string, date: string | null | undefined) => {
    if (!date) return;
    const days = daysUntil(date)!;
    deadlines.push({ label, date, daysLeft: days, status: deadlineStatus(days) });
  };

  addDeadline("Permit Expiry", w.trc_expiry ?? w.work_permit_expiry);
  addDeadline("Passport Expiry", w.passport_expiry);
  addDeadline("BHP Certificate", w.bhp_expiry ?? w.bhp_status);
  addDeadline("Medical Exam", w.medical_exam_expiry ?? w.badania_lek_expiry);
  addDeadline("Contract End", w.contract_end_date);
  addDeadline("Oświadczenie Expiry", w.oswiadczenie_expiry);
  addDeadline("UDT Certificate", w.udt_cert_expiry);
  if (activeCase?.appeal_deadline) {
    addDeadline("Appeal Deadline", activeCase.appeal_deadline);
  }

  deadlines.sort((a, b) => a.daysLeft - b.daysLeft);

  // ── Compute alerts ───────────────────────────────────────────────────────
  const alerts: WorkerAlert[] = [];

  for (const dl of deadlines) {
    if (dl.status === "expired") {
      alerts.push({ type: "expired", severity: "critical", message: `${dl.label} expired ${Math.abs(dl.daysLeft)} days ago` });
    } else if (dl.status === "urgent") {
      alerts.push({ type: "expiring", severity: "high", message: `${dl.label} expires in ${dl.daysLeft} days` });
    } else if (dl.status === "warning") {
      alerts.push({ type: "expiring", severity: "medium", message: `${dl.label} expires in ${dl.daysLeft} days` });
    }
  }

  // Missing critical documents
  const hasPesel = !!w.pesel;
  const hasPassport = !!(w.passport_expiry || w.passport_number);
  const hasPermit = !!(w.trc_expiry || w.work_permit_expiry);
  const hasBhp = !!(w.bhp_expiry || w.bhp_status);
  const hasMedical = !!(w.medical_exam_expiry || w.badania_lek_expiry);
  const hasContract = !!w.contract_end_date;

  if (!hasPassport) alerts.push({ type: "missing", severity: "high", message: "Missing passport data" });
  if (!hasPermit) alerts.push({ type: "missing", severity: "high", message: "No permit/TRC on file" });
  if (!hasBhp) alerts.push({ type: "missing", severity: "medium", message: "Missing BHP certificate" });
  if (!hasMedical) alerts.push({ type: "missing", severity: "medium", message: "Missing medical exam" });
  if (!hasContract) alerts.push({ type: "missing", severity: "medium", message: "No contract end date set" });
  if (!hasPesel) alerts.push({ type: "missing", severity: "medium", message: "Missing PESEL" });

  // ── Compute next actions ─────────────────────────────────────────────────
  const nextActions: NextAction[] = [];

  // Expired documents → immediate action
  for (const dl of deadlines) {
    if (dl.status === "expired") {
      nextActions.push({
        action: `Renew ${dl.label} (expired ${Math.abs(dl.daysLeft)} days ago)`,
        category: dl.label.includes("Contract") ? "contract" : dl.label.includes("Medical") || dl.label.includes("BHP") ? "medical" : "document",
        priority: "critical",
        daysUntilDeadline: dl.daysLeft,
      });
    }
  }

  // Appeal deadline
  if (activeCase?.appeal_deadline) {
    const days = daysUntil(activeCase.appeal_deadline);
    if (days !== null && days >= 0 && days <= 14) {
      nextActions.push({
        action: `Appeal rejection within ${days} days`,
        category: "legal",
        priority: days <= 3 ? "critical" : "high",
        daysUntilDeadline: days,
      });
    }
  }

  // Missing critical documents
  if (!hasPassport) nextActions.push({ action: "Upload passport", category: "document", priority: "high" });
  if (!hasPermit) nextActions.push({ action: "Start TRC/permit case", category: "legal", priority: "high" });
  if (!hasBhp) nextActions.push({ action: "Schedule BHP training", category: "medical", priority: "medium" });
  if (!hasMedical) nextActions.push({ action: "Schedule medical exam (Badania Lekarskie)", category: "medical", priority: "medium" });
  if (!hasContract) nextActions.push({ action: "Set contract end date", category: "contract", priority: "medium" });

  // Expiring soon documents
  for (const dl of deadlines) {
    if (dl.status === "urgent" && !nextActions.some(a => a.action.includes(dl.label))) {
      nextActions.push({
        action: `${dl.label} expires in ${dl.daysLeft} days — renew now`,
        category: "document",
        priority: "high",
        daysUntilDeadline: dl.daysLeft,
      });
    }
  }

  // Legal case needs action
  if (activeCase && activeCase.status === "NEW") {
    nextActions.push({ action: "Review and start legal case processing", category: "legal", priority: "medium" });
  }
  if (activeCase && activeCase.status === "REJECTED" && !nextActions.some(a => a.action.includes("Appeal"))) {
    nextActions.push({ action: "Review rejection and consider appeal", category: "legal", priority: "high" });
  }

  // No evidence uploaded
  if ((evRow?.total ?? 0) === 0 && hasPermit) {
    nextActions.push({ action: "Upload filing evidence for legal case", category: "legal", priority: "medium" });
  }

  // Sort by priority
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  nextActions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  // ── Compute risk level ───────────────────────────────────────────────────
  const criticalAlerts = alerts.filter(a => a.severity === "critical").length;
  const highAlerts = alerts.filter(a => a.severity === "high").length;

  let riskLevel: RiskLevel = "LOW";
  if (criticalAlerts > 0) riskLevel = "CRITICAL";
  else if (highAlerts >= 2) riskLevel = "HIGH";
  else if (highAlerts >= 1 || alerts.filter(a => a.severity === "medium").length >= 3) riskLevel = "MEDIUM";

  // Override to CRITICAL if appeal deadline within 7 days
  if (activeCase?.appeal_deadline) {
    const days = daysUntil(activeCase.appeal_deadline);
    if (days !== null && days >= 0 && days <= 7) riskLevel = "CRITICAL";
  }

  // ── Compute urgency ──────────────────────────────────────────────────────
  let urgency: UrgencyLevel = "LOW";
  if (riskLevel === "CRITICAL") urgency = "CRITICAL";
  else if (riskLevel === "HIGH") urgency = "HIGH";
  else if (riskLevel === "MEDIUM") urgency = "MEDIUM";

  // ── Scores ───────────────────────────────────────────────────────────────
  const criticalDocFields = [hasPassport, hasPermit, hasBhp, hasMedical, hasContract, hasPesel];
  const documentCompleteness = Math.round((criticalDocFields.filter(Boolean).length / criticalDocFields.length) * 100);

  const expiredCount = deadlines.filter(d => d.status === "expired").length;
  const urgentCount = deadlines.filter(d => d.status === "urgent").length;
  const complianceHealth = Math.max(0, 100 - (expiredCount * 25) - (urgentCount * 10) - (alerts.filter(a => a.type === "missing").length * 5));

  const deadlineRisk = Math.min(100, (expiredCount * 30) + (urgentCount * 15) + (criticalAlerts * 20));

  const primaryAction = nextActions[0]?.action ?? "No immediate action required";

  return {
    workerId,
    workerName: w.name ?? w.full_name ?? "—",
    nextActions: nextActions.slice(0, 8),
    primaryAction,
    riskLevel,
    urgency,
    deadlines,
    alerts,
    scores: { documentCompleteness, complianceHealth, deadlineRisk },
    computedAt: now().toISOString(),
  };
}

// ═══ FLEET SIGNALS ══════════════════════════════════════════════════════════

export async function getFleetSignals(tenantId: string): Promise<FleetSignals> {
  const n = now();
  const in30 = new Date(n.getTime() + 30 * 86400000).toISOString();

  // Total workers
  const totalRow = await queryOne<{ count: number }>(
    `SELECT COUNT(*)::int as count FROM workers WHERE (tenant_id = $1 OR tenant_id IS NULL) AND (worker_status IS NULL OR worker_status != 'Archived')`,
    [tenantId],
  ).catch(() => ({ count: 0 }));

  // Expiring within 30 days (any of: trc, passport, bhp, medical, contract)
  const expiringRow = await queryOne<{ count: number }>(
    `SELECT COUNT(DISTINCT id)::int as count FROM workers
     WHERE (tenant_id = $1 OR tenant_id IS NULL)
       AND (worker_status IS NULL OR worker_status != 'Archived')
       AND (
         (trc_expiry IS NOT NULL AND trc_expiry <= $2 AND trc_expiry > NOW())
         OR (work_permit_expiry IS NOT NULL AND work_permit_expiry <= $2 AND work_permit_expiry > NOW())
         OR (passport_expiry IS NOT NULL AND passport_expiry <= $2 AND passport_expiry > NOW())
         OR (bhp_expiry IS NOT NULL AND bhp_expiry <= $2 AND bhp_expiry > NOW())
         OR (medical_exam_expiry IS NOT NULL AND medical_exam_expiry <= $2 AND medical_exam_expiry > NOW())
         OR (contract_end_date IS NOT NULL AND contract_end_date <= $2 AND contract_end_date > NOW())
       )`,
    [tenantId, in30],
  ).catch(() => ({ count: 0 }));

  // Expired (any doc past due)
  const expiredRow = await queryOne<{ count: number }>(
    `SELECT COUNT(DISTINCT id)::int as count FROM workers
     WHERE (tenant_id = $1 OR tenant_id IS NULL)
       AND (worker_status IS NULL OR worker_status != 'Archived')
       AND (
         (trc_expiry IS NOT NULL AND trc_expiry < NOW())
         OR (work_permit_expiry IS NOT NULL AND work_permit_expiry < NOW())
         OR (passport_expiry IS NOT NULL AND passport_expiry < NOW())
         OR (bhp_expiry IS NOT NULL AND bhp_expiry < NOW())
         OR (medical_exam_expiry IS NOT NULL AND medical_exam_expiry < NOW())
       )`,
    [tenantId],
  ).catch(() => ({ count: 0 }));

  // Cases needing action (NEW or REJECTED status)
  const casesRow = await queryOne<{ count: number }>(
    `SELECT COUNT(*)::int as count FROM legal_cases
     WHERE tenant_id = $1 AND status IN ('NEW','REJECTED','PENDING')`,
    [tenantId],
  ).catch(() => ({ count: 0 }));

  // Missing critical docs (no passport OR no permit)
  const missingRow = await queryOne<{ count: number }>(
    `SELECT COUNT(*)::int as count FROM workers
     WHERE (tenant_id = $1 OR tenant_id IS NULL)
       AND (worker_status IS NULL OR worker_status != 'Archived')
       AND (
         (passport_expiry IS NULL AND passport_number IS NULL)
         OR (trc_expiry IS NULL AND work_permit_expiry IS NULL)
       )`,
    [tenantId],
  ).catch(() => ({ count: 0 }));

  // Critical/high risk workers (expired docs with no case)
  const criticalRow = await queryOne<{ count: number }>(
    `SELECT COUNT(*)::int as count FROM workers
     WHERE (tenant_id = $1 OR tenant_id IS NULL)
       AND (worker_status IS NULL OR worker_status != 'Archived')
       AND (
         (trc_expiry IS NOT NULL AND trc_expiry < NOW())
         OR (work_permit_expiry IS NOT NULL AND work_permit_expiry < NOW())
       )`,
    [tenantId],
  ).catch(() => ({ count: 0 }));

  return {
    totalWorkers: totalRow?.count ?? 0,
    expiringSoon: expiringRow?.count ?? 0,
    expired: expiredRow?.count ?? 0,
    casesNeedingAction: casesRow?.count ?? 0,
    criticalRisk: criticalRow?.count ?? 0,
    highRisk: (expiringRow?.count ?? 0),
    missingCriticalDocs: missingRow?.count ?? 0,
    computedAt: n.toISOString(),
  };
}
