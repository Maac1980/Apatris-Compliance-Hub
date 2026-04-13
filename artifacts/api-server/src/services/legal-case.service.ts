/**
 * Legal Case Service — 8-stage case lifecycle for TRC, appeals, PR, citizenship.
 *
 * Stages: NEW → DOCS_PENDING → READY_TO_FILE → FILED → UNDER_REVIEW
 *         → DEFECT_NOTICE → DECISION_RECEIVED → APPROVED / REJECTED
 *
 * Hard blockers: prevent worker deployment (DEFECT_NOTICE, REJECTED while no appeal)
 * Soft blockers: warning only (UNDER_REVIEW > 90 days, DOCS_PENDING > 30 days)
 *
 * On any status change, triggers refreshWorkerLegalSnapshot() to keep
 * the legal engine output current — does NOT modify engine logic.
 */

import { query, queryOne, execute } from "../lib/db.js";
import { refreshWorkerLegalSnapshot } from "./legal-status.service.js";

// ═══ TYPES ══════════════════════════════════════════════════════════════════

export type CaseType = "TRC" | "APPEAL" | "PR" | "CITIZENSHIP";

export type CaseStatus =
  | "NEW"
  | "DOCS_PENDING"
  | "READY_TO_FILE"
  | "FILED"
  | "UNDER_REVIEW"
  | "DEFECT_NOTICE"
  | "DECISION_RECEIVED"
  | "APPROVED"
  | "REJECTED";

export type BlockerType = "HARD" | "SOFT" | "NONE";

export interface CaseBlocker {
  type: BlockerType;
  reason: string;
}

export interface LegalCase {
  id: string;
  worker_id: string;
  tenant_id: string;
  case_type: CaseType;
  status: CaseStatus;
  appeal_deadline: string | null;
  next_action: string | null;
  notes: string | null;
  blocker_type: BlockerType;
  blocker_reason: string | null;
  stage_entered_at: string;
  days_in_stage: number;
  sla_deadline: string | null;
  sla_breached: boolean;
  created_at: string;
  updated_at: string;
}

// ═══ ALL VALID STATUSES ════════════════════════════════════════════════════

export const ALL_STATUSES: CaseStatus[] = [
  "NEW", "DOCS_PENDING", "READY_TO_FILE", "FILED",
  "UNDER_REVIEW", "DEFECT_NOTICE", "DECISION_RECEIVED",
  "APPROVED", "REJECTED",
];

// ═══ VALID TRANSITIONS ═════════════════════════════════════════════════════

const VALID_TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
  NEW:               ["DOCS_PENDING"],
  DOCS_PENDING:      ["READY_TO_FILE", "NEW"],
  READY_TO_FILE:     ["FILED", "DOCS_PENDING"],
  FILED:             ["UNDER_REVIEW"],
  UNDER_REVIEW:      ["DEFECT_NOTICE", "DECISION_RECEIVED"],
  DEFECT_NOTICE:     ["UNDER_REVIEW", "REJECTED"],
  DECISION_RECEIVED: ["APPROVED", "REJECTED"],
  APPROVED:          [],
  REJECTED:          ["NEW"],  // restart cycle
};

// ═══ SLA DAYS PER STAGE ════════════════════════════════════════════════════

const SLA_DAYS: Partial<Record<CaseStatus, number>> = {
  NEW: 3,
  DOCS_PENDING: 14,
  READY_TO_FILE: 5,
  UNDER_REVIEW: 90,
  DEFECT_NOTICE: 14,
  DECISION_RECEIVED: 7,
};

// ═══ STATE LOGIC ════════════════════════════════════════════════════════════

