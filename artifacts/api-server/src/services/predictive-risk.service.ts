/**
 * Predictive Risk Engine — detects future compliance risks before they happen.
 *
 * Deterministic rules only. NO AI decisions.
 * Reads from existing data: workers, snapshots, legal_cases, legal_evidence.
 * Does NOT modify any data.
 */

import { query, queryOne } from "../lib/db.js";

// ═══ TYPES ══════════════════════════════════════════════════════════════════

export type RiskSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface PredictedRisk {
  type: string;
  description: string;
  severity: RiskSeverity;
  daysUntilImpact: number;
  confidence: number;
  preventionActions: string[];
}

export interface RiskTimeline {
  day: number;
  label: string;
  severity: RiskSeverity;
}

export interface WorkerRiskForecast {
  workerId: string;
  workerName: string;
  currentStatus: string | null;
  riskLevel: string | null;
  predictedRisks: PredictedRisk[];
  timeline: RiskTimeline[];
}

export interface RiskOverview {
  totalWorkers: number;
  atRisk7Days: number;
  atRisk30Days: number;
  criticalIssues: number;
  riskDistribution: Record<RiskSeverity, number>;
  topRisks: Array<{ workerId: string; workerName: string; severity: RiskSeverity; description: string; daysUntilImpact: number }>;
}

// ═══ WORKER RISK FORECAST ═══════════════════════════════════════════════════

