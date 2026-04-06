/**
 * Legal Case Service — case-level tracking for TRC, appeals, PR, citizenship.
 *
 * Extends the snapshot system into a case management system.
 * On any status change, triggers refreshWorkerLegalSnapshot() to keep
 * the legal engine output current — but does NOT modify engine logic.
 */

import { query, queryOne, execute } from "../lib/db.js";
import { refreshWorkerLegalSnapshot } from "./legal-status.service.js";

// ═══ TYPES ══════════════════════════════════════════════════════════════════

export type CaseType = "TRC" | "APPEAL" | "PR" | "CITIZENSHIP";
export type CaseStatus = "NEW" | "PENDING" | "REJECTED" | "APPROVED";

export interface LegalCase {
  id: string;
  worker_id: string;
  tenant_id: string;
  case_type: CaseType;
  status: CaseStatus;
  appeal_deadline: string | null;
  next_action: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ═══ STATE LOGIC ════════════════════════════════════════════════════════════

function deriveStateFields(status: CaseStatus): { appealDeadline: string | null; nextAction: string } {
  switch (status) {
    case "NEW":
      return {
        appealDeadline: null,
        nextAction: "Prepare and submit case documents",
      };
    case "PENDING":
      return {
        appealDeadline: null,
        nextAction: "Awaiting decision from authority",
      };
    case "REJECTED":
      return {
        // 14-day appeal window from now
        appealDeadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        nextAction: "Review rejection and prepare appeal",
      };
    case "APPROVED":
      return {
        appealDeadline: null,
        nextAction: "Monitor next eligibility stage",
      };
  }
}

// ═══ SERVICE FUNCTIONS ══════════════════════════════════════════════════════

export async function createCase(
  workerId: string,
  tenantId: string,
  caseType: CaseType,
  notes?: string,
): Promise<LegalCase> {
  const { appealDeadline, nextAction } = deriveStateFields("NEW");

  const row = await queryOne<LegalCase>(
    `INSERT INTO legal_cases (worker_id, tenant_id, case_type, status, appeal_deadline, next_action, notes)
     VALUES ($1, $2, $3, 'NEW', $4, $5, $6) RETURNING *`,
    [workerId, tenantId, caseType, appealDeadline, nextAction, notes ?? null]
  );
  if (!row) throw new Error("Failed to create legal case");

  // Trigger snapshot refresh — case creation may affect legal state
  try { await refreshWorkerLegalSnapshot(workerId, tenantId); } catch { /* non-blocking */ }

  return row;
}

export async function updateCaseStatus(
  caseId: string,
  tenantId: string,
  newStatus: CaseStatus,
): Promise<LegalCase> {
  // Get current case to find worker_id
  const existing = await queryOne<LegalCase>(
    "SELECT * FROM legal_cases WHERE id = $1 AND tenant_id = $2",
    [caseId, tenantId]
  );
  if (!existing) throw new Error("Legal case not found");

  const { appealDeadline, nextAction } = deriveStateFields(newStatus);

  const updated = await queryOne<LegalCase>(
    `UPDATE legal_cases
     SET status = $1, appeal_deadline = $2, next_action = $3, updated_at = NOW()
     WHERE id = $4 AND tenant_id = $5 RETURNING *`,
    [newStatus, appealDeadline, nextAction, caseId, tenantId]
  );
  if (!updated) throw new Error("Failed to update legal case");

  // Trigger snapshot refresh — status change may affect legal protection
  try { await refreshWorkerLegalSnapshot(existing.worker_id, tenantId); } catch { /* non-blocking */ }

  return updated;
}

export async function getCasesByWorker(
  workerId: string,
  tenantId: string,
): Promise<LegalCase[]> {
  return query<LegalCase>(
    "SELECT * FROM legal_cases WHERE worker_id = $1 AND tenant_id = $2 ORDER BY created_at DESC",
    [workerId, tenantId]
  );
}

export async function getActiveCases(tenantId: string): Promise<LegalCase[]> {
  return query<LegalCase>(
    "SELECT * FROM legal_cases WHERE tenant_id = $1 AND status IN ('NEW','PENDING','REJECTED') ORDER BY created_at DESC",
    [tenantId]
  );
}

export async function getUrgencyQueue(tenantId: string): Promise<LegalCase[]> {
  return query<LegalCase>(
    `SELECT * FROM legal_cases
     WHERE tenant_id = $1 AND status IN ('NEW','PENDING','REJECTED')
     ORDER BY
       appeal_deadline ASC NULLS LAST,
       created_at DESC`,
    [tenantId]
  );
}
