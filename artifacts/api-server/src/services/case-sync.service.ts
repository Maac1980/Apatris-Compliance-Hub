/**
 * Case Sync Service — unifies TRC cases with legal cases.
 *
 * trc_cases = operational/process detail (documents, voivodeship, employer)
 * legal_cases = legal workflow/control layer (status, deadline, queue, authority packs)
 *
 * Linkage: legal_cases.trc_case_id → trc_cases.id
 *
 * Sync rules:
 *  - TRC status change → mapped to legal case status
 *  - Legal case status change → does NOT overwrite TRC status (TRC is operational)
 *  - No circular update loops (sync uses a flag to prevent re-entry)
 *  - Snapshot refresh triggered after meaningful changes
 */

import { query, queryOne, execute } from "../lib/db.js";
import { refreshWorkerLegalSnapshot } from "./legal-status.service.js";

// ═══ STATUS MAPPING ════════════════════════════════════════════════════════

type LegalCaseStatus = "NEW" | "PENDING" | "REJECTED" | "APPROVED";

/**
 * Maps TRC operational statuses to legal case statuses.
 * TRC statuses that don't map cleanly return null (no sync).
 */
const TRC_TO_LEGAL: Record<string, LegalCaseStatus | null> = {
  "intake":              "NEW",
  "Documents Gathering": "NEW",
  "submitted":           "PENDING",
  "Submitted":           "PENDING",
  "Under Review":        "PENDING",
  "formal_defect":       "PENDING",   // Still pending — defect doesn't mean rejected
  "Approved":            "APPROVED",
  "Rejected":            "REJECTED",
};

const LEGAL_TO_TRC: Record<string, string | null> = {
  "NEW":      null,         // Don't overwrite TRC operational status
  "PENDING":  null,         // TRC has richer pending states
  "REJECTED": "Rejected",   // Clear rejection syncs back
  "APPROVED": "Approved",   // Clear approval syncs back
};

// ═══ CORE SYNC FUNCTIONS ════════════════════════════════════════════════════

let _syncing = false; // Re-entry guard

/**
 * Sync TRC case → legal case.
 * Creates a linked legal_case if none exists, or updates status.
 */
export async function syncTrcCaseToLegalCase(trcCaseId: string, tenantId: string): Promise<{ legalCaseId: string; action: "created" | "updated" | "skipped" }> {
  if (_syncing) return { legalCaseId: "", action: "skipped" };
  _syncing = true;

  try {
    // Load TRC case
    const trc = await queryOne<any>(
      "SELECT * FROM trc_cases WHERE id = $1 AND tenant_id = $2::text",
      [trcCaseId, tenantId]
    );
    if (!trc) throw new Error("TRC case not found");
    if (!trc.worker_id) throw new Error("TRC case has no worker_id — cannot link");

    // Map TRC status to legal status
    const mappedStatus = TRC_TO_LEGAL[trc.status] ?? null;

    // Check if a linked legal case already exists
    let legalCase = await queryOne<any>(
      "SELECT * FROM legal_cases WHERE trc_case_id = $1 AND tenant_id = $2",
      [trcCaseId, tenantId]
    );

    if (!legalCase) {
      // Create new legal case linked to this TRC case
      const status = mappedStatus ?? "NEW";
      const { appealDeadline, nextAction } = deriveStateFields(status, trc);
      legalCase = await queryOne<any>(
        `INSERT INTO legal_cases (worker_id, tenant_id, case_type, status, trc_case_id, appeal_deadline, next_action, notes)
         VALUES ($1::uuid, $2, 'TRC', $3, $4, $5, $6, $7) RETURNING *`,
        [trc.worker_id, tenantId, status, trcCaseId, appealDeadline, nextAction,
         `Auto-linked from TRC case ${trcCaseId}`]
      );

      // Trigger snapshot refresh
      try { await refreshWorkerLegalSnapshot(trc.worker_id, tenantId); } catch { /* non-blocking */ }

      return { legalCaseId: legalCase.id, action: "created" };
    }

    // Update existing legal case if TRC status maps to a different legal status
    if (mappedStatus && legalCase.status !== mappedStatus) {
      const { appealDeadline, nextAction } = deriveStateFields(mappedStatus, trc);
      await execute(
        `UPDATE legal_cases SET status = $1, appeal_deadline = $2, next_action = $3, updated_at = NOW()
         WHERE id = $4 AND tenant_id = $5`,
        [mappedStatus, appealDeadline, nextAction, legalCase.id, tenantId]
      );

      // Trigger snapshot refresh
      try { await refreshWorkerLegalSnapshot(trc.worker_id, tenantId); } catch { /* non-blocking */ }

      return { legalCaseId: legalCase.id, action: "updated" };
    }

    return { legalCaseId: legalCase.id, action: "skipped" };
  } finally {
    _syncing = false;
  }
}

