/**
 * OODA Orchestration Service — Strategic backbone for Apatris.
 *
 * Two domains: REGULATORY + CASE
 * Each cycle: Observe → Orient → Decide → Act
 * Extends existing ooda-engine.service.ts with real orchestration.
 *
 * NO mutation of deterministic legal truth.
 * Every recommendation traceable. Every override logged.
 */

import { query, queryOne, execute } from "../lib/db.js";
import { advanceStage, recordDecision, createOrGetCycle, getCycle } from "./ooda-engine.service.js";
import { logAuditEvent } from "./regulatory-deployment.service.js";

// ═══ TYPES ══════════════════════════════════════════════════════════════════

export interface OodaContext {
  entityType: "REGULATORY" | "CASE";
  entityId: string;
  tenantId: string;
  workerContext?: { id: string; name: string; status: string; riskLevel: string };
  caseContext?: { id: string; type: string; status: string; deadline: string | null };
  regulatoryContext?: { severity: string; updateType: string; relevanceScore: number };
}

export interface OodaRecommendation {
  action: string;
  reason: string;
  urgency: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  requiresHumanReview: boolean;
  confidence: number;
  linkedEntities: Array<{ type: string; id: string }>;
}

// ═══ REGULATORY OODA ════════════════════════════════════════════════════════

export async function runRegulatoryOoda(updateId: string, tenantId: string): Promise<{ cycleId: string; stage: string; recommendations: OodaRecommendation[] }> {
  const cycleId = await createOrGetCycle("REGULATORY", updateId);

  const update = await queryOne<any>("SELECT * FROM regulatory_updates WHERE id = $1", [updateId]);
  if (!update) return { cycleId, stage: "OBSERVE", recommendations: [] };

  const recommendations: OodaRecommendation[] = [];

  // Determine current state and produce recommendations
  const status = update.status;
  const severity = update.severity ?? "LOW";
  const topics: string[] = update.relevant_topics ?? [];

  if (status === "NEW") {
    recommendations.push({ action: "Classify and extract this update", reason: "Update has not been processed yet", urgency: "MEDIUM", requiresHumanReview: false, confidence: 90, linkedEntities: [] });
  } else if (status === "INGESTED") {
    if (update.requires_human_review) {
      recommendations.push({ action: "Submit for human review", reason: `Severity: ${severity}, confidence: ${update.confidence_score}%`, urgency: severity === "CRITICAL" ? "CRITICAL" : "HIGH", requiresHumanReview: true, confidence: 80, linkedEntities: [] });
    }
  } else if (status === "UNDER_REVIEW") {
    const tasks = await query<any>("SELECT id, task_status, review_type, due_date FROM regulatory_review_tasks WHERE update_id = $1 AND task_status IN ('PENDING','IN_REVIEW')", [updateId]);
    for (const t of tasks) {
      const overdue = t.due_date && new Date(t.due_date) < new Date();
      recommendations.push({ action: `Complete ${t.review_type} review${overdue ? " (OVERDUE)" : ""}`, reason: `Review task ${t.task_status}`, urgency: overdue ? "CRITICAL" : "HIGH", requiresHumanReview: true, confidence: 95, linkedEntities: [{ type: "review_task", id: t.id }] });
    }
  } else if (status === "APPROVED_FOR_DEPLOYMENT") {
    recommendations.push({ action: "Execute deployment", reason: "All approvals received", urgency: "HIGH", requiresHumanReview: true, confidence: 95, linkedEntities: [] });
    recommendations.push({ action: "Export to knowledge base", reason: "Approved update ready for Obsidian export", urgency: "LOW", requiresHumanReview: false, confidence: 90, linkedEntities: [] });
  }

  // Record OODA decision
  if (recommendations.length > 0) {
    await recordDecision("REGULATORY", updateId, "RECOMMENDATION", recommendations.map(r => r.action).join("; "), recommendations[0]?.confidence ?? 50);
  }

  return { cycleId, stage: update.status, recommendations };
}

// ═══ CASE OODA ══════════════════════════════════════════════════════════════

