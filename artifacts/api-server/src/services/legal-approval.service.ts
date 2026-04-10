/**
 * Global Legal Approval Service — controls output approval for all legal entities.
 *
 * Any legal output (authority pack, AI explanation, rejection draft)
 * must be explicitly approved before external use.
 *
 * Does NOT change any generation logic. Only controls the is_approved flag.
 */

import { queryOne } from "../lib/db.js";

// ═══ TYPES ══════════════════════════════════════════════════════════════════

export type ApprovableEntity = "authority_pack" | "ai_response" | "rejection_analysis";

export interface ApprovalResult {
  entityType: ApprovableEntity;
  entityId: string;
  isApproved: boolean;
  approvedBy: string;
  approvedAt: string;
}

export interface ApprovalStatus {
  entityType: ApprovableEntity;
  entityId: string;
  isApproved: boolean;
  approvedBy: string | null;
  approvedAt: string | null;
}

// ═══ TABLE MAPPING ══════════════════════════════════════════════════════════

const ENTITY_CONFIG: Record<ApprovableEntity, { table: string; tenantCol: boolean }> = {
  authority_pack:     { table: "authority_response_packs", tenantCol: true },
  ai_response:        { table: "ai_responses",            tenantCol: false },
  rejection_analysis: { table: "rejection_analyses",      tenantCol: true },
};

// ═══ CORE ═══════════════════════════════════════════════════════════════════

export async function approveEntity(
  entityType: ApprovableEntity,
  entityId: string,
  approvedBy: string,
  tenantId?: string,
): Promise<ApprovalResult> {
  const cfg = ENTITY_CONFIG[entityType];
  if (!cfg) throw new Error(`Unknown entity type: ${entityType}`);

  let sql = `UPDATE ${cfg.table} SET is_approved = TRUE, approved_by = $1, approved_at = NOW(), updated_at = NOW() WHERE id = $2`;
  const params: unknown[] = [approvedBy, entityId];

  if (cfg.tenantCol && tenantId) {
    params.push(tenantId);
    sql += ` AND tenant_id = $${params.length}`;
  }

  sql += " RETURNING id, is_approved, approved_by, approved_at";

  const row = await queryOne<any>(sql, params);
  if (!row) throw new Error(`Entity not found or already processed: ${entityType}/${entityId}`);

  // For authority_pack, also update pack_status to APPROVED if still DRAFT/REVIEW_REQUIRED
  if (entityType === "authority_pack") {
    await queryOne(
      `UPDATE authority_response_packs SET pack_status = 'APPROVED', updated_at = NOW()
       WHERE id = $1 AND pack_status IN ('DRAFT','REVIEW_REQUIRED')`,
      [entityId]
    );
  }

  return {
    entityType,
    entityId,
    isApproved: true,
    approvedBy,
    approvedAt: row.approved_at,
  };
}

export async function isApproved(
  entityType: ApprovableEntity,
  entityId: string,
): Promise<ApprovalStatus> {
  const cfg = ENTITY_CONFIG[entityType];
  if (!cfg) throw new Error(`Unknown entity type: ${entityType}`);

  const row = await queryOne<any>(
    `SELECT id, is_approved, approved_by, approved_at FROM ${cfg.table} WHERE id = $1`,
    [entityId]
  );
  if (!row) throw new Error(`Entity not found: ${entityType}/${entityId}`);

  return {
    entityType,
    entityId,
    isApproved: row.is_approved === true,
    approvedBy: row.approved_by ?? null,
    approvedAt: row.approved_at ?? null,
  };
}
