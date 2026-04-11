/**
 * Regulatory Deployment + Audit + Notification — Stage 5
 *
 * Deployment: prepare plans, execute (manual only), rollback
 * Audit: append-only immutable event log
 * Notification: hooks (console+log, no email/SMS yet)
 *
 * NO auto-changes to legal engine, templates, or workflows.
 * EVERYTHING logged. Rollback always possible.
 */

import { query, queryOne, execute } from "../lib/db.js";

// ═══ AUDIT SERVICE (append-only, immutable) ═════════════════════════════════

export async function logAuditEvent(
  updateId: string | null, eventType: string, actorType: "SYSTEM" | "USER", actorId: string, metadata?: any
): Promise<void> {
  try {
    await execute(
      "INSERT INTO regulatory_audit_log (update_id, actor_type, actor_id, event_type, metadata_json) VALUES ($1,$2,$3,$4,$5::jsonb)",
      [updateId, actorType, actorId, eventType, JSON.stringify(metadata ?? {})]
    );
  } catch (err) {
    console.error(`[regulatory-audit] Failed to log ${eventType}:`, err instanceof Error ? err.message : err);
  }
}

export async function getAuditLog(updateId: string): Promise<any[]> {
  return query("SELECT * FROM regulatory_audit_log WHERE update_id = $1 ORDER BY created_at ASC", [updateId]);
}

export async function getFullAuditLog(limit = 100): Promise<any[]> {
  return query("SELECT ral.*, ru.title as update_title FROM regulatory_audit_log ral LEFT JOIN regulatory_updates ru ON ru.id = ral.update_id ORDER BY ral.created_at DESC LIMIT $1", [limit]);
}

// ═══ DEPLOYMENT SERVICE ═════════════════════════════════════════════════════

export interface DeploymentPlanItem {
  targetModule: string;
  impactType: string;
  recommendedChange: string;
  executionType: "MANUAL_ACTION" | "CONFIG_UPDATE" | "TEMPLATE_UPDATE" | "WORKFLOW_UPDATE";
  requiresCodeChange: boolean;
  requiresLegalValidation: boolean;
  priority: number;
}

export async function prepareDeployment(updateId: string): Promise<DeploymentPlanItem[]> {
  // Only for APPROVED_FOR_DEPLOYMENT
  const update = await queryOne<any>("SELECT id, status, severity FROM regulatory_updates WHERE id = $1", [updateId]);
  if (!update || update.status !== "APPROVED_FOR_DEPLOYMENT") return [];

  // Get impacts from Stage 3
  const impacts = await query<any>("SELECT * FROM regulatory_impacts WHERE update_id = $1 ORDER BY impact_severity DESC", [updateId]);

  const plan: DeploymentPlanItem[] = [];

  for (const imp of impacts) {
    if (imp.impact_type === "NO_ACTION") continue;

    const execType = mapExecutionType(imp.impacted_module, imp.impact_type);
    const requiresCode = ["legal_engine_rules", "worker_status_logic", "payroll_zus_logic"].includes(imp.impacted_module);
    const requiresLegal = ["legal_engine_rules", "appeal_templates", "authority_draft_templates"].includes(imp.impacted_module);

    plan.push({
      targetModule: imp.impacted_module,
      impactType: imp.impact_type,
      recommendedChange: imp.recommended_change ?? "",
      executionType: execType,
      requiresCodeChange: requiresCode,
      requiresLegalValidation: requiresLegal,
      priority: imp.impact_severity === "CRITICAL" ? 1 : imp.impact_severity === "HIGH" ? 2 : imp.impact_severity === "MEDIUM" ? 3 : 4,
    });

    // Create planned deployment record
    await execute(
      `INSERT INTO regulatory_deployments (update_id, deployment_type, target_module, deployment_status, metadata_json)
       VALUES ($1,$2,$3,'PLANNED',$4::jsonb) ON CONFLICT DO NOTHING`,
      [updateId, execType, imp.impacted_module, JSON.stringify({ impactType: imp.impact_type, severity: imp.impact_severity, recommendedChange: imp.recommended_change })]
    );
  }

  await logAuditEvent(updateId, "DEPLOYMENT_PREPARED", "SYSTEM", "pipeline", { planItems: plan.length });
  return plan;
}