export async function runCaseOoda(workerId: string, tenantId: string): Promise<{ cycleId: string; stage: string; summary: any; recommendations: OodaRecommendation[] }> {
  const cycleId = await createOrGetCycle("CASE", workerId);
  const recommendations: OodaRecommendation[] = [];

  // Load worker state
  const worker = await queryOne<any>(
    "SELECT id, full_name, trc_expiry, work_permit_expiry, passport_expiry, bhp_expiry, contract_end_date FROM workers WHERE id = $1 AND tenant_id = $2",
    [workerId, tenantId]
  );
  if (!worker) return { cycleId, stage: "OBSERVE", summary: null, recommendations: [] };

  const now = new Date();

  // Load case
  const legalCase = await queryOne<any>("SELECT * FROM legal_cases WHERE worker_id = $1 AND tenant_id = $2 ORDER BY created_at DESC LIMIT 1", [workerId, tenantId]);

  // Load rejection
  const rejection = await queryOne<any>("SELECT * FROM rejection_analyses WHERE worker_id = $1 AND tenant_id = $2 ORDER BY created_at DESC LIMIT 1", [workerId, tenantId]);

  // Load files
  const fileCount = Number((await queryOne<any>("SELECT COUNT(*)::int as c FROM worker_files WHERE worker_id = $1 AND tenant_id = $2", [workerId, tenantId]))?.c ?? 0);

  // Load pending intakes
  const pendingIntakes = Number((await queryOne<any>("SELECT COUNT(*)::int as c FROM document_intake WHERE matched_worker_id = $1 AND tenant_id = $2 AND status IN ('PENDING_REVIEW','MANUAL_REQUIRED')", [workerId, tenantId]))?.c ?? 0);

  // ── OBSERVE: what's happening ──
  const observations: string[] = [];

  // Permit expiry
  if (worker.trc_expiry) {
    const days = Math.ceil((new Date(worker.trc_expiry).getTime() - now.getTime()) / 86400000);
    if (days < 0) { observations.push(`TRC expired ${Math.abs(days)} days ago`); recommendations.push({ action: "URGENT: File TRC renewal or verify Art. 108 protection", reason: `TRC expired ${Math.abs(days)} days ago`, urgency: "CRITICAL", requiresHumanReview: true, confidence: 95, linkedEntities: [{ type: "worker", id: workerId }] }); }
    else if (days <= 30) { observations.push(`TRC expires in ${days} days`); recommendations.push({ action: "Initiate TRC renewal", reason: `TRC expires in ${days} days`, urgency: "HIGH", requiresHumanReview: false, confidence: 90, linkedEntities: [{ type: "worker", id: workerId }] }); }
  }

  if (worker.passport_expiry && new Date(worker.passport_expiry) < now) {
    observations.push("Passport expired");
    recommendations.push({ action: "Worker needs passport renewal — blocks all proceedings", reason: "Expired passport", urgency: "CRITICAL", requiresHumanReview: true, confidence: 95, linkedEntities: [{ type: "worker", id: workerId }] });
  }

  // Appeal deadline
  if (legalCase?.appeal_deadline) {
    const days = Math.ceil((new Date(legalCase.appeal_deadline).getTime() - now.getTime()) / 86400000);
    if (days < 0) { observations.push(`Appeal deadline passed ${Math.abs(days)} days ago`); recommendations.push({ action: "Appeal window closed — consult lawyer for alternatives", reason: `Deadline missed by ${Math.abs(days)} days`, urgency: "CRITICAL", requiresHumanReview: true, confidence: 95, linkedEntities: [{ type: "legal_case", id: legalCase.id }] }); }
    else if (days <= 7) { observations.push(`Appeal deadline in ${days} days`); recommendations.push({ action: "File appeal immediately", reason: `Only ${days} days remaining`, urgency: "CRITICAL", requiresHumanReview: true, confidence: 95, linkedEntities: [{ type: "legal_case", id: legalCase.id }] }); }
  }

  // Rejection
  if (rejection && rejection.appeal_possible) {
    recommendations.push({ action: "Generate appeal letter via Rejection Intelligence", reason: `Rejection: ${rejection.category}`, urgency: "HIGH", requiresHumanReview: true, confidence: 80, linkedEntities: [{ type: "rejection", id: rejection.id }] });
  }

  // Pending documents
  if (pendingIntakes > 0) {
    recommendations.push({ action: `Review ${pendingIntakes} pending document intake(s)`, reason: "Unprocessed documents waiting", urgency: "MEDIUM", requiresHumanReview: true, confidence: 85, linkedEntities: [{ type: "worker", id: workerId }] });
  }

  // Contract expiry
  if (worker.contract_end_date) {
    const days = Math.ceil((new Date(worker.contract_end_date).getTime() - now.getTime()) / 86400000);
    if (days > 0 && days <= 30) {
      recommendations.push({ action: "Contract expiring soon — prepare renewal or extension", reason: `${days} days to contract end`, urgency: "MEDIUM", requiresHumanReview: false, confidence: 85, linkedEntities: [{ type: "worker", id: workerId }] });
    }
  }

  const summary = {
    worker: worker.full_name,
    observations,
    caseStatus: legalCase?.status ?? "NO_CASE",
    caseType: legalCase?.case_type ?? null,
    fileCount,
    pendingIntakes,
    rejectionOnFile: !!rejection,
    recommendationCount: recommendations.length,
  };

  // Record
  if (recommendations.length > 0) {
    await recordDecision("CASE", workerId, "CASE_RECOMMENDATION", recommendations.map(r => r.action).join("; "), recommendations[0]?.confidence ?? 50);
    await advanceStage("CASE", workerId, "DECIDE", `${recommendations.length} recommendations generated`);
  }

  return { cycleId, stage: "DECIDE", summary, recommendations };
}

