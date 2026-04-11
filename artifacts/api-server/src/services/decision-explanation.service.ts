/**
 * Decision Explanation Service — interprets existing system outputs into
 * structured, human-readable explanations.
 *
 * SAFETY: This service NEVER alters underlying decisions, confidence scores,
 * or legal determinations. It reads existing results and translates them.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type DecisionVerdict = "HALTED" | "WARNING" | "REQUIRES_REVIEW" | "PROCEED" | "ESCALATE";
export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface DecisionExplanation {
  decision: DecisionVerdict;
  confidence: number;              // 0–100
  summary: string;
  reasons: string[];
  missing_inputs: string[];
  contradictions: string[];
  next_actions: string[];
  severity: Severity;
  human_review_required: boolean;
}

// ─── Legal Brief Explanation ────────────────────────────────────────────────

interface LegalBriefInput {
  status: string;                           // "COMPLETE" | "HALTED" | "FAILED"
  haltedAt?: string | null;                 // e.g. "STAGE_3"
  haltReason?: string | null;
  overallConfidence?: number;               // 0-1
  isValid?: boolean;
  pressureLevel?: string;
  stage1?: any | null;
  stage2?: any | null;
  stage3?: any | null;
  stage4?: any | null;
  stage5?: any | null;
  stage6?: any | null;
  workerName?: string;
  hasRejectionText?: boolean;
}

export function explainLegalBriefDecision(input: LegalBriefInput): DecisionExplanation {
  const reasons: string[] = [];
  const missing: string[] = [];
  const contradictions: string[] = [];
  const nextActions: string[] = [];
  let decision: DecisionVerdict = "PROCEED";
  let severity: Severity = "LOW";
  let humanReview = true; // legal briefs always require review
  const confidence = Math.round((input.overallConfidence ?? 0) * 100);

  // ── HALTED ──
  if (input.status === "HALTED" || input.status === "FAILED") {
    decision = "HALTED";
    severity = "CRITICAL";

    if (input.haltReason) {
      reasons.push(input.haltReason);
    }

    if (input.haltedAt === "STAGE_3" && input.stage3) {
      reasons.push("Stage 3 validation detected issues that prevent safe continuation.");
      const issues = input.stage3.issues ?? [];
      for (const issue of issues) {
        if (issue.severity === "CRITICAL" || issue.severity === "HIGH") {
          reasons.push(`${issue.severity}: ${issue.description}`);
        }
      }
      if (input.stage3.riskLevel) {
        reasons.push(`Validation risk level: ${input.stage3.riskLevel}`);
      }
    }

    if (!input.stage1) {
      missing.push("legal research (Stage 1 did not complete)");
    }
    if (!input.stage2) {
      missing.push("case review (Stage 2 did not complete)");
    }

    nextActions.push("Review the validation issues listed above");
    nextActions.push("Correct the underlying data and regenerate");
    nextActions.push("Escalate to a lawyer if issues cannot be resolved in-system");
    return { decision, confidence, summary: buildSummary(decision, input.workerName), reasons, missing_inputs: missing, contradictions, next_actions: nextActions, severity, human_review_required: humanReview };
  }

  // ── Check no-rejection context (low confidence path) ──
  if (input.hasRejectionText === false) {
    reasons.push("No rejection decision text was provided. Appeal grounds cannot be assessed and confidence is capped.");
    missing.push("rejection decision text");
    nextActions.push("Paste the full rejection decision text");
    nextActions.push("Send to lawyer for manual review if urgent");
    if (decision === "PROCEED") decision = "WARNING";
    if (severity === "LOW") severity = "MEDIUM";
  }

  // ── Stage 2 missing evidence ──
  if (input.stage2?.missingEvidence?.length) {
    for (const ev of input.stage2.missingEvidence) {
      missing.push(ev);
    }
    if (missing.length > 2 && severity === "LOW") severity = "MEDIUM";
  }

  // ── Stage 2 empty appeal grounds when rejection present ──
  if (input.hasRejectionText && input.stage2?.appealGrounds?.length === 0) {
    contradictions.push("Rejection text was provided but no appeal grounds were identified. The text may be incomplete or unrelated.");
  }

  // ── Stage 3 validation warnings (non-halt) ──
  if (input.stage3?.issues?.length) {
    const highIssues = input.stage3.issues.filter((i: any) => i.severity === "HIGH");
    if (highIssues.length > 0) {
      decision = "REQUIRES_REVIEW";
      severity = bumped(severity, "HIGH");
      for (const hi of highIssues) {
        reasons.push(`Validation warning: ${hi.description}`);
      }
    }
    // Check for contradictions
    for (const issue of input.stage3.issues) {
      if (issue.type === "MISMATCH" || issue.type === "INCONSISTENT_ACTION") {
        contradictions.push(issue.description);
      }
    }
  }

  // ── Confidence check ──
  if (confidence < 40) {
    if (decision === "PROCEED") decision = "WARNING";
    severity = bumped(severity, "HIGH");
    reasons.push(`Overall confidence is very low (${confidence}%). Output should not be relied on without lawyer review.`);
  } else if (confidence < 60) {
    if (decision === "PROCEED") decision = "REQUIRES_REVIEW";
    reasons.push(`Confidence is moderate (${confidence}%). Human review is essential before any action.`);
  }

  // ── Pressure level ──
  if (input.pressureLevel === "CRITICAL") {
    severity = "CRITICAL";
    if (decision === "PROCEED" || decision === "WARNING") decision = "ESCALATE";
    reasons.push("Time pressure is CRITICAL. Immediate action required to avoid missing deadlines.");
  } else if (input.pressureLevel === "HIGH") {
    severity = bumped(severity, "HIGH");
    reasons.push("Time pressure is HIGH. Action should be taken within days.");
  }

  // ── Stage 4 deadline info ──
  if (input.stage4?.daysUntilDeadline !== null && input.stage4?.daysUntilDeadline !== undefined) {
    const days = input.stage4.daysUntilDeadline;
    if (days <= 0) {
      nextActions.unshift("URGENT: Appeal deadline has passed. Consult lawyer immediately about reinstatement options.");
    } else if (days <= 3) {
      nextActions.unshift(`URGENT: Only ${days} day(s) until appeal deadline. File immediately.`);
    } else if (days <= 7) {
      nextActions.unshift(`Appeal deadline in ${days} days. Prepare and file appeal promptly.`);
    }
  }

  // ── Default next actions ──
  if (nextActions.length === 0) {
    if (decision === "PROCEED") {
      nextActions.push("Review the generated brief with a legal professional before acting on it");
    } else {
      nextActions.push("Address the issues listed above before proceeding");
      nextActions.push("Consult a lawyer if the situation is unclear");
    }
  }

  return {
    decision, confidence,
    summary: buildSummary(decision, input.workerName),
    reasons, missing_inputs: missing, contradictions, next_actions: nextActions,
    severity, human_review_required: humanReview,
  };
}

// ─── Case Decision Explanation ──────────────────────────────────────────────

interface CaseInput {
  // From OODA
  ooda?: {
    stage?: string;
    summary?: {
      worker?: string;
      observations?: string[];
      caseStatus?: string;
      caseType?: string | null;
      rejectionOnFile?: boolean;
      pendingIntakes?: number;
    };
    recommendations?: Array<{
      action: string;
      reason: string;
      urgency: string;
      requiresHumanReview?: boolean;
      confidence?: number;
    }>;
  };
  // From Case Intelligence
  intelligence?: {
    readiness?: string;
    readinessReason?: string;
    completenessScore?: number;
    overallRiskLevel?: string;
    risks?: Array<{ severity: string; description: string; field?: string }>;
    nextActions?: Array<{ priority: number; action: string; systemRoute?: string }>;
    documentsStatus?: Array<{ label: string; required: boolean; present: boolean; expired?: boolean }>;
  };
  // From Legal Status
  legalStatus?: {
    legalStatus?: string;
    legalBasis?: string;
    riskLevel?: string;
    warnings?: string[];
    requiredActions?: string[];
    conditions?: string[];
  };
  workerName?: string;
}

export function explainCaseDecision(input: CaseInput): DecisionExplanation {
  const reasons: string[] = [];
  const missing: string[] = [];
  const contradictions: string[] = [];
  const nextActions: string[] = [];
  let decision: DecisionVerdict = "PROCEED";
  let severity: Severity = "LOW";
  let humanReview = false;
  let confidence = 50;

  const ls = input.legalStatus;
  const intel = input.intelligence;
  const ooda = input.ooda;

  // ── Legal Status interpretation ──
  if (ls) {
    if (ls.legalStatus === "EXPIRED_NOT_PROTECTED") {
      decision = "ESCALATE";
      severity = "CRITICAL";
      humanReview = true;
      reasons.push("Worker's permit has expired and no legal protection (Art. 108 / CUKR) applies.");
      if (ls.legalBasis === "NO_LEGAL_BASIS") {
        reasons.push("There is currently no legal basis for this worker to remain employed.");
      }
    } else if (ls.legalStatus === "REVIEW_REQUIRED") {
      decision = "REQUIRES_REVIEW";
      severity = bumped(severity, "HIGH");
      humanReview = true;
      reasons.push("Legal status could not be fully determined. Manual review is required.");
    } else if (ls.legalStatus === "EXPIRING_SOON") {
      decision = "WARNING";
      severity = bumped(severity, "MEDIUM");
      reasons.push("Worker's permit is expiring soon. Renewal process should begin immediately.");
    } else if (ls.legalStatus === "PROTECTED_PENDING") {
      reasons.push("Worker is protected under pending application. Continuity conditions must be maintained.");
      if (ls.conditions?.length) {
        for (const c of ls.conditions) reasons.push(`Condition: ${c}`);
      }
    }

    if (ls.warnings?.length) {
      for (const w of ls.warnings) reasons.push(w);
    }
    if (ls.requiredActions?.length) {
      for (const a of ls.requiredActions) nextActions.push(a);
    }
  }

  // ── Case Intelligence interpretation ──
  if (intel) {
    if (intel.overallRiskLevel === "CRITICAL") {
      severity = "CRITICAL";
      if (decision === "PROCEED" || decision === "WARNING") decision = "ESCALATE";
      humanReview = true;
    } else if (intel.overallRiskLevel === "HIGH") {
      severity = bumped(severity, "HIGH");
      if (decision === "PROCEED") decision = "REQUIRES_REVIEW";
      humanReview = true;
    }

    if (intel.readiness === "NOT_READY") {
      reasons.push(`Case readiness: NOT READY. ${intel.readinessReason ?? "Critical documents are missing."}`);
    } else if (intel.readiness === "IN_PROGRESS") {
      reasons.push(`Case readiness: IN PROGRESS (${intel.completenessScore ?? 0}% complete). ${intel.readinessReason ?? ""}`);
    }

    // Missing required documents
    if (intel.documentsStatus) {
      for (const doc of intel.documentsStatus) {
        if (doc.required && !doc.present) {
          missing.push(doc.label);
        }
        if (doc.expired) {
          contradictions.push(`${doc.label} is present but expired`);
        }
      }
    }

    // Risks
    if (intel.risks) {
      for (const risk of intel.risks) {
        if (risk.severity === "CRITICAL" || risk.severity === "HIGH") {
          reasons.push(`${risk.severity} risk: ${risk.description}`);
        }
      }
    }

    // Next actions from intelligence
    if (intel.nextActions) {
      for (const na of intel.nextActions.sort((a, b) => a.priority - b.priority).slice(0, 5)) {
        nextActions.push(na.action);
      }
    }

    confidence = Math.min(95, Math.max(20, intel.completenessScore ?? 50));
  }

  // ── OODA recommendations ──
  if (ooda?.recommendations?.length) {
    const critRecs = ooda.recommendations.filter(r => r.urgency === "CRITICAL");
    if (critRecs.length > 0) {
      if (decision !== "HALTED") decision = "ESCALATE";
      severity = "CRITICAL";
      humanReview = true;
      for (const r of critRecs) {
        reasons.push(`${r.reason}`);
        nextActions.unshift(r.action);
      }
    }

    const highRecs = ooda.recommendations.filter(r => r.urgency === "HIGH");
    for (const r of highRecs) {
      reasons.push(r.reason);
      nextActions.push(r.action);
    }

    if (ooda.recommendations.some(r => r.requiresHumanReview)) {
      humanReview = true;
    }

    // Average confidence from OODA
    const confValues = ooda.recommendations.filter(r => r.confidence != null).map(r => r.confidence!);
    if (confValues.length > 0) {
      confidence = Math.round(confValues.reduce((a, b) => a + b, 0) / confValues.length);
    }
  }

  // ── Cross-check contradictions ──
  if (ls?.legalStatus === "VALID" && intel?.overallRiskLevel === "CRITICAL") {
    contradictions.push("Legal status shows VALID but case intelligence indicates CRITICAL risk. The permit may be valid but other documents are critically deficient.");
  }
  if (ls?.legalStatus === "PROTECTED_PENDING" && intel?.readiness === "NOT_READY") {
    contradictions.push("Worker is protected under pending application, but the case is NOT READY for submission. Protection may lapse if the application is deficient.");
  }

  if (nextActions.length === 0) {
    nextActions.push("Review current case status with a legal professional");
  }

  return {
    decision, confidence,
    summary: buildCaseSummary(decision, input.workerName, severity),
    reasons: dedup(reasons), missing_inputs: dedup(missing),
    contradictions: dedup(contradictions), next_actions: dedup(nextActions),
    severity, human_review_required: humanReview,
  };
}

// ─── Readiness Decision Explanation ─────────────────────────────────────────

interface ReadinessInput {
  workforce?: { total: number; blocked: number; deployable: number; expiringPermits: number; expiredPermits: number; expiringPassports?: number; expiringBHP?: number; expiringContracts?: number };
  cases?: { active: number; needingAction: number; rejected: number; overdueDeadline: number; approachingDeadline: number; pendingAppeals?: number };
  regulatory?: { criticalChanges: number; underReview: number; deploymentsPending: number; affectedWorkersTotal?: number };
  bottlenecks?: Array<{ issue: string; severity: string; count: number }>;
  topActions?: Array<{ action: string; urgency: string; count: number }>;
}

export function explainReadinessDecision(input: ReadinessInput): DecisionExplanation {
  const reasons: string[] = [];
  const missing: string[] = [];
  const contradictions: string[] = [];
  const nextActions: string[] = [];
  let decision: DecisionVerdict = "PROCEED";
  let severity: Severity = "LOW";
  let humanReview = false;
  let confidence = 90;

  const w = input.workforce;
  const c = input.cases;
  const r = input.regulatory;

  // ── Workforce ──
  if (w) {
    if (w.blocked > 0) {
      decision = "ESCALATE";
      severity = "CRITICAL";
      humanReview = true;
      reasons.push(`${w.blocked} worker(s) are currently blocked due to expired permits and cannot be deployed.`);
      nextActions.push(`Resolve ${w.blocked} expired permit(s) immediately`);
      confidence -= 10;
    }
    if (w.expiredPermits > 0) {
      reasons.push(`${w.expiredPermits} permit(s) have already expired.`);
    }
    if (w.expiringPermits > 0) {
      severity = bumped(severity, "MEDIUM");
      if (decision === "PROCEED") decision = "WARNING";
      reasons.push(`${w.expiringPermits} permit(s) expiring within 30 days.`);
      nextActions.push("Initiate renewal processes for expiring permits");
    }
    if ((w.expiringPassports ?? 0) > 0) {
      reasons.push(`${w.expiringPassports} passport(s) expiring within 30 days.`);
    }
    if ((w.expiringBHP ?? 0) > 0) {
      reasons.push(`${w.expiringBHP} BHP safety certificate(s) expiring within 30 days.`);
    }
    if ((w.expiringContracts ?? 0) > 0) {
      reasons.push(`${w.expiringContracts} contract(s) expiring within 30 days.`);
    }
    if (w.total > 0 && w.deployable === 0) {
      contradictions.push("Workforce exists but zero workers are currently deployable.");
    }
  }

  // ── Cases ──
  if (c) {
    if (c.overdueDeadline > 0) {
      decision = "ESCALATE";
      severity = "CRITICAL";
      humanReview = true;
      reasons.push(`${c.overdueDeadline} case(s) have missed their appeal deadline.`);
      nextActions.unshift(`Handle ${c.overdueDeadline} overdue appeal deadline(s) immediately`);
      confidence -= 15;
    }
    if (c.approachingDeadline > 0) {
      severity = bumped(severity, "HIGH");
      reasons.push(`${c.approachingDeadline} case(s) have appeal deadlines within 7 days.`);
      nextActions.push("Prioritize cases with approaching deadlines");
    }
    if (c.rejected > 0) {
      reasons.push(`${c.rejected} case(s) have been rejected and need attention.`);
    }
    if ((c.pendingAppeals ?? 0) > 0) {
      reasons.push(`${c.pendingAppeals} pending appeal(s) in queue.`);
    }
  }

  // ── Regulatory ──
  if (r) {
    if (r.criticalChanges > 0) {
      severity = bumped(severity, "HIGH");
      if (decision === "PROCEED") decision = "WARNING";
      humanReview = true;
      reasons.push(`${r.criticalChanges} critical regulatory change(s) require attention.`);
      nextActions.push("Review critical regulatory updates");
    }
    if (r.deploymentsPending > 0) {
      reasons.push(`${r.deploymentsPending} approved regulatory update(s) pending deployment.`);
    }
    if ((r.affectedWorkersTotal ?? 0) > 0) {
      reasons.push(`${r.affectedWorkersTotal} worker(s) potentially affected by regulatory changes.`);
    }
  }

  // ── Bottlenecks ──
  if (input.bottlenecks?.length) {
    for (const b of input.bottlenecks) {
      if (b.severity === "CRITICAL") {
        severity = "CRITICAL";
        if (decision !== "ESCALATE") decision = "ESCALATE";
      }
    }
  }

  // ── Top actions ──
  if (input.topActions?.length) {
    for (const a of input.topActions.filter(t => t.urgency === "CRITICAL")) {
      nextActions.unshift(a.action);
    }
  }

  if (reasons.length === 0) {
    reasons.push("All operational indicators are within normal parameters.");
  }
  if (nextActions.length === 0) {
    nextActions.push("Continue monitoring — no urgent actions required");
  }

  confidence = Math.max(10, Math.min(100, confidence));

  return {
    decision, confidence,
    summary: buildReadinessSummary(decision, severity),
    reasons: dedup(reasons), missing_inputs: missing,
    contradictions: dedup(contradictions), next_actions: dedup(nextActions),
    severity, human_review_required: humanReview,
  };
}

// ─── Regulatory Decision Explanation ────────────────────────────────────────

interface RegulatoryInput {
  update?: {
    id?: string;
    title?: string;
    status?: string;
    severity?: string;
    relevance_score?: number;
    update_type?: string;
  };
  impact?: {
    affected_modules?: string[];
    affected_workers_count?: number;
    requires_action?: boolean;
  };
  simulation?: {
    affected_workers_count?: number;
    risk_summary?: string;
  };
  reviewTasks?: Array<{
    task_status: string;
    review_type: string;
    due_date?: string;
  }>;
  deployment?: {
    deployment_status?: string;
    target_module?: string;
  };
  ooda?: {
    recommendations?: Array<{
      action: string;
      reason: string;
      urgency: string;
      requiresHumanReview?: boolean;
      confidence?: number;
    }>;
  };
}

export function explainRegulatoryDecision(input: RegulatoryInput): DecisionExplanation {
  const reasons: string[] = [];
  const missing: string[] = [];
  const contradictions: string[] = [];
  const nextActions: string[] = [];
  let decision: DecisionVerdict = "PROCEED";
  let severity: Severity = "LOW";
  let humanReview = false;
  let confidence = 70;

  const u = input.update;
  const imp = input.impact;

  // ── Update status interpretation ──
  if (u) {
    if (u.severity === "CRITICAL") {
      severity = "CRITICAL";
      decision = "ESCALATE";
      humanReview = true;
      reasons.push(`Regulatory update "${u.title ?? u.id}" is classified as CRITICAL severity.`);
    } else if (u.severity === "HIGH") {
      severity = bumped(severity, "HIGH");
      if (decision === "PROCEED") decision = "REQUIRES_REVIEW";
      humanReview = true;
      reasons.push(`Regulatory update is classified as HIGH severity.`);
    }

    if (u.status === "NEW" || u.status === "INGESTED") {
      reasons.push("Update has not yet been classified or reviewed.");
      missing.push("classification and human review");
      nextActions.push("Complete classification and impact assessment");
    } else if (u.status === "UNDER_REVIEW") {
      decision = decision === "PROCEED" ? "REQUIRES_REVIEW" : decision;
      reasons.push("Update is currently under human review.");
    } else if (u.status === "APPROVED_FOR_DEPLOYMENT") {
      reasons.push("Update has been approved and is ready for deployment.");
      nextActions.push("Execute deployment of approved regulatory changes");
    } else if (u.status === "REJECTED") {
      decision = "PROCEED";
      reasons.push("Update was reviewed and rejected as not applicable.");
    }

    if (u.relevance_score != null) {
      confidence = Math.round(u.relevance_score * 100);
    }
  }

  // ── Impact ──
  if (imp) {
    if (imp.requires_action) {
      if (decision === "PROCEED") decision = "REQUIRES_REVIEW";
      humanReview = true;
      reasons.push("Impact assessment indicates action is required.");
    }
    if (imp.affected_modules?.length) {
      reasons.push(`Affected system modules: ${imp.affected_modules.join(", ")}`);
    }
    if ((imp.affected_workers_count ?? 0) > 0) {
      reasons.push(`${imp.affected_workers_count} worker(s) potentially affected.`);
    }
  }

  // ── Simulation ──
  if (input.simulation) {
    if ((input.simulation.affected_workers_count ?? 0) > 10) {
      severity = bumped(severity, "HIGH");
      reasons.push(`Simulation shows ${input.simulation.affected_workers_count} workers would be affected.`);
    }
    if (input.simulation.risk_summary) {
      reasons.push(`Risk: ${input.simulation.risk_summary}`);
    }
  }

  // ── Review tasks ──
  if (input.reviewTasks?.length) {
    const overdue = input.reviewTasks.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.task_status === "PENDING");
    if (overdue.length > 0) {
      severity = bumped(severity, "HIGH");
      decision = "ESCALATE";
      humanReview = true;
      reasons.push(`${overdue.length} review task(s) are overdue.`);
      nextActions.unshift("Complete overdue review tasks");
    }
    const pending = input.reviewTasks.filter(t => t.task_status === "PENDING" || t.task_status === "IN_REVIEW");
    if (pending.length > 0) {
      reasons.push(`${pending.length} review task(s) still pending.`);
    }
  }

  // ── OODA recommendations ──
  if (input.ooda?.recommendations?.length) {
    for (const r of input.ooda.recommendations) {
      if (r.urgency === "CRITICAL" || r.urgency === "HIGH") {
        nextActions.push(r.action);
      }
      if (r.requiresHumanReview) humanReview = true;
    }
  }

  // ── Deployment status ──
  if (input.deployment) {
    if (input.deployment.deployment_status === "PLANNED") {
      nextActions.push(`Execute planned deployment for module: ${input.deployment.target_module ?? "unknown"}`);
    } else if (input.deployment.deployment_status === "ROLLED_BACK") {
      contradictions.push("Deployment was rolled back. The change did not take effect.");
      severity = bumped(severity, "HIGH");
    }
  }

  if (reasons.length === 0) {
    reasons.push("No regulatory concerns identified.");
  }
  if (nextActions.length === 0) {
    nextActions.push("No immediate action required");
  }

  confidence = Math.max(10, Math.min(100, confidence));

  return {
    decision, confidence,
    summary: buildRegulatorySummary(decision, u?.title),
    reasons: dedup(reasons), missing_inputs: dedup(missing),
    contradictions: dedup(contradictions), next_actions: dedup(nextActions),
    severity, human_review_required: humanReview,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const SEV_ORDER: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };

function bumped(current: Severity, candidate: Severity): Severity {
  return (SEV_ORDER[candidate] ?? 0) > (SEV_ORDER[current] ?? 0) ? candidate : current;
}

function dedup(arr: string[]): string[] {
  return [...new Set(arr)];
}

function buildSummary(decision: DecisionVerdict, workerName?: string): string {
  const who = workerName ? `for ${workerName}` : "";
  switch (decision) {
    case "HALTED": return `Legal brief pipeline ${who} was halted because critical validation issues were detected. The output cannot be used without resolving these issues.`.trim();
    case "ESCALATE": return `Legal brief ${who} requires immediate escalation due to time pressure or critical issues.`.trim();
    case "REQUIRES_REVIEW": return `Legal brief ${who} completed but contains issues that require human review before any action is taken.`.trim();
    case "WARNING": return `Legal brief ${who} completed with warnings. Key inputs may be missing or confidence is limited.`.trim();
    case "PROCEED": return `Legal brief ${who} completed successfully. Standard review by a legal professional is still required.`.trim();
  }
}

function buildCaseSummary(decision: DecisionVerdict, workerName?: string, severity?: Severity): string {
  const who = workerName ? `for ${workerName}` : "";
  switch (decision) {
    case "HALTED": return `Case assessment ${who} cannot proceed due to critical blockers.`.trim();
    case "ESCALATE": return `Case ${who} requires immediate escalation — ${severity === "CRITICAL" ? "critical legal risk detected" : "urgent action needed"}.`.trim();
    case "REQUIRES_REVIEW": return `Case ${who} has issues that require manual review before proceeding.`.trim();
    case "WARNING": return `Case ${who} has warnings that should be addressed.`.trim();
    case "PROCEED": return `Case ${who} is in acceptable condition. Continue with standard procedures.`.trim();
  }
}

function buildReadinessSummary(decision: DecisionVerdict, severity: Severity): string {
  switch (decision) {
    case "ESCALATE": return severity === "CRITICAL"
      ? "Operations readiness is critically impaired. Immediate action is required on blocked workers and overdue deadlines."
      : "Operations readiness requires escalation due to multiple high-severity issues.";
    case "REQUIRES_REVIEW": return "Operations readiness has issues that need review. Some workers or cases may be at risk.";
    case "WARNING": return "Operations readiness has warnings. Preventive action is recommended.";
    case "PROCEED": return "Operations readiness is within normal parameters. No urgent issues detected.";
    default: return "Operations readiness status could not be fully determined.";
  }
}

function buildRegulatorySummary(decision: DecisionVerdict, title?: string): string {
  const what = title ? ` regarding "${title}"` : "";
  switch (decision) {
    case "ESCALATE": return `Regulatory situation${what} requires immediate escalation.`;
    case "REQUIRES_REVIEW": return `Regulatory update${what} requires human review before proceeding.`;
    case "WARNING": return `Regulatory update${what} has been flagged for attention.`;
    case "PROCEED": return `Regulatory update${what} is proceeding normally.`;
    default: return `Regulatory situation${what} could not be fully assessed.`;
  }
}