/**
 * Sync legal case → TRC case (limited — only clear outcomes).
 * Only syncs REJECTED and APPROVED back to TRC.
 */
export async function syncLegalCaseToTrcCase(legalCaseId: string, tenantId: string): Promise<{ trcCaseId: string | null; action: "updated" | "skipped" }> {
  if (_syncing) return { trcCaseId: null, action: "skipped" };
  _syncing = true;

  try {
    const legalCase = await queryOne<any>(
      "SELECT * FROM legal_cases WHERE id = $1 AND tenant_id = $2",
      [legalCaseId, tenantId]
    );
    if (!legalCase || !legalCase.trc_case_id) return { trcCaseId: null, action: "skipped" };

    const mappedTrcStatus = LEGAL_TO_TRC[legalCase.status] ?? null;
    if (!mappedTrcStatus) return { trcCaseId: legalCase.trc_case_id, action: "skipped" };

    // Only sync if TRC status is actually different
    const trc = await queryOne<any>(
      "SELECT status FROM trc_cases WHERE id = $1",
      [legalCase.trc_case_id]
    );
    if (!trc || trc.status === mappedTrcStatus) return { trcCaseId: legalCase.trc_case_id, action: "skipped" };

    await execute(
      "UPDATE trc_cases SET status = $1, updated_at = NOW() WHERE id = $2",
      [mappedTrcStatus, legalCase.trc_case_id]
    );

    return { trcCaseId: legalCase.trc_case_id, action: "updated" };
  } finally {
    _syncing = false;
  }
}

// ═══ BULK LINK — for existing orphaned TRC cases ═══════════════════════════

export async function linkOrphanedTrcCases(tenantId: string): Promise<{ linked: number; skipped: number }> {
  // Find TRC cases with no corresponding legal_case
  const orphans = await query<any>(
    `SELECT tc.id, tc.worker_id, tc.status, tc.notes
     FROM trc_cases tc
     WHERE tc.tenant_id = $1::text
     AND tc.worker_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM legal_cases lc WHERE lc.trc_case_id = tc.id
     )`,
    [tenantId]
  );

  let linked = 0;
  let skipped = 0;

  for (const trc of orphans) {
    try {
      // Verify worker_id is a valid UUID that exists
      const worker = await queryOne<any>(
        "SELECT id FROM workers WHERE id = $1::uuid AND tenant_id = $2",
        [trc.worker_id, tenantId]
      );
      if (!worker) { skipped++; continue; }

      await syncTrcCaseToLegalCase(trc.id, tenantId);
      linked++;
    } catch {
      skipped++;
    }
  }

  return { linked, skipped };
}

// ═══ READ: LINKED CASE VIEW ════════════════════════════════════════════════

export interface LinkedCaseView {
  legalCaseId: string;
  trcCaseId: string | null;
  workerId: string;
  workerName: string;
  // TRC detail
  trcStatus: string | null;
  trcCaseType: string | null;
  trcVoivodeship: string | null;
  trcEmployerName: string | null;
  trcStartDate: string | null;
  trcExpiryDate: string | null;
  // Legal detail
  legalStatus: string;
  legalCaseType: string;
  appealDeadline: string | null;
  nextAction: string | null;
  // Snapshot
  legalSnapshotStatus: string | null;
  legalBasis: string | null;
  riskLevel: string | null;
  // Pack
  authorityPackStatus: string | null;
  // Evidence
  evidenceCount: number;
  lastUpdated: string;
}

