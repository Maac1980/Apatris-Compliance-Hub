/**
 * Legal Reasoning Panel — per-worker legal timeline + reasoning view.
 *
 * For each worker/case, aggregates:
 *   - Legal card facts
 *   - Case facts
 *   - Timeline of submissions / deadlines / authority events
 *   - Relevant articles
 *   - Current risk
 *   - Urgency
 *   - Next required action
 *
 * PROVIDER SPLIT:
 *   Deterministic → all data aggregation, risk, deadlines, timeline
 *   No AI used here — this is a pure data view.
 */

import { query, queryOne } from "../lib/db.js";
import { getWorkerLegalSnapshot, type LegalSnapshot } from "./legal-status.service.js";

// ═══ TYPES ══════════════════════════════════════════════════════════════════

export interface TimelineEvent {
  date: string;
  type: "submission" | "decision" | "deadline" | "evidence" | "status_change" | "document" | "filing" | "alert";
  title: string;
  description: string;
  urgency: "low" | "medium" | "high" | "critical";
  source: string;
}

export interface LegalReasoningPanel {
  workerId: string;
  workerName: string;

  // Legal Card Facts (deterministic truth)
  legalCardFacts: {
    nationality: string;
    pesel: string;
    permitType: string;
    permitExpiry: string | null;
    filingDate: string | null;
    filingMethod: string | null;
    residenceBasis: string;
    contractEndDate: string | null;
    bhpExpiry: string | null;
    medicalExpiry: string | null;
  };

  // Legal Snapshot (from engine)
  legalStatus: string;
  legalBasis: string;
  riskLevel: string;
  conditions: string[];
  warnings: string[];
  requiredActions: string[];

  // Case Facts
  activeCase: {
    id: string;
    type: string;
    status: string;
    appealDeadline: string | null;
    nextAction: string | null;
    createdAt: string;
  } | null;

  // Timeline
  timeline: TimelineEvent[];

  // Urgency Assessment (deterministic)
  urgency: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  urgencyReasons: string[];
  daysUntilNextDeadline: number | null;
  nextDeadlineLabel: string | null;

  // Relevant Articles (from previous research)
  relevantArticles: Array<{ article: string; title: string }>;

  generatedAt: string;
}

// ═══ MAIN ═══════════════════════════════════════════════════════════════════

