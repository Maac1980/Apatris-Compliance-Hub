/**
 * Daily Legal Scan Service — proactive detection of legal status transitions.
 *
 * Runs daily via scheduler. For each active worker:
 *  1. Reads previous snapshot from worker_legal_snapshots
 *  2. Calls refreshWorkerLegalSnapshot() to recalculate
 *  3. Compares old vs new — creates alerts for meaningful changes
 *
 * Does NOT change legal engine logic. Only consumes existing snapshot API.
 */

import { query, queryOne, execute } from "../lib/db.js";
import { refreshWorkerLegalSnapshot } from "./legal-status.service.js";

// ═══ TYPES ══════════════════════════════════════════════════════════════════

export type AlertType =
  | "STATUS_CHANGED"
  | "RISK_INCREASED"
  | "EXPIRY_WARNING"
  | "REVIEW_REQUIRED"
  | "PROTECTION_ACTIVATED"
  | "PROTECTION_LOST";

export type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

interface PreviousSnapshot {
  legal_status: string | null;
  risk_level: string | null;
  permit_expires_at: string | null;
}

interface ScanResult {
  scanId: string;
  workersScanned: number;
  alertsCreated: number;
  errors: number;
  duration: number;
}

// ═══ SEVERITY DERIVATION ════════════════════════════════════════════════════

const RISK_ORDER: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };

function deriveSeverity(newRisk: string | null, alertType: AlertType): Severity {
  if (alertType === "PROTECTION_LOST") return "CRITICAL";
  if (newRisk === "CRITICAL") return "CRITICAL";
  if (newRisk === "HIGH" || alertType === "REVIEW_REQUIRED") return "HIGH";
  if (newRisk === "MEDIUM") return "MEDIUM";
  return "LOW";
}

function riskIncreased(oldRisk: string | null, newRisk: string | null): boolean {
  return (RISK_ORDER[newRisk ?? ""] ?? 0) > (RISK_ORDER[oldRisk ?? ""] ?? 0);
}

// ═══ EXPIRY THRESHOLDS ══════════════════════════════════════════════════════

const EXPIRY_THRESHOLDS = [60, 30, 14, 7, 1] as const;