export async function getLinkedCaseView(legalCaseId: string, tenantId: string): Promise<LinkedCaseView | null> {
  const row = await queryOne<any>(`
    SELECT
      lc.id as legal_case_id, lc.trc_case_id, lc.worker_id, lc.case_type as legal_case_type,
      lc.status as legal_status, lc.appeal_deadline, lc.next_action, lc.updated_at as last_updated,
      w.full_name as worker_name,
      tc.status as trc_status, tc.case_type as trc_case_type, tc.voivodeship as trc_voivodeship,
      tc.employer_name as trc_employer_name, tc.start_date as trc_start_date, tc.expiry_date as trc_expiry_date,
      wls.legal_status as snapshot_status, wls.legal_basis, wls.risk_level,
      ap.pack_status as authority_pack_status
    FROM legal_cases lc
    JOIN workers w ON w.id = lc.worker_id
    LEFT JOIN trc_cases tc ON tc.id = lc.trc_case_id
    LEFT JOIN worker_legal_snapshots wls ON wls.worker_id = lc.worker_id
    LEFT JOIN LATERAL (
      SELECT pack_status FROM authority_response_packs WHERE legal_case_id = lc.id ORDER BY created_at DESC LIMIT 1
    ) ap ON true
    WHERE lc.id = $1 AND lc.tenant_id = $2
  `, [legalCaseId, tenantId]);

  if (!row) return null;

  // Count evidence
  const evCount = await queryOne<any>(
    "SELECT COUNT(*) as cnt FROM legal_evidence WHERE worker_id = $1 AND tenant_id = $2",
    [row.worker_id, tenantId]
  );

  return {
    legalCaseId: row.legal_case_id,
    trcCaseId: row.trc_case_id,
    workerId: row.worker_id,
    workerName: row.worker_name ?? "Unknown",
    trcStatus: row.trc_status,
    trcCaseType: row.trc_case_type,
    trcVoivodeship: row.trc_voivodeship,
    trcEmployerName: row.trc_employer_name,
    trcStartDate: row.trc_start_date ? new Date(row.trc_start_date).toISOString().slice(0, 10) : null,
    trcExpiryDate: row.trc_expiry_date ? new Date(row.trc_expiry_date).toISOString().slice(0, 10) : null,
    legalStatus: row.legal_status,
    legalCaseType: row.legal_case_type,
    appealDeadline: row.appeal_deadline,
    nextAction: row.next_action,
    legalSnapshotStatus: row.snapshot_status,
    legalBasis: row.legal_basis,
    riskLevel: row.risk_level,
    authorityPackStatus: row.authority_pack_status,
    evidenceCount: Number(evCount?.cnt ?? 0),
    lastUpdated: row.last_updated,
  };
}

export async function getAllLinkedCases(tenantId: string): Promise<LinkedCaseView[]> {
  const cases = await query<any>(
    "SELECT id FROM legal_cases WHERE tenant_id = $1 ORDER BY updated_at DESC",
    [tenantId]
  );
  const views: LinkedCaseView[] = [];
  for (const c of cases) {
    const v = await getLinkedCaseView(c.id, tenantId);
    if (v) views.push(v);
  }
  return views;
}

// ═══ HELPERS ════════════════════════════════════════════════════════════════

function deriveStateFields(status: LegalCaseStatus, trc: any): { appealDeadline: string | null; nextAction: string } {
  switch (status) {
    case "NEW":
      return { appealDeadline: null, nextAction: trc.notes ? `TRC: ${trc.notes}`.slice(0, 200) : "Prepare and submit TRC case documents" };
    case "PENDING":
      return { appealDeadline: null, nextAction: `Awaiting decision — ${trc.voivodeship ?? "voivodeship"}` };
    case "REJECTED":
      return {
        appealDeadline: new Date(Date.now() + 14 * 86_400_000).toISOString(),
        nextAction: "Review TRC rejection and prepare appeal",
      };
    case "APPROVED":
      return { appealDeadline: null, nextAction: "TRC approved — collect card and update records" };
  }
}