export async function getWorkerRiskForecast(workerId: string, tenantId: string): Promise<WorkerRiskForecast> {
  const worker = await queryOne<any>(
    `SELECT w.id, w.full_name, w.trc_expiry, w.work_permit_expiry, w.passport_expiry,
            w.bhp_expiry, w.contract_end_date, w.medical_exam_expiry,
            wls.legal_status, wls.risk_level
     FROM workers w
     LEFT JOIN worker_legal_snapshots wls ON wls.worker_id = w.id
     WHERE w.id = $1 AND w.tenant_id = $2`,
    [workerId, tenantId]
  );
  if (!worker) throw new Error("Worker not found");

  const legalCase = await queryOne<any>(
    "SELECT status, appeal_deadline, mos_status FROM legal_cases WHERE worker_id = $1 AND tenant_id = $2 ORDER BY created_at DESC LIMIT 1",
    [workerId, tenantId]
  );

  const evidenceCount = await queryOne<any>(
    "SELECT COUNT(*) as cnt FROM legal_evidence WHERE worker_id = $1 AND tenant_id = $2",
    [workerId, tenantId]
  );

  const ocrMismatch = await queryOne<any>(
    "SELECT id FROM legal_evidence WHERE worker_id = $1 AND tenant_id = $2 AND verification_status = 'MISMATCH' LIMIT 1",
    [workerId, tenantId]
  );

  const hasPoa = await queryOne<any>(
    "SELECT id FROM legal_documents WHERE worker_id = $1 AND tenant_id = $2 AND template_type = 'POWER_OF_ATTORNEY' AND status != 'archived'",
    [workerId, tenantId]
  );

  const risks: PredictedRisk[] = [];
  const now = Date.now();

  // ── 1. Permit expiry forecast ─────────────────────────────────────────
  const permitExpiry = worker.trc_expiry ?? worker.work_permit_expiry;
  if (permitExpiry) {
    const days = Math.ceil((new Date(permitExpiry).getTime() - now) / 86_400_000);

    if (days <= 0) {
      risks.push({
        type: "PERMIT_EXPIRED", description: `Permit expired ${Math.abs(days)} day(s) ago`,
        severity: "CRITICAL", daysUntilImpact: 0, confidence: 1.0,
        preventionActions: ["Suspend deployment", "Consult immigration lawyer", "File new application immediately"],
      });
    } else if (days <= 7) {
      risks.push({
        type: "PERMIT_EXPIRY_IMMINENT", description: `Permit expires in ${days} day(s)`,
        severity: "CRITICAL", daysUntilImpact: days, confidence: 1.0,
        preventionActions: ["File TRC application TODAY", "Prepare emergency cover letter", "Verify all documents ready"],
      });
    } else if (days <= 14) {
      risks.push({
        type: "PERMIT_EXPIRY_URGENT", description: `Permit expires in ${days} day(s)`,
        severity: "HIGH", daysUntilImpact: days, confidence: 1.0,
        preventionActions: ["Start TRC renewal package", "Ensure POA is signed", "Upload filing evidence"],
      });
    } else if (days <= 30) {
      risks.push({
        type: "PERMIT_EXPIRY_WARNING", description: `Permit expires in ${days} day(s)`,
        severity: "MEDIUM", daysUntilImpact: days, confidence: 1.0,
        preventionActions: ["Begin TRC application process", "Collect required documents"],
      });
    } else if (days <= 60) {
      risks.push({
        type: "PERMIT_EXPIRY_PLANNED", description: `Permit expires in ${days} day(s)`,
        severity: "LOW", daysUntilImpact: days, confidence: 1.0,
        preventionActions: ["Plan TRC renewal timeline"],
      });
    }
  }

  // ── 2. Filing continuity risk ─────────────────────────────────────────
  const permitDays = permitExpiry ? Math.ceil((new Date(permitExpiry).getTime() - now) / 86_400_000) : null;
  if (permitDays !== null && permitDays <= 30 && permitDays > 0 && !legalCase) {
    risks.push({
      type: "NO_CONTINUITY_PROTECTION", description: "No TRC case filed — Art. 108 continuity will NOT apply if permit expires",
      severity: permitDays <= 14 ? "CRITICAL" : "HIGH", daysUntilImpact: permitDays, confidence: 0.95,
      preventionActions: ["Create TRC case immediately", "File via MOS before permit expiry", "Generate TRC Renewal Package"],
    });
  }

  // ── 3. Evidence risk ──────────────────────────────────────────────────
  if (Number(evidenceCount?.cnt ?? 0) === 0 && (worker.legal_status === "PROTECTED_PENDING" || legalCase)) {
    risks.push({
      type: "NO_EVIDENCE", description: "No filing evidence uploaded — PIP inspection risk",
      severity: "HIGH", daysUntilImpact: 0, confidence: 0.9,
      preventionActions: ["Upload MoS/UPO filing receipt", "Scan and verify filing documents"],
    });
  }

  // ── 4. OCR mismatch risk ──────────────────────────────────────────────
  if (ocrMismatch) {
    risks.push({
      type: "EVIDENCE_MISMATCH", description: "OCR verification found date mismatch — filing date may be incorrect",
      severity: "HIGH", daysUntilImpact: 0, confidence: 0.85,
      preventionActions: ["Manually verify filing date", "Re-upload correct evidence", "Check voivodeship records"],
    });
  }

  // ── 5. Appeal deadline risk ───────────────────────────────────────────
  if (legalCase?.status === "REJECTED" && legalCase.appeal_deadline) {
    const appealDays = Math.ceil((new Date(legalCase.appeal_deadline).getTime() - now) / 86_400_000);
    if (appealDays <= 0) {
      risks.push({
        type: "APPEAL_DEADLINE_PASSED", description: "Appeal deadline has passed",
        severity: "CRITICAL", daysUntilImpact: 0, confidence: 1.0,
        preventionActions: ["Consult lawyer for alternative options", "Consider new application"],
      });
    } else if (appealDays <= 3) {
      risks.push({
        type: "APPEAL_DEADLINE_IMMINENT", description: `Appeal deadline in ${appealDays} day(s)`,
        severity: "CRITICAL", daysUntilImpact: appealDays, confidence: 1.0,
        preventionActions: ["Submit appeal TODAY", "Execute Appeal Package immediately"],
      });
    } else if (appealDays <= 7) {
      risks.push({
        type: "APPEAL_DEADLINE_APPROACHING", description: `Appeal deadline in ${appealDays} day(s)`,
        severity: "HIGH", daysUntilImpact: appealDays, confidence: 1.0,
        preventionActions: ["Prepare appeal draft", "Collect supporting evidence", "Schedule legal review"],
      });
    }
  }

  // ── 6. Missing POA ────────────────────────────────────────────────────
  if (!hasPoa && legalCase) {
    risks.push({
      type: "MISSING_POA", description: "No Power of Attorney — cannot act on behalf of worker",
      severity: "HIGH", daysUntilImpact: 0, confidence: 1.0,
      preventionActions: ["Generate and sign POA immediately"],
    });
  }

  // ── 7. Document expiry risks ──────────────────────────────────────────
  const docChecks = [
    { field: worker.passport_expiry, label: "Passport", days: 90 },
    { field: worker.bhp_expiry, label: "BHP Certificate", days: 30 },
    { field: worker.medical_exam_expiry, label: "Medical Exam", days: 30 },
    { field: worker.contract_end_date, label: "Employment Contract", days: 14 },
  ];
  for (const doc of docChecks) {
    if (!doc.field) continue;
    const days = Math.ceil((new Date(doc.field).getTime() - now) / 86_400_000);
    if (days <= 0) {
      risks.push({
        type: `${doc.label.toUpperCase().replace(/ /g, "_")}_EXPIRED`, description: `${doc.label} expired ${Math.abs(days)} day(s) ago`,
        severity: "HIGH", daysUntilImpact: 0, confidence: 1.0,
        preventionActions: [`Renew ${doc.label} immediately`],
      });
    } else if (days <= doc.days) {
      risks.push({
        type: `${doc.label.toUpperCase().replace(/ /g, "_")}_EXPIRING`, description: `${doc.label} expires in ${days} day(s)`,
        severity: days <= 7 ? "HIGH" : "MEDIUM", daysUntilImpact: days, confidence: 1.0,
        preventionActions: [`Schedule ${doc.label} renewal`],
      });
    }
  }

  // Sort by severity then days
  risks.sort((a, b) => severityScore(b.severity) - severityScore(a.severity) || a.daysUntilImpact - b.daysUntilImpact);

  // Build timeline
  const timeline = buildTimeline(permitDays, legalCase);

  return {
    workerId, workerName: worker.full_name ?? "Unknown",
    currentStatus: worker.legal_status, riskLevel: worker.risk_level,
    predictedRisks: risks, timeline,
  };
}