export async function getDeploymentPlan(updateId: string): Promise<any[]> {
  return query("SELECT * FROM regulatory_deployments WHERE update_id = $1 ORDER BY deployment_status, target_module", [updateId]);
}

export async function executeDeployment(updateId: string, userId: string): Promise<{ executed: number; items: any[] }> {
  // Verify status
  const update = await queryOne<any>("SELECT id, status FROM regulatory_updates WHERE id = $1", [updateId]);
  if (!update || update.status !== "APPROVED_FOR_DEPLOYMENT") {
    throw new Error("Update must be APPROVED_FOR_DEPLOYMENT to execute");
  }

  // Get planned deployments
  const planned = await query<any>("SELECT * FROM regulatory_deployments WHERE update_id = $1 AND deployment_status = 'PLANNED'", [updateId]);

  const executed: any[] = [];
  for (const dep of planned) {
    await execute(
      "UPDATE regulatory_deployments SET deployment_status = 'EXECUTED', deployed_by = $1, deployed_at = NOW() WHERE id = $2",
      [userId, dep.id]
    );
    executed.push({ ...dep, deployment_status: "EXECUTED", deployed_by: userId });

    await logAuditEvent(updateId, "DEPLOYMENT_EXECUTED", "USER", userId, { deploymentId: dep.id, targetModule: dep.target_module });
  }

  // Update regulatory_updates status
  await execute("UPDATE regulatory_updates SET status = 'DEPLOYED', updated_at = NOW() WHERE id = $1", [updateId]);

  // Notify
  _nde(updateId, userId, executed.length);

  return { executed: executed.length, items: executed };
}

export async function rollbackDeployment(deploymentId: string, userId: string): Promise<any> {
  const dep = await queryOne<any>("SELECT * FROM regulatory_deployments WHERE id = $1", [deploymentId]);
  if (!dep) throw new Error("Deployment not found");
  if (dep.deployment_status !== "EXECUTED") throw new Error("Can only rollback EXECUTED deployments");
  if (!dep.rollback_available) throw new Error("Rollback not available for this deployment");

  await execute(
    "UPDATE regulatory_deployments SET deployment_status = 'ROLLED_BACK', deployed_by = $1, deployed_at = NOW() WHERE id = $2",
    [userId, deploymentId]
  );

  await logAuditEvent(dep.update_id, "DEPLOYMENT_ROLLED_BACK", "USER", userId, { deploymentId, targetModule: dep.target_module });

  return { ...dep, deployment_status: "ROLLED_BACK" };
}

export async function listDeployments(filters?: { status?: string; updateId?: string }): Promise<any[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (filters?.status) { conditions.push(`rd.deployment_status = $${idx++}`); params.push(filters.status); }
  if (filters?.updateId) { conditions.push(`rd.update_id = $${idx++}`); params.push(filters.updateId); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return query(
    `SELECT rd.*, ru.title as update_title, ru.severity as update_severity
     FROM regulatory_deployments rd LEFT JOIN regulatory_updates ru ON ru.id = rd.update_id
     ${where} ORDER BY rd.deployed_at DESC NULLS LAST`,
    params
  );
}

// ═══ NOTIFICATION HOOKS (Stage 7: real dispatch via NotificationService) ════

import {
  notifyReviewAssigned as _nra,
  notifyApprovalNeeded as _nan,
  notifyDeploymentReady as _ndr,
  notifyDeploymentExecuted as _nde,
} from "./notification.service.js";

export const notifyReviewAssigned = _nra;
export const notifyApprovalNeeded = _nan;
export const notifyDeploymentReady = _ndr;

// ═══ EXECUTION TYPE MAPPING ═════════════════════════════════════════════════

function mapExecutionType(module: string, impactType: string): DeploymentPlanItem["executionType"] {
  if (["appeal_templates", "authority_draft_templates"].includes(module)) return "TEMPLATE_UPDATE";
  if (["onboarding_workflows", "readiness_engine"].includes(module)) return "WORKFLOW_UPDATE";
  if (["payroll_zus_logic", "dashboard_metrics", "notification_logic"].includes(module)) return "CONFIG_UPDATE";
  return "MANUAL_ACTION";
}
