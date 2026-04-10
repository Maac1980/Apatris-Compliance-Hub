/**
 * Cross-System Worker Validation Service
 *
 * Deterministic consistency checker across ALL Apatris subsystems:
 *  1. Legal Engine (source of truth)
 *  2. Action Engine (suggested actions)
 *  3. Rejection Intelligence (rejection analyses)
 *  4. Legal Queue (queue priority)
 *  5. Worker-Safe View (public output)
 *  6. Predictive Risk (risk forecast)
 *  7. Worker Record (base data)
 *  8. Legal Cases (case status)
 *  9. Document Intake (pending documents)
 *
 * NO AI — purely deterministic rule checks.
 * NO overrides — reports mismatches, never changes data.
 */

import { query, queryOne } from "../lib/db.js";
import { getWorkerLegalSnapshot, type LegalSnapshot } from "./legal-status.service.js";
import { getWorkerActions, type WorkerActionsResult } from "./action-engine.service.js";
import { getAnalysesByWorker, type RejectionAnalysis } from "./rejection-intelligence.service.js";
import { getWorkerRiskForecast, type WorkerRiskForecast } from "./predictive-risk.service.js";
import { getWorkerLegalView, type WorkerLegalView } from "./worker-legal-view.service.js";

// ═══ TYPES ══════════════════════════════════════════════════════════════════

export type MismatchSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type OverallRisk = "GREEN" | "YELLOW" | "RED" | "CRITICAL";

export interface Mismatch {
  systemA: string;
  systemB: string;
  field: string;
  valueA: string | null;
  valueB: string | null;
  severity: MismatchSeverity;
  explanation: string;
  suggestedFix: string;
}

export interface SubsystemStatus {
  name: string;
  available: boolean;
  error: string | null;
  keyData: Record<string, any>;
}

export interface ValidationResult {
  workerId: string;
  workerName: string;
  validatedAt: string;
  overallStatus: "CONSISTENT" | "WARNINGS" | "MISMATCHES" | "CRITICAL_MISMATCH";
  riskLevel: OverallRisk;
  confidence: number;
  requiresReview: boolean;
  mismatches: Mismatch[];
  subsystems: SubsystemStatus[];
  summary: string;
  reasoning: string[];
  suggestedFixes: string[];
  checksRun: number;
  checksPassed: number;
}

// ═══ MAIN VALIDATION FUNCTION ═══════════════════════════════════════════════

