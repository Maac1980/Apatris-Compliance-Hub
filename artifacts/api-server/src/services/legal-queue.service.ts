/**
 * Legal Queue Service — prioritized execution queue for the legal team.
 *
 * Reads from existing tables only:
 *  - legal_cases
 *  - workers
 *  - worker_legal_snapshots
 *  - authority_response_packs
 *
 * Does NOT create new tables or modify any existing logic.
 */

import { query } from "../lib/db.js";

// ═══ TYPES ══════════════════════════════════════════════════════════════════

export type UrgencyFlag = "overdue" | "urgent" | "warning" | "normal";

export interface QueueItem {
  worker_id: string;
  worker_name: string;
  case_id: string;
  case_type: string;
  case_status: string;
  legal_status: string | null;
  legal_basis: string | null;
  risk_level: string | null;
  appeal_deadline: string | null;
  days_until_deadline: number | null;
  urgency: UrgencyFlag;
  next_action: string | null;
  authority_pack_status: string | null;
  authority_pack_id: string | null;
  last_updated_at: string;
  priority_score: number;
}

export interface QueueSummary {
  items: QueueItem[];
  total: number;
  byUrgency: Record<UrgencyFlag, number>;
  byRisk: Record<string, number>;
}

// ═══ PRIORITY SCORING ═══════════════════════════════════════════════════════

const RISK_SCORE: Record<string, number> = {
  CRITICAL: 400,
  HIGH: 300,
  MEDIUM: 200,
  LOW: 100,
};

const STATUS_SCORE: Record<string, number> = {
  EXPIRED_NOT_PROTECTED: 500,
  REVIEW_REQUIRED: 400,
  NO_PERMIT: 450,
  PROTECTED_PENDING: 200,
  EXPIRING_SOON: 150,
  VALID: 50,
};

const CASE_STATUS_SCORE: Record<string, number> = {
  REJECTED: 300,
  NEW: 200,
  PENDING: 100,
  APPROVED: 0,
};

function computeUrgency(appealDeadline: string | null): { urgency: UrgencyFlag; daysUntil: number | null } {
  if (!appealDeadline) return { urgency: "normal", daysUntil: null };
  const days = Math.ceil((new Date(appealDeadline).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return { urgency: "overdue", daysUntil: days };
  if (days <= 3) return { urgency: "urgent", daysUntil: days };
  if (days <= 7) return { urgency: "warning", daysUntil: days };
  return { urgency: "normal", daysUntil: days };
}

function computePriority(
  daysUntil: number | null,
  riskLevel: string | null,
  legalStatus: string | null,
  caseStatus: string,
): number {
  let score = 0;

  // Deadline urgency (highest weight)
  if (daysUntil !== null) {
    if (daysUntil < 0) score += 1000 + Math.abs(daysUntil) * 10; // overdue scales
    else if (daysUntil <= 3) score += 800;
    else if (daysUntil <= 7) score += 600;
    else score += Math.max(0, 300 - daysUntil * 5);
  }

  score += RISK_SCORE[riskLevel ?? ""] ?? 0;
  score += STATUS_SCORE[legalStatus ?? ""] ?? 0;
  score += CASE_STATUS_SCORE[caseStatus] ?? 0;

  return score;
}

// ═══ CORE QUERY ═════════════════════════════════════════════════════════════

export async function getLegalQueue(tenantId: string): Promise<QueueSummary> {
  // Single query joining legal_cases + workers + snapshots + latest authority pack
  const rows = await query<any>(`
    SELECT
      lc.id AS case_id,
      lc.worker_id,
      lc.case_type,
      lc.status AS case_status,
      lc.appeal_deadline,
      lc.next_action,
      lc.updated_at AS last_updated_at,
      w.full_name AS worker_name,
      wls.legal_status,
      wls.legal_basis,
      wls.risk_level,
      ap.id AS authority_pack_id,
      ap.pack_status AS authority_pack_status
    FROM legal_cases lc
    JOIN workers w ON w.id = lc.worker_id
    LEFT JOIN worker_legal_snapshots wls ON wls.worker_id = lc.worker_id
    LEFT JOIN LATERAL (
      SELECT id, pack_status
      FROM authority_response_packs
      WHERE legal_case_id = lc.id AND tenant_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    ) ap ON true
    WHERE lc.tenant_id = $1
    ORDER BY lc.updated_at DESC
  `, [tenantId]);

  // Build queue items with priority scoring
  const items: QueueItem[] = rows.map((r: any) => {
    const { urgency, daysUntil } = computeUrgency(r.appeal_deadline);
    const priority = computePriority(daysUntil, r.risk_level, r.legal_status, r.case_status);
    return {
      worker_id: r.worker_id,
      worker_name: r.worker_name ?? "Unknown",
      case_id: r.case_id,
      case_type: r.case_type,
      case_status: r.case_status,
      legal_status: r.legal_status ?? null,
      legal_basis: r.legal_basis ?? null,
      risk_level: r.risk_level ?? null,
      appeal_deadline: r.appeal_deadline,
      days_until_deadline: daysUntil,
      urgency,
      next_action: r.next_action,
      authority_pack_status: r.authority_pack_status ?? null,
      authority_pack_id: r.authority_pack_id ?? null,
      last_updated_at: r.last_updated_at,
      priority_score: priority,
    };
  });

  // Sort by priority descending
  items.sort((a, b) => b.priority_score - a.priority_score);

  // Compute summary counts
  const byUrgency: Record<UrgencyFlag, number> = { overdue: 0, urgent: 0, warning: 0, normal: 0 };
  const byRisk: Record<string, number> = {};
  for (const item of items) {
    byUrgency[item.urgency]++;
    const risk = item.risk_level ?? "UNKNOWN";
    byRisk[risk] = (byRisk[risk] ?? 0) + 1;
  }

  return { items, total: items.length, byUrgency, byRisk };
}
