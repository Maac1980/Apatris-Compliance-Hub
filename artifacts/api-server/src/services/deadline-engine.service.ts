/**
 * Deadline Countdown Engine — tracks action deadlines and auto-escalates.
 *
 * Deadline types:
 *  - PUP_NOTIFICATION: 7 days from hire to notify PUP
 *  - ZUS_REGISTRATION: 7 days from hire to register ZUS
 *  - ANNEX_1_SIGNATURE: 30 days for employer to sign MOS Annex 1
 *  - APPEAL_RESPONSE: 14 days to respond to rejection/defect
 *  - BHP_RENEWAL: days until BHP expires
 *  - MEDICAL_RENEWAL: days until medical exam expires
 *  - PESEL_UKR_PHOTO: Ukrainian PESEL photo-ID update (Aug 31, 2026)
 *  - CUKR_APPLICATION: CUKR card application deadline (Mar 4, 2027)
 *
 * Escalation: day 1 push → day 3 WhatsApp → day 5 email → expired = HARD BLOCK
 */

import { query, queryOne, execute } from "../lib/db.js";

export type DeadlineType =
  | "PUP_NOTIFICATION" | "ZUS_REGISTRATION" | "ANNEX_1_SIGNATURE"
  | "APPEAL_RESPONSE" | "BHP_RENEWAL" | "MEDICAL_RENEWAL"
  | "PESEL_UKR_PHOTO" | "CUKR_APPLICATION" | "CUSTOM";

export interface Deadline {
  id: string;
  tenant_id: string;
  worker_id: string | null;
  case_id: string | null;
  deadline_type: DeadlineType;
  description: string;
  deadline_date: string;
  days_total: number;
  days_remaining: number;
  status: "active" | "escalated" | "completed" | "expired";
  created_at: string;
}

export async function createDeadline(
  tenantId: string,
  deadlineType: DeadlineType,
  description: string,
  deadlineDate: string,
  daysTotal: number,
  opts: { workerId?: string; caseId?: string } = {},
): Promise<Deadline> {
  const row = await queryOne<any>(
    `INSERT INTO deadline_countdowns (tenant_id, worker_id, case_id, deadline_type, description, deadline_date, days_total)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *,
     (deadline_date::date - CURRENT_DATE) AS days_remaining`,
    [tenantId, opts.workerId ?? null, opts.caseId ?? null, deadlineType, description, deadlineDate, daysTotal]
  );
  return row;
}

export async function completeDeadline(deadlineId: string, tenantId: string): Promise<void> {
  await execute(
    "UPDATE deadline_countdowns SET status = 'completed', completed_at = NOW() WHERE id = $1 AND tenant_id = $2",
    [deadlineId, tenantId]
  );
}

export async function getActiveDeadlines(tenantId: string): Promise<Deadline[]> {
  return query<Deadline>(
    `SELECT d.*, (d.deadline_date::date - CURRENT_DATE) AS days_remaining,
            w.first_name || ' ' || w.last_name AS worker_name
     FROM deadline_countdowns d
     LEFT JOIN workers w ON d.worker_id = w.id
     WHERE d.tenant_id = $1 AND d.status IN ('active', 'escalated')
     ORDER BY d.deadline_date ASC`,
    [tenantId]
  );
}

export async function getOverdueDeadlines(tenantId: string): Promise<Deadline[]> {
  return query<Deadline>(
    `SELECT d.*, (d.deadline_date::date - CURRENT_DATE) AS days_remaining,
            w.first_name || ' ' || w.last_name AS worker_name
     FROM deadline_countdowns d
     LEFT JOIN workers w ON d.worker_id = w.id
     WHERE d.tenant_id = $1 AND d.status = 'active' AND d.deadline_date::date < CURRENT_DATE
     ORDER BY d.deadline_date ASC`,
    [tenantId]
  );
}

export async function runDeadlineCheck(tenantId: string): Promise<{ checked: number; escalated: number; expired: number }> {
  let escalated = 0, expired = 0;

  // Find deadlines expiring today or past
  const overdue = await query<any>(
    `SELECT d.*, w.first_name, w.last_name, (d.deadline_date::date - CURRENT_DATE) AS days_remaining
     FROM deadline_countdowns d LEFT JOIN workers w ON d.worker_id = w.id
     WHERE d.tenant_id = $1 AND d.status = 'active' AND d.deadline_date::date <= CURRENT_DATE`,
    [tenantId]
  );

  for (const d of overdue) {
    await execute("UPDATE deadline_countdowns SET status = 'expired' WHERE id = $1", [d.id]);
    expired++;

    // Log alert
    try {
      const { logAlert } = await import("./case-notebook.service.js");
      if (d.case_id) {
        await logAlert(d.case_id, tenantId, "DEADLINE_EXPIRED",
          `Deadline expired: ${d.deadline_type} — ${d.description}. Worker: ${d.first_name ?? ""} ${d.last_name ?? ""}`);
      }
    } catch { /* non-blocking */ }
  }

  // Find deadlines approaching (≤2 days) and escalate
  const approaching = await query<any>(
    `SELECT d.*, w.first_name, w.last_name, (d.deadline_date::date - CURRENT_DATE) AS days_remaining
     FROM deadline_countdowns d LEFT JOIN workers w ON d.worker_id = w.id
     WHERE d.tenant_id = $1 AND d.status = 'active'
       AND (d.deadline_date::date - CURRENT_DATE) BETWEEN 0 AND 2
       AND d.escalated_at IS NULL`,
    [tenantId]
  );

  for (const d of approaching) {
    await execute("UPDATE deadline_countdowns SET status = 'escalated', escalated_at = NOW() WHERE id = $1", [d.id]);
    escalated++;

    try {
      const { notifySLABreach } = await import("./push-sender.service.js");
      await notifySLABreach(tenantId, `${d.first_name ?? ""} ${d.last_name ?? ""}`, d.deadline_type, d.description, d.days_remaining);
    } catch { /* non-blocking */ }
  }

  const total = await queryOne<any>("SELECT COUNT(*)::int AS c FROM deadline_countdowns WHERE tenant_id = $1 AND status = 'active'", [tenantId]);
  return { checked: total?.c ?? 0, escalated, expired };
}

// Auto-create deadlines when worker is hired
export async function createHireDeadlines(tenantId: string, workerId: string, workerName: string): Promise<void> {
  const now = new Date();
  const addDays = (d: number) => new Date(now.getTime() + d * 86_400_000).toISOString().slice(0, 10);

  await createDeadline(tenantId, "PUP_NOTIFICATION", `PUP notification for ${workerName} — 7 day deadline`, addDays(7), 7, { workerId });
  await createDeadline(tenantId, "ZUS_REGISTRATION", `ZUS registration for ${workerName} — 7 day deadline`, addDays(7), 7, { workerId });
}

// Auto-create MOS Annex 1 deadline when case is filed
export async function createAnnexDeadline(tenantId: string, workerId: string, caseId: string, workerName: string): Promise<void> {
  const addDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);
  await createDeadline(tenantId, "ANNEX_1_SIGNATURE", `MOS Annex 1 employer signature for ${workerName} — 30 day deadline`, addDays(30), 30, { workerId, caseId });
}
