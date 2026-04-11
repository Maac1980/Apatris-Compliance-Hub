/**
 * OODA Engine — tracks Observe-Orient-Decide-Act cycles.
 * Maps regulatory pipeline stages to OODA loop.
 */

import { query, queryOne, execute } from "../lib/db.js";

type Stage = "OBSERVE" | "ORIENT" | "DECIDE" | "ACT";

export async function createOrGetCycle(entityType: string, entityId: string): Promise<string> {
  const existing = await queryOne<any>("SELECT id FROM ooda_cycles WHERE entity_type = $1 AND entity_id = $2", [entityType, entityId]);
  if (existing) return existing.id;

  const row = await queryOne<{ id: string }>(
    "INSERT INTO ooda_cycles (entity_type, entity_id, current_stage, status) VALUES ($1,$2,'OBSERVE','ACTIVE') RETURNING id",
    [entityType, entityId]
  );
  return row!.id;
}

export async function advanceStage(entityType: string, entityId: string, stage: Stage, description: string, actor = "SYSTEM"): Promise<void> {
  const cycleId = await createOrGetCycle(entityType, entityId);
  await execute("UPDATE ooda_cycles SET current_stage = $1, status = $2 WHERE id = $3",
    [stage, stage === "ACT" ? "COMPLETED" : "ACTIVE", cycleId]);
  if (stage === "ACT") await execute("UPDATE ooda_cycles SET completed_at = NOW() WHERE id = $1", [cycleId]);

  await execute(
    "INSERT INTO ooda_events (cycle_id, stage, description, actor) VALUES ($1,$2,$3,$4)",
    [cycleId, stage, description, actor]
  );
}

export async function recordDecision(entityType: string, entityId: string, decisionType: string, reasoning: string, confidence: number): Promise<void> {
  const cycleId = await createOrGetCycle(entityType, entityId);
  await execute(
    "INSERT INTO ooda_decisions (cycle_id, decision_type, reasoning, confidence) VALUES ($1,$2,$3,$4)",
    [cycleId, decisionType, reasoning, confidence]
  );
}

export async function getCycle(entityType: string, entityId: string): Promise<any> {
  const cycle = await queryOne<any>("SELECT * FROM ooda_cycles WHERE entity_type = $1 AND entity_id = $2", [entityType, entityId]);
  if (!cycle) return null;

  const events = await query("SELECT * FROM ooda_events WHERE cycle_id = $1 ORDER BY created_at", [cycle.id]);
  const decisions = await query("SELECT * FROM ooda_decisions WHERE cycle_id = $1 ORDER BY created_at", [cycle.id]);

  return { ...cycle, events, decisions };
}

export async function getActiveCycles(limit = 50): Promise<any[]> {
  return query(
    `SELECT oc.*, ru.title as entity_title FROM ooda_cycles oc
     LEFT JOIN regulatory_updates ru ON ru.id = oc.entity_id AND oc.entity_type = 'REGULATORY'
     ORDER BY oc.created_at DESC LIMIT $1`, [limit]
  );
}