function deriveStateFields(status: CaseStatus): {
  appealDeadline: string | null;
  nextAction: string;
  blocker: CaseBlocker;
  slaDays: number | null;
} {
  switch (status) {
    case "NEW":
      return {
        appealDeadline: null,
        nextAction: "Collect required documents from worker",
        blocker: { type: "NONE", reason: "" },
        slaDays: SLA_DAYS.NEW ?? null,
      };
    case "DOCS_PENDING":
      return {
        appealDeadline: null,
        nextAction: "Gather and verify all required documents",
        blocker: { type: "SOFT", reason: "Documents not yet collected — cannot file" },
        slaDays: SLA_DAYS.DOCS_PENDING ?? null,
      };
    case "READY_TO_FILE":
      return {
        appealDeadline: null,
        nextAction: "Submit application to voivodeship office / MOS portal",
        blocker: { type: "NONE", reason: "" },
        slaDays: SLA_DAYS.READY_TO_FILE ?? null,
      };
    case "FILED":
      return {
        appealDeadline: null,
        nextAction: "Confirm receipt (UPO) and await review",
        blocker: { type: "NONE", reason: "" },
        slaDays: null,
      };
    case "UNDER_REVIEW":
      return {
        appealDeadline: null,
        nextAction: "Awaiting decision from authority",
        blocker: { type: "NONE", reason: "" },
        slaDays: SLA_DAYS.UNDER_REVIEW ?? null,
      };
    case "DEFECT_NOTICE":
      return {
        appealDeadline: new Date(Date.now() + 14 * 86_400_000).toISOString(),
        nextAction: "Respond to defect notice within 14 days",
        blocker: { type: "HARD", reason: "Defect notice received — deployment blocked until resolved" },
        slaDays: SLA_DAYS.DEFECT_NOTICE ?? null,
      };
    case "DECISION_RECEIVED":
      return {
        appealDeadline: null,
        nextAction: "Review decision and update case outcome",
        blocker: { type: "SOFT", reason: "Decision received — review before deploying worker" },
        slaDays: SLA_DAYS.DECISION_RECEIVED ?? null,
      };
    case "REJECTED":
      return {
        appealDeadline: new Date(Date.now() + 14 * 86_400_000).toISOString(),
        nextAction: "Review rejection and prepare appeal within 14 days",
        blocker: { type: "HARD", reason: "Application rejected — worker cannot be deployed" },
        slaDays: null,
      };
    case "APPROVED":
      return {
        appealDeadline: null,
        nextAction: "Monitor next eligibility stage",
        blocker: { type: "NONE", reason: "" },
        slaDays: null,
      };
  }
}

// ═══ DEPLOYABILITY CHECK ════════════════════════════════════════════════════

export function getCaseBlocker(status: CaseStatus): CaseBlocker {
  return deriveStateFields(status).blocker;
}

export async function isWorkerDeployable(workerId: string, tenantId: string): Promise<{
  deployable: boolean;
  hardBlockers: Array<{ caseId: string; caseType: CaseType; reason: string }>;
  softBlockers: Array<{ caseId: string; caseType: CaseType; reason: string }>;
}> {
  const cases = await query<LegalCase>(
    "SELECT * FROM legal_cases WHERE worker_id = $1 AND tenant_id = $2 AND status NOT IN ('APPROVED')",
    [workerId, tenantId]
  );

  const hardBlockers: Array<{ caseId: string; caseType: CaseType; reason: string }> = [];
  const softBlockers: Array<{ caseId: string; caseType: CaseType; reason: string }> = [];

  for (const c of cases) {
    const blocker = getCaseBlocker(c.status);
    if (blocker.type === "HARD") {
      hardBlockers.push({ caseId: c.id, caseType: c.case_type, reason: blocker.reason });
    } else if (blocker.type === "SOFT") {
      softBlockers.push({ caseId: c.id, caseType: c.case_type, reason: blocker.reason });
    }
  }

  return { deployable: hardBlockers.length === 0, hardBlockers, softBlockers };
}

// ═══ SERVICE FUNCTIONS ══════════════════════════════════════════════════════

export async function createCase(
  workerId: string,
  tenantId: string,
  caseType: CaseType,
  notes?: string,
): Promise<LegalCase> {
  const { appealDeadline, nextAction, blocker, slaDays } = deriveStateFields("NEW");
  const slaDeadline = slaDays ? new Date(Date.now() + slaDays * 86_400_000).toISOString() : null;

  const row = await queryOne<LegalCase>(
    `INSERT INTO legal_cases (worker_id, tenant_id, case_type, status, appeal_deadline, next_action, notes,
       blocker_type, blocker_reason, stage_entered_at, sla_deadline)
     VALUES ($1, $2, $3, 'NEW', $4, $5, $6, $7, $8, NOW(), $9) RETURNING *,
       EXTRACT(EPOCH FROM (NOW() - stage_entered_at)) / 86400 AS days_in_stage,
       CASE WHEN sla_deadline IS NOT NULL AND NOW() > sla_deadline THEN true ELSE false END AS sla_breached`,
    [workerId, tenantId, caseType, appealDeadline, nextAction, notes ?? null,
     blocker.type, blocker.reason || null, slaDeadline]
  );
  if (!row) throw new Error("Failed to create legal case");

  try { await refreshWorkerLegalSnapshot(workerId, tenantId); } catch { /* non-blocking */ }

  return row;
}

