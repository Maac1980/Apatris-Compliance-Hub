/**
 * Payroll Service — orchestrates payroll workflows.
 *
 * Uses zus.service.ts for calculations. No HTTP concerns.
 * All functions are pure business logic + DB operations.
 */

import { query, queryOne, execute } from "../lib/db.js";
import { fetchAllWorkers } from "../lib/workers-db.js";
import { mapRowToWorker, type Worker } from "../lib/compliance.js";
import { sendPayslipEmail, isMailConfigured } from "../lib/mailer.js";
import { appendAuditLog } from "../lib/audit-log.js";
import { calculateFromGross, type ZUSBreakdown } from "./zus.service.js";

// ═══ TYPES ══════════════════════════════════════════════════════════════════

export interface PayrollWorkerView extends Worker {
  zusBreakdown?: ZUSBreakdown;
}

export interface PayrollCommitResult {
  month: string;
  workerCount: number;
  totalGross: number;
  totalNetto: number;
  payslipsSent: number;
  commitId: number;
}

export interface PayrollSnapshot {
  id: number;
  month: string;
  workerName: string;
  workerId: string;
  site: string;
  hours: number;
  hourlyRate: number;
  gross: number;
  employeeZus: number;
  healthIns: number;
  estPit: number;
  advance: number;
  penalties: number;
  netto: number;
}

// ═══ QUERIES ════════════════════════════════════════════════════════════════

/**
 * Get current payroll view for all workers (with live ZUS calculation).
 */
export async function getCurrentPayroll(tenantId: string): Promise<PayrollWorkerView[]> {
  const rows = await fetchAllWorkers(tenantId);
  return rows.map(r => {
    const w = mapRowToWorker(r);
    const gross = (w.hourlyRate ?? 0) * (w.monthlyHours ?? 0);
    const zusBreakdown = gross > 0 ? calculateFromGross(gross) : undefined;
    return { ...w, zusBreakdown };
  });
}

/**
 * Get payroll history for a specific worker.
 */
export async function getWorkerPayrollHistory(workerId: string): Promise<PayrollSnapshot[]> {
  const rows = await query<any>(
    "SELECT * FROM payroll_snapshots WHERE worker_id = $1 ORDER BY month DESC",
    [workerId]
  );
  return rows.map(r => ({
    id: r.id,
    month: r.month,
    workerName: r.worker_name,
    workerId: r.worker_id,
    site: r.site ?? "",
    hours: Number(r.hours ?? 0),
    hourlyRate: Number(r.hourly_rate ?? 0),
    gross: Number(r.gross ?? 0),
    employeeZus: Number(r.employee_zus ?? 0),
    healthIns: Number(r.health_ins ?? 0),
    estPit: Number(r.est_pit ?? 0),
    advance: Number(r.advance ?? 0),
    penalties: Number(r.penalties ?? 0),
    netto: Number(r.netto ?? 0),
  }));
}

/**
 * Get all payroll history (admin view).
 */
export async function getAllPayrollHistory(): Promise<PayrollSnapshot[]> {
  const rows = await query<any>(
    "SELECT * FROM payroll_snapshots ORDER BY month DESC, worker_name ASC LIMIT 500"
  );
  return rows.map(r => ({
    id: r.id,
    month: r.month,
    workerName: r.worker_name,
    workerId: r.worker_id,
    site: r.site ?? "",
    hours: Number(r.hours ?? 0),
    hourlyRate: Number(r.hourly_rate ?? 0),
    gross: Number(r.gross ?? 0),
    employeeZus: Number(r.employee_zus ?? 0),
    healthIns: Number(r.health_ins ?? 0),
    estPit: Number(r.est_pit ?? 0),
    advance: Number(r.advance ?? 0),
    penalties: Number(r.penalties ?? 0),
    netto: Number(r.netto ?? 0),
  }));
}

/**
 * Send a single payslip email.
 */
export async function sendPayslip(params: {
  workerName: string; workerEmail: string; monthYear: string; site: string;
  totalHours: number; hourlyRate: number; grossPayout: number;
  advancesDeducted: number; penaltiesDeducted: number; finalNettoPayout: number;
}): Promise<boolean> {
  if (!isMailConfigured()) return false;
  await sendPayslipEmail(params);
  return true;
}

/**
 * Log a payroll action to the audit trail.
 */
export function logPayrollAction(actor: string, actorEmail: string, note: string): void {
  appendAuditLog({
    timestamp: new Date().toISOString(),
    actor, actorEmail,
    action: "PAYROLL_COMMIT",
    workerId: "—", workerName: "—",
    note,
  });
}