// ═══ HUMAN OVERRIDE TRACKING ════════════════════════════════════════════════

export async function recordOverride(
  entityType: string, entityId: string, fieldChanged: string,
  valueBefore: string, valueAfter: string, reason: string,
  changedBy: string, aiRecommendation?: string,
): Promise<void> {
  await execute(
    `INSERT INTO human_overrides (entity_type, entity_id, field_changed, value_before, value_after, reason, changed_by, ai_recommendation)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [entityType, entityId, fieldChanged, valueBefore, valueAfter, reason, changedBy, aiRecommendation ?? ""]
  );
  await logAuditEvent(entityId, "HUMAN_OVERRIDE", "USER", changedBy, { fieldChanged, valueBefore, valueAfter, reason });
}

export async function getOverrides(entityId: string): Promise<any[]> {
  return query("SELECT * FROM human_overrides WHERE entity_id = $1 ORDER BY created_at DESC", [entityId]);
}

// ═══ EXTENDED AUDIT QUERIES ═════════════════════════════════════════════════

export async function getFullEntityTimeline(entityId: string): Promise<any[]> {
  // Combine audit events + OODA events + overrides into one timeline
  const audit = await query("SELECT id, event_type as type, actor_type || ':' || actor_id as actor, metadata_json as metadata, created_at, 'audit' as source FROM regulatory_audit_log WHERE update_id = $1", [entityId]);
  const ooda = await query(`SELECT oe.id, oe.stage || ':' || COALESCE(oe.event_type, oe.description) as type, COALESCE(oe.actor_type,'SYSTEM') || ':' || COALESCE(oe.actor_id,oe.actor) as actor, oe.metadata_json as metadata, oe.created_at, 'ooda' as source
    FROM ooda_events oe JOIN ooda_cycles oc ON oc.id = oe.cycle_id WHERE oc.entity_id = $1`, [entityId]);
  const overrides = await query("SELECT id, 'OVERRIDE:' || field_changed as type, changed_by as actor, json_build_object('before', value_before, 'after', value_after, 'reason', reason)::jsonb as metadata, created_at, 'override' as source FROM human_overrides WHERE entity_id = $1", [entityId]);

  return [...audit, ...ooda, ...overrides].sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}