export async function getLegalReasoningPanel(workerId: string, tenantId: string): Promise<LegalReasoningPanel> {
  const now = new Date();
  const daysUntil = (d: string | null | undefined): number | null => {
    if (!d) return null;
    return Math.ceil((new Date(d).getTime() - now.getTime()) / 86400000);
  };

  // ── Load worker ──────────────────────────────────────────────────────────
  const worker = await queryOne<Record<string, unknown>>(
    `SELECT * FROM workers WHERE id = $1 AND (tenant_id = $2 OR tenant_id IS NULL)`, [workerId, tenantId],
  );
  if (!worker) throw new Error("Worker not found");
  const w = worker as any;

  // ── Legal snapshot ───────────────────────────────────────────────────────
  let snapshot: LegalSnapshot | null = null;
  try { snapshot = await getWorkerLegalSnapshot(workerId, tenantId); } catch { /* unavailable */ }

  // ── Legal card facts ─────────────────────────────────────────────────────
  const legalCardFacts = {
    nationality: w.nationality ?? "—",
    pesel: w.pesel ?? "—",
    permitType: w.permit_type ?? w.visa_type ?? "—",
    permitExpiry: w.trc_expiry ?? w.work_permit_expiry ?? null,
    filingDate: w.filing_date ?? null,
    filingMethod: w.filing_method ?? null,
    residenceBasis: w.residence_basis ?? "Unknown",
    contractEndDate: w.contract_end_date ?? null,
    bhpExpiry: w.bhp_expiry ?? w.bhp_status ?? null,
    medicalExpiry: w.medical_exam_expiry ?? w.badania_lek_expiry ?? null,
  };

  // ── Active case ──────────────────────────────────────────────────────────
  const caseRows = await query<Record<string, unknown>>(
    `SELECT * FROM legal_cases WHERE worker_id = $1 AND tenant_id = $2
       AND status NOT IN ('APPROVED','CLOSED','resolved')
     ORDER BY created_at DESC LIMIT 1`,
    [workerId, tenantId],
  );
  const lc = caseRows[0] as any | undefined;
  const activeCase = lc ? {
    id: lc.id,
    type: lc.case_type ?? lc.type,
    status: lc.status,
    appealDeadline: lc.appeal_deadline ?? null,
    nextAction: lc.next_action ?? null,
    createdAt: lc.created_at,
  } : null;

  // ── Build Timeline ───────────────────────────────────────────────────────
  const timeline: TimelineEvent[] = [];

  // Filing event
  if (legalCardFacts.filingDate) {
    timeline.push({
      date: legalCardFacts.filingDate,
      type: "filing",
      title: "TRC Application Filed",
      description: `Filed via ${legalCardFacts.filingMethod ?? "unknown method"}`,
      urgency: "low",
      source: "worker_record",
    });
  }

  // Permit expiry
  if (legalCardFacts.permitExpiry) {
    const days = daysUntil(legalCardFacts.permitExpiry);
    timeline.push({
      date: legalCardFacts.permitExpiry,
      type: "deadline",
      title: "Permit Expiry",
      description: `${legalCardFacts.permitType} expires${days !== null ? ` (${days} days)` : ""}`,
      urgency: days !== null ? (days < 0 ? "critical" : days < 14 ? "high" : days < 30 ? "medium" : "low") : "medium",
      source: "worker_record",
    });
  }

  // Contract end
  if (legalCardFacts.contractEndDate) {
    const days = daysUntil(legalCardFacts.contractEndDate);
    timeline.push({
      date: legalCardFacts.contractEndDate,
      type: "deadline",
      title: "Contract End Date",
      description: `Employment contract ends${days !== null ? ` (${days} days)` : ""}`,
      urgency: days !== null ? (days < 14 ? "high" : days < 30 ? "medium" : "low") : "low",
      source: "worker_record",
    });
  }

  // BHP expiry
  if (legalCardFacts.bhpExpiry) {
    const days = daysUntil(legalCardFacts.bhpExpiry);
    timeline.push({
      date: legalCardFacts.bhpExpiry,
      type: "deadline",
      title: "BHP Certificate Expiry",
      description: `Safety training expires${days !== null ? ` (${days} days)` : ""}`,
      urgency: days !== null ? (days < 0 ? "critical" : days < 30 ? "high" : "low") : "low",
      source: "worker_record",
    });
  }

  // Medical expiry
  if (legalCardFacts.medicalExpiry) {
    const days = daysUntil(legalCardFacts.medicalExpiry);
    timeline.push({
      date: legalCardFacts.medicalExpiry,
      type: "deadline",
      title: "Medical Exam Expiry",
      description: `Badania lekarskie expires${days !== null ? ` (${days} days)` : ""}`,
      urgency: days !== null ? (days < 0 ? "critical" : days < 30 ? "high" : "low") : "low",
      source: "worker_record",
    });
  }

  // Case events
  if (activeCase) {
    timeline.push({
      date: activeCase.createdAt,
      type: "submission",
      title: `Legal Case Created: ${activeCase.type}`,
      description: `Status: ${activeCase.status}`,
      urgency: "medium",
      source: "legal_case",
    });
    if (activeCase.appealDeadline) {
      const days = daysUntil(activeCase.appealDeadline);
      timeline.push({
        date: activeCase.appealDeadline,
        type: "deadline",
        title: "Appeal Deadline",
        description: `Must appeal by this date${days !== null ? ` (${days} days)` : ""}`,
        urgency: days !== null ? (days < 0 ? "critical" : days < 7 ? "critical" : days < 14 ? "high" : "medium") : "high",
        source: "legal_case",
      });
    }
  }

  // Evidence entries
  const evidenceRows = await query<Record<string, unknown>>(
    `SELECT * FROM legal_evidence WHERE worker_id = $1 AND tenant_id = $2 ORDER BY created_at DESC LIMIT 10`,
    [workerId, tenantId],
  ).catch(() => [] as any[]);

  for (const ev of evidenceRows) {
    const e = ev as any;
    timeline.push({
      date: e.created_at ?? e.filing_date ?? now.toISOString(),
      type: "evidence",
      title: `Evidence: ${e.evidence_type ?? e.type ?? "Filing"}`,
      description: e.description ?? e.notes ?? "",
      urgency: "low",
      source: "legal_evidence",
    });
  }

  // Legal alerts
  const alertRows = await query<Record<string, unknown>>(
    `SELECT * FROM legal_alerts WHERE worker_id = $1 AND tenant_id = $2 ORDER BY created_at DESC LIMIT 5`,
    [workerId, tenantId],
  ).catch(() => [] as any[]);

  for (const al of alertRows) {
    const a = al as any;
    timeline.push({
      date: a.created_at ?? now.toISOString(),
      type: "alert",
      title: `Alert: ${a.alert_type ?? a.type ?? "Status Change"}`,
      description: a.message ?? a.description ?? "",
      urgency: a.severity === "CRITICAL" ? "critical" : a.severity === "HIGH" ? "high" : "medium",
      source: "legal_alert",
    });
  }

  // Sort timeline by date descending
  timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // ── Urgency Assessment ───────────────────────────────────────────────────
  const urgencyReasons: string[] = [];
  let urgency: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" = "LOW";

  const permitDays = daysUntil(legalCardFacts.permitExpiry);
  const appealDays = activeCase?.appealDeadline ? daysUntil(activeCase.appealDeadline) : null;

  if (permitDays !== null && permitDays < 0) {
    urgency = "CRITICAL";
    urgencyReasons.push(`Permit expired ${Math.abs(permitDays)} days ago`);
  }
  if (appealDays !== null && appealDays !== null && appealDays < 7 && appealDays >= 0) {
    urgency = "CRITICAL";
    urgencyReasons.push(`Appeal deadline in ${appealDays} days`);
  }
  if (appealDays !== null && appealDays < 0) {
    urgency = "CRITICAL";
    urgencyReasons.push(`Appeal deadline passed ${Math.abs(appealDays)} days ago`);
  }
  if (permitDays !== null && permitDays >= 0 && permitDays < 30 && urgency !== "CRITICAL") {
    urgency = "HIGH";
    urgencyReasons.push(`Permit expires in ${permitDays} days`);
  }
  if (snapshot?.riskLevel === "CRITICAL" && urgency !== "CRITICAL") {
    urgency = "CRITICAL";
    urgencyReasons.push("Risk level is CRITICAL");
  }
  if (snapshot?.riskLevel === "HIGH" && urgency === "LOW") {
    urgency = "HIGH";
    urgencyReasons.push("Risk level is HIGH");
  }
  if (snapshot?.legalStatus === "EXPIRED_NOT_PROTECTED") {
    urgency = "CRITICAL";
    urgencyReasons.push("Legal status: EXPIRED_NOT_PROTECTED");
  }
  if (urgencyReasons.length === 0) {
    urgencyReasons.push("No immediate urgency detected");
  }

  // Next deadline
  const deadlines = timeline
    .filter(e => e.type === "deadline" && new Date(e.date) > now)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const nextDeadline = deadlines[0];

  // ── Relevant articles from previous research ─────────────────────────────
  const articleRows = await query<Record<string, unknown>>(
    `SELECT title, article_ref FROM law_articles
     WHERE tenant_id = $1 AND article_ref IS NOT NULL
     ORDER BY created_at DESC LIMIT 10`,
    [tenantId],
  ).catch(() => [] as any[]);

  const relevantArticles = articleRows.map((a: any) => ({
    article: a.article_ref ?? "",
    title: a.title ?? "",
  }));

  return {
    workerId,
    workerName: w.name ?? "—",
    legalCardFacts,
    legalStatus: snapshot?.legalStatus ?? "UNKNOWN",
    legalBasis: snapshot?.legalBasis ?? "UNKNOWN",
    riskLevel: snapshot?.riskLevel ?? "UNKNOWN",
    conditions: snapshot?.conditions ?? [],
    warnings: snapshot?.warnings ?? [],
    requiredActions: snapshot?.requiredActions ?? [],
    activeCase,
    timeline,
    urgency,
    urgencyReasons,
    daysUntilNextDeadline: nextDeadline ? daysUntil(nextDeadline.date) : null,
    nextDeadlineLabel: nextDeadline?.title ?? null,
    relevantArticles,
    generatedAt: now.toISOString(),
  };
}