function getExpiryWarningDays(permitExpiresAt: string | null): number | null {
  if (!permitExpiresAt) return null;
  const days = Math.ceil((new Date(permitExpiresAt).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return null; // already expired — handled by status change
  for (const threshold of EXPIRY_THRESHOLDS) {
    if (days === threshold) return threshold;
  }
  return null;
}

// ═══ CORE SCAN ══════════════════════════════════════════════════════════════

export async function runDailyLegalScan(tenantId?: string): Promise<ScanResult> {
  const start = Date.now();

  // Resolve tenant(s)
  const tenants = tenantId
    ? [{ id: tenantId }]
    : await query<{ id: string }>("SELECT id FROM tenants");

  let totalScanned = 0;
  let totalAlerts = 0;
  let totalErrors = 0;

  for (const tenant of tenants) {
    const tid = tenant.id;

    // Create scan run record
    const scanRun = await queryOne<any>(
      "INSERT INTO legal_scan_runs (tenant_id, started_at) VALUES ($1, NOW()) RETURNING id",
      [tid]
    );
    const scanId = scanRun?.id;

    // Get all active workers
    const workers = await query<{ id: string; full_name: string }>(
      "SELECT id, full_name FROM workers WHERE tenant_id = $1 AND (status IS NULL OR status NOT IN ('departed','terminated'))",
      [tid]
    );

    let scanned = 0;
    let alerts = 0;
    let errors = 0;

    for (const worker of workers) {
      try {
        // Read previous snapshot
        const prev = await queryOne<PreviousSnapshot>(
          "SELECT legal_status, risk_level, permit_expires_at FROM worker_legal_snapshots WHERE worker_id = $1",
          [worker.id]
        );

        // Refresh snapshot (recalculates from current data)
        const newSnap = await refreshWorkerLegalSnapshot(worker.id, tid);

        scanned++;

        // Compare and create alerts
        const newAlerts = detectAlerts(worker.id, worker.full_name, tid, prev, newSnap);
        for (const alert of newAlerts) {
          // Dedup: same worker + same alert_type + same day
          const existing = await queryOne<any>(
            `SELECT id FROM legal_alerts
             WHERE worker_id = $1 AND tenant_id = $2 AND alert_type = $3
             AND created_at >= CURRENT_DATE AND created_at < CURRENT_DATE + INTERVAL '1 day'`,
            [worker.id, tid, alert.alertType]
          );
          if (existing) continue;

          await execute(
            `INSERT INTO legal_alerts (tenant_id, worker_id, alert_type, severity, previous_status, new_status, previous_risk_level, new_risk_level, message)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [tid, worker.id, alert.alertType, alert.severity, alert.prevStatus, alert.newStatus, alert.prevRisk, alert.newRisk, alert.message]
          );
          alerts++;
        }
      } catch (err) {
        errors++;
        console.error(`[LegalScan] Error scanning worker ${worker.id}:`, err instanceof Error ? err.message : err);
      }
    }

    // Update scan run record
    if (scanId) {
      await execute(
        `UPDATE legal_scan_runs SET completed_at = NOW(), workers_scanned = $1, alerts_created = $2, errors = $3,
         summary_json = $4 WHERE id = $5`,
        [scanned, alerts, errors, JSON.stringify({ tenantId: tid, workers: workers.length }), scanId]
      );
    }

    totalScanned += scanned;
    totalAlerts += alerts;
    totalErrors += errors;
  }

  const duration = Date.now() - start;
  console.log(`[LegalScan] Complete: ${totalScanned} workers, ${totalAlerts} alerts, ${totalErrors} errors, ${duration}ms`);

  return { scanId: "batch", workersScanned: totalScanned, alertsCreated: totalAlerts, errors: totalErrors, duration };
}

// ═══ ALERT DETECTION ════════════════════════════════════════════════════════

interface AlertCandidate {
  alertType: AlertType;
  severity: Severity;
  prevStatus: string | null;
  newStatus: string;
  prevRisk: string | null;
  newRisk: string;
  message: string;
}

function detectAlerts(
  workerId: string,
  workerName: string,
  tenantId: string,
  prev: PreviousSnapshot | null,
  newSnap: { legalStatus: string; riskLevel: string; permitExpiresAt: string | null },
): AlertCandidate[] {
  const alerts: AlertCandidate[] = [];
  const prevStatus = prev?.legal_status ?? null;
  const prevRisk = prev?.risk_level ?? null;
  const name = workerName ?? "Worker";

  // 1. Status changed
  if (prevStatus && prevStatus !== newSnap.legalStatus) {
    // Protection lost
    if (prevStatus === "PROTECTED_PENDING" && (newSnap.legalStatus === "EXPIRED_NOT_PROTECTED" || newSnap.legalStatus === "REVIEW_REQUIRED")) {
      alerts.push({
        alertType: "PROTECTION_LOST",
        severity: "CRITICAL",
        prevStatus, newStatus: newSnap.legalStatus, prevRisk, newRisk: newSnap.riskLevel,
        message: `${name}: legal protection status changed from ${prevStatus} to ${newSnap.legalStatus}. Immediate review required.`,
      });
    }
    // Protection activated
    else if (newSnap.legalStatus === "PROTECTED_PENDING" && prevStatus !== "PROTECTED_PENDING") {
      alerts.push({
        alertType: "PROTECTION_ACTIVATED",
        severity: "LOW",
        prevStatus, newStatus: newSnap.legalStatus, prevRisk, newRisk: newSnap.riskLevel,
        message: `${name}: Art. 108 or Specustawa protection is now active. Status changed from ${prevStatus} to PROTECTED_PENDING.`,
      });
    }
    // Review required
    else if (newSnap.legalStatus === "REVIEW_REQUIRED") {
      alerts.push({
        alertType: "REVIEW_REQUIRED",
        severity: "HIGH",
        prevStatus, newStatus: newSnap.legalStatus, prevRisk, newRisk: newSnap.riskLevel,
        message: `${name}: legal status changed to REVIEW_REQUIRED. Manual review needed.`,
      });
    }
    // General status change
    else {
      alerts.push({
        alertType: "STATUS_CHANGED",
        severity: deriveSeverity(newSnap.riskLevel, "STATUS_CHANGED"),
        prevStatus, newStatus: newSnap.legalStatus, prevRisk, newRisk: newSnap.riskLevel,
        message: `${name}: legal status changed from ${prevStatus} to ${newSnap.legalStatus}.`,
      });
    }
  }

  // 2. Risk increased (even without status change)
  if (prevRisk && riskIncreased(prevRisk, newSnap.riskLevel) && prevStatus === newSnap.legalStatus) {
    alerts.push({
      alertType: "RISK_INCREASED",
      severity: deriveSeverity(newSnap.riskLevel, "RISK_INCREASED"),
      prevStatus, newStatus: newSnap.legalStatus, prevRisk, newRisk: newSnap.riskLevel,
      message: `${name}: risk level increased from ${prevRisk} to ${newSnap.riskLevel}.`,
    });
  }

  // 3. Permit expiry countdown warnings (at specific thresholds)
  const expiryDays = getExpiryWarningDays(newSnap.permitExpiresAt);
  if (expiryDays !== null) {
    alerts.push({
      alertType: "EXPIRY_WARNING",
      severity: expiryDays <= 7 ? "HIGH" : expiryDays <= 30 ? "MEDIUM" : "LOW",
      prevStatus, newStatus: newSnap.legalStatus, prevRisk, newRisk: newSnap.riskLevel,
      message: `${name}: work permit expires in ${expiryDays} day(s). ${expiryDays <= 7 ? "Urgent action required." : "Plan renewal."}`,
    });
  }

  return alerts;
}

// ═══ READ OPERATIONS ════════════════════════════════════════════════════════

export async function getAlerts(tenantId: string, limit = 100): Promise<any[]> {
  return query(
    `SELECT la.*, w.full_name as worker_name
     FROM legal_alerts la
     JOIN workers w ON w.id = la.worker_id
     WHERE la.tenant_id = $1
     ORDER BY la.created_at DESC LIMIT $2`,
    [tenantId, limit]
  );
}

export async function getAlertsByWorker(workerId: string, tenantId: string): Promise<any[]> {
  return query(
    "SELECT * FROM legal_alerts WHERE worker_id = $1 AND tenant_id = $2 ORDER BY created_at DESC LIMIT 50",
    [workerId, tenantId]
  );
}

export async function markAlertRead(alertId: string, tenantId: string): Promise<void> {
  await execute(
    "UPDATE legal_alerts SET is_read = TRUE, updated_at = NOW() WHERE id = $1 AND tenant_id = $2",
    [alertId, tenantId]
  );
}