export async function updateCaseStatus(
  caseId: string,
  tenantId: string,
  newStatus: CaseStatus,
): Promise<LegalCase> {
  const existing = await queryOne<LegalCase>(
    "SELECT * FROM legal_cases WHERE id = $1 AND tenant_id = $2",
    [caseId, tenantId]
  );
  if (!existing) throw new Error("Legal case not found");

  // Validate transition
  const allowed = VALID_TRANSITIONS[existing.status];
  if (!allowed?.includes(newStatus)) {
    throw new Error(`Invalid transition: ${existing.status} → ${newStatus}. Allowed: ${allowed?.join(", ") ?? "none"}`);
  }

  const { appealDeadline, nextAction, blocker, slaDays } = deriveStateFields(newStatus);
  const slaDeadline = slaDays ? new Date(Date.now() + slaDays * 86_400_000).toISOString() : null;

  const updated = await queryOne<LegalCase>(
    `UPDATE legal_cases
     SET status = $1, appeal_deadline = $2, next_action = $3, updated_at = NOW(),
         blocker_type = $4, blocker_reason = $5, stage_entered_at = NOW(), sla_deadline = $6
     WHERE id = $7 AND tenant_id = $8
     RETURNING *,
       EXTRACT(EPOCH FROM (NOW() - stage_entered_at)) / 86400 AS days_in_stage,
       CASE WHEN sla_deadline IS NOT NULL AND NOW() > sla_deadline THEN true ELSE false END AS sla_breached`,
    [newStatus, appealDeadline, nextAction, blocker.type, blocker.reason || null,
     slaDeadline, caseId, tenantId]
  );
  if (!updated) throw new Error("Failed to update legal case");

  try { await refreshWorkerLegalSnapshot(existing.worker_id, tenantId); } catch { /* non-blocking */ }

  // Log in case notebook (non-blocking)
  try {
    const { logStatusChange } = await import("./case-notebook.service.js");
    await logStatusChange(caseId, tenantId, existing.status, newStatus);
  } catch { /* non-blocking */ }

  if (newStatus === "REJECTED" || newStatus === "APPROVED") {
    try {
      const { syncLegalCaseToTrcCase } = await import("./case-sync.service.js");
      await syncLegalCaseToTrcCase(caseId, tenantId);
    } catch { /* non-blocking */ }
  }

  // Record in knowledge graph (non-blocking)
  try {
    const { recordCaseInGraph } = await import("./knowledge-graph.service.js");
    await recordCaseInGraph(tenantId, caseId, existing.worker_id, existing.case_type, newStatus);
  } catch { /* non-blocking */ }

  // Auto-generate AI document for this stage (non-blocking)
  try {
    const { generateDocumentForStage } = await import("./case-doc-generator.service.js");
    await generateDocumentForStage(caseId, tenantId, newStatus);
  } catch { /* non-blocking */ }

  return updated;
}

export async function getCasesByWorker(
  workerId: string,
  tenantId: string,
): Promise<LegalCase[]> {
  return query<LegalCase>(
    `SELECT *,
       EXTRACT(EPOCH FROM (NOW() - stage_entered_at)) / 86400 AS days_in_stage,
       CASE WHEN sla_deadline IS NOT NULL AND NOW() > sla_deadline THEN true ELSE false END AS sla_breached
     FROM legal_cases WHERE worker_id = $1 AND tenant_id = $2 ORDER BY created_at DESC`,
    [workerId, tenantId]
  );
}

export async function getActiveCases(tenantId: string): Promise<LegalCase[]> {
  return query<LegalCase>(
    `SELECT *,
       EXTRACT(EPOCH FROM (NOW() - stage_entered_at)) / 86400 AS days_in_stage,
       CASE WHEN sla_deadline IS NOT NULL AND NOW() > sla_deadline THEN true ELSE false END AS sla_breached
     FROM legal_cases
     WHERE tenant_id = $1 AND status NOT IN ('APPROVED')
     ORDER BY created_at DESC`,
    [tenantId]
  );
}

export async function getUrgencyQueue(tenantId: string): Promise<LegalCase[]> {
  return query<LegalCase>(
    `SELECT *,
       EXTRACT(EPOCH FROM (NOW() - stage_entered_at)) / 86400 AS days_in_stage,
       CASE WHEN sla_deadline IS NOT NULL AND NOW() > sla_deadline THEN true ELSE false END AS sla_breached
     FROM legal_cases
     WHERE tenant_id = $1 AND status NOT IN ('APPROVED')
     ORDER BY
       blocker_type = 'HARD' DESC,
       CASE WHEN sla_deadline IS NOT NULL AND NOW() > sla_deadline THEN 0 ELSE 1 END,
       appeal_deadline ASC NULLS LAST,
       created_at DESC`,
    [tenantId]
  );
}

export async function getCasePipelineCounts(tenantId: string): Promise<Record<CaseStatus, number>> {
  const rows = await query<{ status: CaseStatus; count: string }>(
    "SELECT status, COUNT(*) AS count FROM legal_cases WHERE tenant_id = $1 GROUP BY status",
    [tenantId]
  );
  const counts: Record<string, number> = {};
  for (const s of ALL_STATUSES) counts[s] = 0;
  for (const r of rows) counts[r.status] = Number(r.count);
  return counts as Record<CaseStatus, number>;
}