export async function validateWorker(workerId: string, tenantId: string): Promise<ValidationResult> {
  const validatedAt = new Date().toISOString();
  const mismatches: Mismatch[] = [];
  const reasoning: string[] = [];
  const subsystems: SubsystemStatus[] = [];
  let checksRun = 0;
  let checksPassed = 0;

  // ── Load all subsystem data ───────────────────────────────────────────

  // 1. Worker record (base)
  const worker = await queryOne<any>(
    "SELECT id, full_name, trc_expiry, passport_expiry, work_permit_expiry, bhp_expiry, contract_end_date, medical_exam_expiry, nationality, pesel, assigned_site FROM workers WHERE id = $1 AND tenant_id = $2",
    [workerId, tenantId]
  );
  if (!worker) throw new Error("Worker not found");
  subsystems.push({ name: "Worker Record", available: true, error: null, keyData: { name: worker.full_name, trc_expiry: worker.trc_expiry, work_permit_expiry: worker.work_permit_expiry } });

  // 2. Legal snapshot
  let snapshot: LegalSnapshot | null = null;
  try {
    snapshot = await getWorkerLegalSnapshot(workerId, tenantId);
    subsystems.push({ name: "Legal Engine", available: true, error: null, keyData: { status: snapshot.legalStatus, basis: snapshot.legalBasis, risk: snapshot.riskLevel } });
  } catch (err) {
    subsystems.push({ name: "Legal Engine", available: false, error: err instanceof Error ? err.message : "Failed", keyData: {} });
  }

  // 3. Action engine
  let actions: WorkerActionsResult | null = null;
  try {
    actions = await getWorkerActions(workerId, tenantId);
    subsystems.push({ name: "Action Engine", available: true, error: null, keyData: { actionCount: actions.actions.length, legalStatus: actions.legalStatus, riskLevel: actions.riskLevel } });
  } catch (err) {
    subsystems.push({ name: "Action Engine", available: false, error: err instanceof Error ? err.message : "Failed", keyData: {} });
  }

  // 4. Rejection analyses
  let rejections: RejectionAnalysis[] = [];
  try {
    rejections = await getAnalysesByWorker(workerId, tenantId);
    subsystems.push({ name: "Rejection Intelligence", available: true, error: null, keyData: { count: rejections.length, latest: rejections[0]?.category ?? null } });
  } catch (err) {
    subsystems.push({ name: "Rejection Intelligence", available: false, error: err instanceof Error ? err.message : "Failed", keyData: {} });
  }

  // 5. Risk forecast
  let risk: WorkerRiskForecast | null = null;
  try {
    risk = await getWorkerRiskForecast(workerId, tenantId);
    subsystems.push({ name: "Predictive Risk", available: true, error: null, keyData: { riskCount: risk.predictedRisks.length, currentStatus: risk.currentStatus } });
  } catch (err) {
    subsystems.push({ name: "Predictive Risk", available: false, error: err instanceof Error ? err.message : "Failed", keyData: {} });
  }

  // 6. Worker-safe view
  let workerView: WorkerLegalView | null = null;
  try {
    workerView = await getWorkerLegalView(workerId, tenantId);
    subsystems.push({ name: "Worker-Safe View", available: true, error: null, keyData: { label: workerView.statusLabel, color: workerView.statusColor } });
  } catch (err) {
    subsystems.push({ name: "Worker-Safe View", available: false, error: err instanceof Error ? err.message : "Failed", keyData: {} });
  }

  // 7. Legal cases
  const legalCase = await queryOne<any>(
    "SELECT id, case_type, status, appeal_deadline, mos_status FROM legal_cases WHERE worker_id = $1 AND tenant_id = $2 ORDER BY created_at DESC LIMIT 1",
    [workerId, tenantId]
  ).catch(() => null);
  subsystems.push({ name: "Legal Cases", available: true, error: null, keyData: { caseStatus: legalCase?.status ?? "NONE", caseType: legalCase?.case_type ?? null } });

  // 8. Pending document intakes
  const pendingIntakes = await query<any>(
    "SELECT id, ai_classification, status, urgency_score FROM document_intake WHERE matched_worker_id = $1 AND tenant_id = $2 AND status IN ('PENDING_REVIEW','MANUAL_REQUIRED') ORDER BY urgency_score DESC",
    [workerId, tenantId]
  ).catch(() => []);
  subsystems.push({ name: "Document Intake", available: true, error: null, keyData: { pendingCount: pendingIntakes.length } });

  // ── Run Consistency Checks ────────────────────────────────────────────

  // CHECK 1: Legal status consistency between Legal Engine and Action Engine
  if (snapshot && actions) {
    checksRun++;
    if (snapshot.legalStatus !== actions.legalStatus) {
      mismatches.push({
        systemA: "Legal Engine", systemB: "Action Engine", field: "legalStatus",
        valueA: snapshot.legalStatus, valueB: actions.legalStatus,
        severity: "HIGH",
        explanation: `Legal Engine says "${snapshot.legalStatus}" but Action Engine says "${actions.legalStatus}"`,
        suggestedFix: "Refresh legal snapshot to sync both systems",
      });
    } else {
      checksPassed++;
      reasoning.push(`Legal status consistent: ${snapshot.legalStatus}`);
    }
  }

  // CHECK 2: Risk level consistency
  if (snapshot && actions) {
    checksRun++;
    if (snapshot.riskLevel !== actions.riskLevel) {
      mismatches.push({
        systemA: "Legal Engine", systemB: "Action Engine", field: "riskLevel",
        valueA: snapshot.riskLevel, valueB: actions.riskLevel,
        severity: "MEDIUM",
        explanation: `Risk level differs: Legal Engine "${snapshot.riskLevel}" vs Action Engine "${actions.riskLevel}"`,
        suggestedFix: "Risk levels should derive from same snapshot — check for stale cache",
      });
    } else { checksPassed++; }
  }

  // CHECK 3: Risk level vs Predictive Risk
  if (snapshot && risk) {
    checksRun++;
    const criticalRisks = risk.predictedRisks.filter(r => r.severity === "CRITICAL");
    if (snapshot.riskLevel === "LOW" && criticalRisks.length > 0) {
      mismatches.push({
        systemA: "Legal Engine", systemB: "Predictive Risk", field: "riskLevel",
        valueA: snapshot.riskLevel, valueB: `${criticalRisks.length} CRITICAL risks predicted`,
        severity: "HIGH",
        explanation: "Legal Engine shows LOW risk but Predictive Risk has CRITICAL items — snapshot may be stale",
        suggestedFix: "Refresh legal snapshot; predictive risk sees upcoming expiry that snapshot may not reflect",
      });
    } else { checksPassed++; }
  }

  // CHECK 4: Worker-safe view matches legal status
  if (snapshot && workerView) {
    checksRun++;
    const expectedColorMap: Record<string, string> = {
      VALID: "green", EXPIRING_SOON: "amber", PROTECTED_PENDING: "blue",
      REVIEW_REQUIRED: "amber", EXPIRED_NOT_PROTECTED: "red", NO_PERMIT: "red",
    };
    const expectedColor = expectedColorMap[snapshot.legalStatus] ?? "gray";
    if (workerView.statusColor !== expectedColor) {
      mismatches.push({
        systemA: "Legal Engine", systemB: "Worker-Safe View", field: "statusColor",
        valueA: `${snapshot.legalStatus} → expected "${expectedColor}"`, valueB: workerView.statusColor,
        severity: "MEDIUM",
        explanation: `Worker sees "${workerView.statusLabel}" (${workerView.statusColor}) but legal status is ${snapshot.legalStatus} (expected ${expectedColor})`,
        suggestedFix: "Worker-safe view may have stale data — refresh worker legal view",
      });
    } else { checksPassed++; reasoning.push(`Worker-safe view color matches: ${workerView.statusColor}`); }
  }

  // CHECK 5: Action engine produces correct action types for status
  if (snapshot && actions) {
    checksRun++;
    const hasUrgentAction = actions.actions.some(a => a.priority === "CRITICAL");
    const needsUrgent = ["EXPIRED_NOT_PROTECTED", "NO_PERMIT"].includes(snapshot.legalStatus);
    if (needsUrgent && !hasUrgentAction) {
      mismatches.push({
        systemA: "Legal Engine", systemB: "Action Engine", field: "urgentActions",
        valueA: snapshot.legalStatus, valueB: `No CRITICAL actions (${actions.actions.length} total)`,
        severity: "CRITICAL",
        explanation: `Worker is ${snapshot.legalStatus} but Action Engine has no CRITICAL actions — worker may be unprotected without urgent intervention`,
        suggestedFix: "Action engine should generate CRITICAL urgency actions for expired/unprotected workers",
      });
    } else { checksPassed++; }
  }

  // CHECK 6: Rejection analysis vs legal case status
  if (rejections.length > 0 && legalCase) {
    checksRun++;
    const hasRecentRejection = rejections.some(r => {
      const age = (Date.now() - new Date(r.created_at).getTime()) / 86400000;
      return age < 30;
    });
    if (hasRecentRejection && legalCase.status === "APPROVED") {
      mismatches.push({
        systemA: "Rejection Intelligence", systemB: "Legal Cases", field: "caseStatus",
        valueA: `Recent rejection analysis exists`, valueB: `Case status: APPROVED`,
        severity: "HIGH",
        explanation: "A rejection analysis exists for this worker but the legal case shows APPROVED — possible data conflict",
        suggestedFix: "Verify if the rejection was for a different case, or if the case status needs correction",
      });
    } else { checksPassed++; }
  }

  // CHECK 7: Rejection with appeal_possible but no appeal action
  if (rejections.length > 0 && actions) {
    checksRun++;
    const appealableRejection = rejections.find(r => r.appeal_possible);
    const hasAppealAction = actions.actions.some(a => a.title?.toLowerCase().includes("appeal"));
    if (appealableRejection && !hasAppealAction) {
      mismatches.push({
        systemA: "Rejection Intelligence", systemB: "Action Engine", field: "appealAction",
        valueA: `Appealable rejection: ${appealableRejection.category}`, valueB: "No appeal action suggested",
        severity: "HIGH",
        explanation: "Rejection analysis says appeal is possible but Action Engine doesn't suggest an appeal action",
        suggestedFix: "Generate appeal preparation actions for this worker",
      });
    } else { checksPassed++; }
  }

  // CHECK 8: Legal case status vs legal snapshot status
  if (legalCase && snapshot) {
    checksRun++;
    if (legalCase.status === "REJECTED" && snapshot.legalStatus === "VALID") {
      mismatches.push({
        systemA: "Legal Cases", systemB: "Legal Engine", field: "status",
        valueA: `Case REJECTED`, valueB: `Legal status VALID`,
        severity: "HIGH",
        explanation: "Legal case is REJECTED but legal snapshot shows VALID — the snapshot may not reflect the rejection yet",
        suggestedFix: "Refresh legal snapshot to incorporate rejection outcome",
      });
    } else if (legalCase.status === "APPROVED" && snapshot.legalStatus === "EXPIRED_NOT_PROTECTED") {
      mismatches.push({
        systemA: "Legal Cases", systemB: "Legal Engine", field: "status",
        valueA: `Case APPROVED`, valueB: `Legal status EXPIRED_NOT_PROTECTED`,
        severity: "CRITICAL",
        explanation: "Legal case was APPROVED but worker shows as expired/unprotected — TRC expiry may not have been updated",
        suggestedFix: "Update worker's trc_expiry from the approved case decision",
      });
    } else { checksPassed++; }
  }

  // CHECK 9: Permit expiry in worker record vs snapshot
  if (snapshot && worker.trc_expiry) {
    checksRun++;
    const workerExpiry = String(worker.trc_expiry).slice(0, 10);
    const snapshotExpiry = snapshot.permitExpiresAt?.slice(0, 10) ?? null;
    if (snapshotExpiry && workerExpiry !== snapshotExpiry) {
      mismatches.push({
        systemA: "Worker Record", systemB: "Legal Engine", field: "trc_expiry",
        valueA: workerExpiry, valueB: snapshotExpiry,
        severity: "HIGH",
        explanation: `Worker record TRC expiry (${workerExpiry}) differs from legal snapshot (${snapshotExpiry})`,
        suggestedFix: "Refresh legal snapshot — it may be reading from a stale cache",
      });
    } else { checksPassed++; reasoning.push(`TRC expiry consistent: ${workerExpiry}`); }
  }

  // CHECK 10: Pending document intakes for expired worker
  if (snapshot) {
    checksRun++;
    const isExpired = ["EXPIRED_NOT_PROTECTED", "NO_PERMIT"].includes(snapshot.legalStatus);
    const hasFilingProof = pendingIntakes.some(i => ["UPO", "FILING_PROOF", "MOS_SUBMISSION"].includes(i.ai_classification));
    if (isExpired && hasFilingProof) {
      reasoning.push("IMPORTANT: Worker is expired but has pending filing proof in Document Intake — if confirmed, this could change legal status to PROTECTED_PENDING");
      // Not a mismatch — but important context
    }
    checksPassed++;
  }

  // CHECK 11: Appeal deadline vs current date
  if (legalCase?.appeal_deadline) {
    checksRun++;
    const daysLeft = Math.ceil((new Date(legalCase.appeal_deadline).getTime() - Date.now()) / 86400000);
    if (daysLeft < 0) {
      mismatches.push({
        systemA: "Legal Cases", systemB: "Current Date", field: "appeal_deadline",
        valueA: String(legalCase.appeal_deadline).slice(0, 10), valueB: `${Math.abs(daysLeft)} days overdue`,
        severity: "CRITICAL",
        explanation: `Appeal deadline has passed ${Math.abs(daysLeft)} days ago — appeal window is closed`,
        suggestedFix: "Consult lawyer immediately for alternative remedies",
      });
    } else if (daysLeft <= 3) {
      reasoning.push(`URGENT: Appeal deadline in ${daysLeft} days — ${legalCase.appeal_deadline}`);
      checksPassed++;
    } else { checksPassed++; }
  }

  // CHECK 12: Worker-safe view must NOT contain legal jargon
  if (workerView) {
    checksRun++;
    const jargonPatterns = ["Art. 108", "CUKR", "Specustawa", "PESEL", "voivodeship", "legalBasis", "riskLevel", "PROTECTED_PENDING", "EXPIRED_NOT_PROTECTED"];
    const exposedJargon = jargonPatterns.filter(j =>
      workerView.explanation.includes(j) || workerView.whatHappensNext.includes(j) || (workerView.whatYouNeedToDo ?? "").includes(j)
    );
    if (exposedJargon.length > 0) {
      mismatches.push({
        systemA: "Worker-Safe View", systemB: "Safety Rules", field: "jargonExposure",
        valueA: exposedJargon.join(", "), valueB: "Should be stripped",
        severity: "MEDIUM",
        explanation: `Worker-facing text contains legal jargon: ${exposedJargon.join(", ")}`,
        suggestedFix: "Run simplifyForWorker() on all worker-facing text",
      });
    } else { checksPassed++; reasoning.push("Worker-safe view: no jargon detected"); }
  }

  // CHECK 13: Contradictory actions (case closed + pending appeal)
  if (legalCase && actions) {
    checksRun++;
    const caseApproved = legalCase.status === "APPROVED";
    const hasRenewalAction = actions.actions.some(a => a.title?.toLowerCase().includes("renewal") || a.title?.toLowerCase().includes("file"));
    if (caseApproved && hasRenewalAction) {
      mismatches.push({
        systemA: "Legal Cases", systemB: "Action Engine", field: "contradictoryAction",
        valueA: "Case APPROVED", valueB: "Still suggesting renewal/filing actions",
        severity: "LOW",
        explanation: "Case is approved but actions still suggest filing — may be stale actions from before approval",
        suggestedFix: "Clear stale actions after case approval",
      });
    } else { checksPassed++; }
  }

  // CHECK 14: Document expiry coherence (passport, BHP, medical)
  {
    checksRun++;
    const now = new Date();
    const expiredDocs: string[] = [];
    if (worker.passport_expiry && new Date(worker.passport_expiry) < now) expiredDocs.push("passport");
    if (worker.bhp_expiry && new Date(worker.bhp_expiry) < now) expiredDocs.push("BHP");
    if (worker.medical_exam_expiry && new Date(worker.medical_exam_expiry) < now) expiredDocs.push("medical");
    if (worker.work_permit_expiry && new Date(worker.work_permit_expiry) < now) expiredDocs.push("work_permit");

    if (expiredDocs.length > 0 && snapshot?.riskLevel === "LOW") {
      mismatches.push({
        systemA: "Worker Record", systemB: "Legal Engine", field: "expiryVsRisk",
        valueA: `Expired: ${expiredDocs.join(", ")}`, valueB: `Risk: LOW`,
        severity: "MEDIUM",
        explanation: `Worker has ${expiredDocs.length} expired document(s) but risk level is LOW — risk assessment may not consider all document types`,
        suggestedFix: "Verify if expired documents affect compliance status",
      });
    } else { checksPassed++; }
  }

  // CHECK 15: Filing date in snapshot vs evidence
  if (snapshot?.trcApplicationSubmitted) {
    checksRun++;
    const filingEvidence = pendingIntakes.filter(i => ["UPO", "FILING_PROOF", "MOS_SUBMISSION"].includes(i.ai_classification));
    if (filingEvidence.length === 0) {
      reasoning.push("Legal snapshot says TRC application submitted but no filing evidence found in Document Intake — evidence may be in a different system or not yet uploaded");
    }
    checksPassed++;
  }

  // ── Compute overall result ────────────────────────────────────────────

  const criticalCount = mismatches.filter(m => m.severity === "CRITICAL").length;
  const highCount = mismatches.filter(m => m.severity === "HIGH").length;

  let overallStatus: ValidationResult["overallStatus"];
  if (criticalCount > 0) overallStatus = "CRITICAL_MISMATCH";
  else if (highCount > 0) overallStatus = "MISMATCHES";
  else if (mismatches.length > 0) overallStatus = "WARNINGS";
  else overallStatus = "CONSISTENT";

  let riskLevel: OverallRisk;
  if (snapshot) {
    const riskMap: Record<string, OverallRisk> = { LOW: "GREEN", MEDIUM: "YELLOW", HIGH: "RED", CRITICAL: "CRITICAL" };
    riskLevel = riskMap[snapshot.riskLevel] ?? "YELLOW";
  } else {
    riskLevel = "YELLOW";
  }

  const confidence = checksRun > 0 ? checksPassed / checksRun : 0;
  const requiresReview = criticalCount > 0 || highCount > 0 || confidence < 0.7;

  const suggestedFixes = [...new Set(mismatches.map(m => m.suggestedFix))];

  const summary = overallStatus === "CONSISTENT"
    ? `Worker ${worker.full_name}: All ${checksRun} checks passed. Status: ${snapshot?.legalStatus ?? "unknown"}. Risk: ${riskLevel}.`
    : `Worker ${worker.full_name}: ${mismatches.length} mismatch(es) found across ${checksRun} checks. ${criticalCount} critical, ${highCount} high severity. Requires review.`;

  return {
    workerId,
    workerName: worker.full_name,
    validatedAt,
    overallStatus,
    riskLevel,
    confidence: Math.round(confidence * 100) / 100,
    requiresReview,
    mismatches,
    subsystems,
    summary,
    reasoning,
    suggestedFixes,
    checksRun,
    checksPassed,
  };
}
