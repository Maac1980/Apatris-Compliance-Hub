/**
 * Automation Engine — proactive execution of safe, deterministic actions.
 *
 * Runs after daily legal scan. For each worker:
 *  1. Gets all required actions from Action Engine
 *  2. Filters to SAFE + READY + auto-executable
 *  3. Checks for duplicates (already generated)
 *  4. Executes: generates documents + drafts authority packs
 *
 * SAFETY:
 *  - NEVER sends anything externally
 *  - NEVER approves anything
 *  - NEVER changes legal status
 *  - ONLY creates drafts
 *  - Supports dry_run mode (log what would happen, don't execute)
 */

import { query, queryOne, execute } from "../lib/db.js";
import { getWorkerActions, executeAction } from "./action-engine.service.js";

// ═══ TYPES ══════════════════════════════════════════════════════════════════

export type AutomationMode = "dry_run" | "live";

export interface AutomationResult {
  runId: string;
  mode: AutomationMode;
  workersProcessed: number;
  actionsExecuted: number;
  actionsSkipped: number;
  errors: number;
  duration: number;
  details: AutomationLogEntry[];
}

interface AutomationLogEntry {
  workerId: string;
  workerName: string;
  actionId: string;
  actionTitle: string;
  result: "SUCCESS" | "SKIPPED" | "ERROR" | "DRY_RUN";
  reason: string;
}

// ═══ SAFE ACTION TYPES ══════════════════════════════════════════════════════

// Only these action types can be auto-executed
const SAFE_ACTION_TYPES = new Set(["DOCUMENT", "AUTHORITY_PACK"]);

// These actions are NEVER auto-executed
const BLOCKED_ACTIONS = new Set(["urgent-review", "create-case", "upload-evidence"]);

// ═══ CORE ═══════════════════════════════════════════════════════════════════