// ═══ GLOBAL RISK OVERVIEW ═══════════════════════════════════════════════════

export async function getRiskOverview(tenantId: string): Promise<RiskOverview> {
  const now = new Date().toISOString().slice(0, 10);

  // Single optimized query for all workers' expiry data
  const workers = await query<any>(`
    SELECT w.id, w.full_name, w.trc_expiry, w.work_permit_expiry,
           wls.legal_status, wls.risk_level,
           lc.status as case_status, lc.appeal_deadline
    FROM workers w
    LEFT JOIN worker_legal_snapshots wls ON wls.worker_id = w.id
    LEFT JOIN LATERAL (
      SELECT status, appeal_deadline FROM legal_cases WHERE worker_id = w.id AND tenant_id = $1 ORDER BY created_at DESC LIMIT 1
    ) lc ON true
    WHERE w.tenant_id = $1 AND (w.status IS NULL OR w.status NOT IN ('departed','terminated'))
  `, [tenantId]);

  let atRisk7 = 0, atRisk30 = 0, critical = 0;
  const dist: Record<RiskSeverity, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  const topRisks: RiskOverview["topRisks"] = [];
  const nowMs = Date.now();

  for (const w of workers) {
    const expiry = w.trc_expiry ?? w.work_permit_expiry;
    if (!expiry) continue;
    const days = Math.ceil((new Date(expiry).getTime() - nowMs) / 86_400_000);

    let sev: RiskSeverity = "LOW";
    let desc = "";

    if (days <= 0) { sev = "CRITICAL"; desc = `Expired ${Math.abs(days)}d ago`; }
    else if (days <= 7) { sev = "CRITICAL"; desc = `Expires in ${days}d`; }
    else if (days <= 14) { sev = "HIGH"; desc = `Expires in ${days}d`; }
    else if (days <= 30) { sev = "MEDIUM"; desc = `Expires in ${days}d`; }
    else if (days <= 60) { sev = "LOW"; desc = `Expires in ${days}d`; }
    else continue; // No risk

    dist[sev]++;
    if (days <= 7) atRisk7++;
    if (days <= 30) atRisk30++;
    if (sev === "CRITICAL") critical++;

    if (sev === "CRITICAL" || sev === "HIGH") {
      topRisks.push({ workerId: w.id, workerName: w.full_name ?? "Unknown", severity: sev, description: desc, daysUntilImpact: Math.max(0, days) });
    }

    // Appeal deadline risk
    if (w.case_status === "REJECTED" && w.appeal_deadline) {
      const appealDays = Math.ceil((new Date(w.appeal_deadline).getTime() - nowMs) / 86_400_000);
      if (appealDays <= 7 && appealDays >= 0) {
        topRisks.push({ workerId: w.id, workerName: w.full_name ?? "Unknown", severity: appealDays <= 3 ? "CRITICAL" : "HIGH", description: `Appeal deadline in ${appealDays}d`, daysUntilImpact: appealDays });
        if (appealDays <= 3) critical++;
      }
    }
  }

  topRisks.sort((a, b) => severityScore(b.severity) - severityScore(a.severity) || a.daysUntilImpact - b.daysUntilImpact);

  return { totalWorkers: workers.length, atRisk7Days: atRisk7, atRisk30Days: atRisk30, criticalIssues: critical, riskDistribution: dist, topRisks: topRisks.slice(0, 20) };
}

// ═══ HELPERS ════════════════════════════════════════════════════════════════

function severityScore(s: RiskSeverity): number {
  return { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }[s] ?? 0;
}

function buildTimeline(permitDays: number | null, legalCase: any): RiskTimeline[] {
  if (permitDays === null) return [{ day: 0, label: "No permit data", severity: "HIGH" }];
  const t: RiskTimeline[] = [];
  if (permitDays > 60) t.push({ day: 0, label: "OK — valid", severity: "LOW" });
  if (permitDays > 30) t.push({ day: Math.max(0, permitDays - 60), label: "Plan renewal", severity: "LOW" });
  if (permitDays > 14) t.push({ day: Math.max(0, permitDays - 30), label: "EXPIRING SOON", severity: "MEDIUM" });
  if (permitDays > 7) t.push({ day: Math.max(0, permitDays - 14), label: "URGENT", severity: "HIGH" });
  if (permitDays > 0) t.push({ day: Math.max(0, permitDays - 7), label: "CRITICAL", severity: "CRITICAL" });
  t.push({ day: Math.max(0, permitDays), label: "EXPIRED", severity: "CRITICAL" });
  return t;
}