export async function runAutomationCycle(tenantId?: string, modeOverride?: AutomationMode): Promise<AutomationResult> {
  const start = Date.now();

  // Multi-tenant: run for all tenants respecting their individual mode
  if (!tenantId) {
    const tenants = await query<any>("SELECT id, automation_mode FROM tenants");
    const batch: AutomationResult = { runId: "batch", mode: "dry_run", workersProcessed: 0, actionsExecuted: 0, actionsSkipped: 0, errors: 0, duration: 0, details: [] };
    for (const t of tenants) {
      if (t.automation_mode === "disabled" && !modeOverride) continue;
      try {
        const r = await runAutomationCycle(t.id, modeOverride);
        batch.workersProcessed += r.workersProcessed;
        batch.actionsExecuted += r.actionsExecuted;
        batch.actionsSkipped += r.actionsSkipped;
        batch.errors += r.errors;
        batch.details.push(...r.details);
      } catch { /* continue */ }
    }
    batch.duration = Date.now() - start;
    return batch;
  }

  // Resolve mode: override > tenant setting > disabled
  const tenant = await queryOne<any>("SELECT automation_mode FROM tenants WHERE id = $1", [tenantId]);
  const tenantMode = tenant?.automation_mode ?? "disabled";
  const mode: AutomationMode = modeOverride ?? (tenantMode === "enabled" ? "live" : tenantMode === "dry_run" ? "dry_run" : "dry_run");

  // If tenant is disabled and no override, skip entirely
  if (tenantMode === "disabled" && !modeOverride) {
    return { runId: "disabled", mode: "dry_run", workersProcessed: 0, actionsExecuted: 0, actionsSkipped: 0, errors: 0, duration: 0, details: [] };
  }

  const details: AutomationLogEntry[] = [];

  // Create run record
  const run = await queryOne<any>(
    "INSERT INTO automation_runs (tenant_id, mode) VALUES ($1, $2) RETURNING id",
    [tenantId, mode]
  );
  const runId = run!.id;

  // Get all active workers
  const workers = await query<any>(
    "SELECT id, full_name FROM workers WHERE tenant_id = $1 AND (status IS NULL OR status NOT IN ('departed','terminated'))",
    [tenantId]
  );

  let workersProcessed = 0;
  let actionsExecuted = 0;
  let actionsSkipped = 0;
  let errors = 0;

  for (const worker of workers) {
    try {
      const workerActions = await getWorkerActions(worker.id, tenantId);
      workersProcessed++;

      // Filter to safe, ready, auto-executable, required actions
      const candidates = workerActions.actions.filter(a =>
        a.required &&
        a.autoExecutable &&
        a.status === "READY" &&
        SAFE_ACTION_TYPES.has(a.type) &&
        !BLOCKED_ACTIONS.has(a.id)
      );

      for (const action of candidates) {
        // Duplication guard: check if already executed today
        const alreadyDone = await queryOne<any>(
          `SELECT id FROM automation_logs WHERE worker_id = $1 AND action_id = $2 AND result = 'SUCCESS' AND created_at >= CURRENT_DATE`,
          [worker.id, action.id]
        );

        if (alreadyDone) {
          details.push({ workerId: worker.id, workerName: worker.full_name, actionId: action.id, actionTitle: action.title, result: "SKIPPED", reason: "Already executed today" });
          actionsSkipped++;
          await logAction(runId, tenantId, worker.id, action.id, action.title, "SKIPPED", "Already executed today");
          continue;
        }

        if (mode === "dry_run") {
          details.push({ workerId: worker.id, workerName: worker.full_name, actionId: action.id, actionTitle: action.title, result: "DRY_RUN", reason: "Would execute in live mode" });
          actionsSkipped++;
          await logAction(runId, tenantId, worker.id, action.id, action.title, "DRY_RUN", "Would execute in live mode");
          continue;
        }

        // Live execution
        try {
          const result = await executeAction(worker.id, tenantId, action.id);
          if (result.success) {
            details.push({ workerId: worker.id, workerName: worker.full_name, actionId: action.id, actionTitle: action.title, result: "SUCCESS", reason: JSON.stringify(result.result ?? {}).slice(0, 200) });
            actionsExecuted++;
            await logAction(runId, tenantId, worker.id, action.id, action.title, "SUCCESS", "Auto-executed");
          } else {
            details.push({ workerId: worker.id, workerName: worker.full_name, actionId: action.id, actionTitle: action.title, result: "ERROR", reason: result.error ?? "Unknown" });
            errors++;
            await logAction(runId, tenantId, worker.id, action.id, action.title, "ERROR", result.error ?? "Unknown");
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          details.push({ workerId: worker.id, workerName: worker.full_name, actionId: action.id, actionTitle: action.title, result: "ERROR", reason: msg });
          errors++;
          await logAction(runId, tenantId, worker.id, action.id, action.title, "ERROR", msg);
        }
      }
    } catch (err) {
      errors++;
      console.error(`[Automation] Error processing worker ${worker.id}:`, err instanceof Error ? err.message : err);
    }
  }

  const duration = Date.now() - start;

  // Update run record
  await execute(
    `UPDATE automation_runs SET completed_at = NOW(), workers_processed = $1, actions_executed = $2, actions_skipped = $3, errors = $4, summary_json = $5 WHERE id = $6`,
    [workersProcessed, actionsExecuted, actionsSkipped, errors, JSON.stringify({ mode, duration, totalActions: details.length }), runId]
  );

  console.log(`[Automation] ${mode}: ${workersProcessed} workers, ${actionsExecuted} executed, ${actionsSkipped} skipped, ${errors} errors, ${duration}ms`);

  return { runId, mode, workersProcessed, actionsExecuted, actionsSkipped, errors, duration, details };
}

// ═══ HISTORY ════════════════════════════════════════════════════════════════

export async function getAutomationRuns(tenantId: string, limit = 20): Promise<any[]> {
  return query(
    "SELECT * FROM automation_runs WHERE tenant_id = $1 ORDER BY started_at DESC LIMIT $2",
    [tenantId, limit]
  );
}

export async function getAutomationLogs(runId: string, tenantId: string): Promise<any[]> {
  return query(
    `SELECT al.*, w.full_name as worker_name FROM automation_logs al
     LEFT JOIN workers w ON w.id = al.worker_id
     WHERE al.run_id = $1 AND al.tenant_id = $2 ORDER BY al.created_at`,
    [runId, tenantId]
  );
}

export async function getRecentAutomationForWorker(workerId: string, tenantId: string): Promise<any[]> {
  return query(
    "SELECT * FROM automation_logs WHERE worker_id = $1 AND tenant_id = $2 AND created_at >= CURRENT_DATE - INTERVAL '7 days' ORDER BY created_at DESC LIMIT 20",
    [workerId, tenantId]
  );
}

// ═══ HELPERS ════════════════════════════════════════════════════════════════

async function logAction(runId: string, tenantId: string, workerId: string, actionId: string, actionTitle: string, result: string, reason: string) {
  await execute(
    "INSERT INTO automation_logs (run_id, tenant_id, worker_id, action_id, action_title, result, reason) VALUES ($1,$2,$3,$4,$5,$6,$7)",
    [runId, tenantId, workerId, actionId, actionTitle, result, reason]
  );
}
