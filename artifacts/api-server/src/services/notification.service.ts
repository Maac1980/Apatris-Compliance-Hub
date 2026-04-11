/**
 * Notification Service — Stage 7
 * Real delivery layer replacing console.log hooks.
 * Stores in DB, routes by role, serves via API.
 */

import { query, queryOne, execute } from "../lib/db.js";

export interface NotificationPayload {
  type: "REVIEW_ASSIGNED" | "APPROVAL_REQUIRED" | "DEPLOYMENT_READY" | "DEPLOYMENT_EXECUTED" | "CRITICAL_ALERT" | "INFO";
  title: string;
  message: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  entityType?: string;
  entityId?: string;
  metadata?: any;
}

// Role routing rules
const ROLE_ROUTING: Record<string, string[]> = {
  REVIEW_ASSIGNED: ["LegalHead", "TechOps"],
  APPROVAL_REQUIRED: ["LegalHead", "TechOps", "Admin"],
  DEPLOYMENT_READY: ["Admin", "Executive"],
  DEPLOYMENT_EXECUTED: ["Admin", "Executive"],
  CRITICAL_ALERT: ["Admin", "Executive", "LegalHead"],
  INFO: ["Admin"],
};

export async function sendNotification(payload: NotificationPayload, userId?: string, role?: string): Promise<void> {
  await execute(
    `INSERT INTO notifications (user_id, role, type, title, message, severity, entity_type, entity_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [userId ?? null, role ?? null, payload.type, payload.title, payload.message,
     payload.severity, payload.entityType ?? null, payload.entityId ?? null]
  );
  console.log(`[RegIntel][Notify] ${payload.type}: ${payload.title} → ${role ?? userId ?? "broadcast"}`);
}

export async function sendToRole(role: string, payload: NotificationPayload): Promise<void> {
  await sendNotification(payload, undefined, role);
}

export async function sendToRoles(payload: NotificationPayload): Promise<void> {
  const roles = ROLE_ROUTING[payload.type] ?? ["Admin"];
  // Severity filter: EXECUTIVE only gets CRITICAL
  const filtered = payload.severity === "CRITICAL" ? [...roles, "Executive"] : roles;
  for (const role of [...new Set(filtered)]) {
    await sendNotification(payload, undefined, role);
  }
}

export async function getNotifications(userId?: string, role?: string, limit = 20): Promise<any[]> {
  if (userId) {
    return query("SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2", [userId, limit]);
  }
  if (role) {
    return query("SELECT * FROM notifications WHERE (role = $1 OR role IS NULL) ORDER BY created_at DESC LIMIT $2", [role, limit]);
  }
  return query("SELECT * FROM notifications ORDER BY created_at DESC LIMIT $1", [limit]);
}

export async function getUnreadCount(role?: string): Promise<number> {
  const condition = role ? "AND (role = $1 OR role IS NULL)" : "";
  const params = role ? [role] : [];
  const row = await queryOne<any>(`SELECT COUNT(*)::int as c FROM notifications WHERE read = false ${condition}`, params);
  return row?.c ?? 0;
}

export async function markRead(id: string): Promise<void> {
  await execute("UPDATE notifications SET read = true WHERE id = $1", [id]);
}

// ═══ HOOK REPLACEMENTS (called from deployment service) ═════════════════════

export async function notifyReviewAssigned(taskId: string, role: string, updateTitle: string): Promise<void> {
  await sendToRoles({
    type: "REVIEW_ASSIGNED", title: "Review Task Assigned",
    message: `New review task for "${updateTitle}" assigned to ${role}.`,
    severity: "MEDIUM", entityType: "regulatory_review_task", entityId: taskId,
  });
}

export async function notifyApprovalNeeded(updateId: string, severity: string): Promise<void> {
  await sendToRoles({
    type: "APPROVAL_REQUIRED", title: "Approval Required",
    message: `Regulatory update requires ${severity} approval.`,
    severity: severity === "CRITICAL" ? "CRITICAL" : "HIGH",
    entityType: "regulatory_update", entityId: updateId,
  });
}

export async function notifyDeploymentReady(updateId: string): Promise<void> {
  await sendToRoles({
    type: "DEPLOYMENT_READY", title: "Deployment Ready",
    message: "Approved regulatory update ready for deployment.",
    severity: "HIGH", entityType: "regulatory_update", entityId: updateId,
  });
}

export async function notifyDeploymentExecuted(updateId: string, userId: string, count: number): Promise<void> {
  await sendToRoles({
    type: "DEPLOYMENT_EXECUTED", title: "Deployment Executed",
    message: `${count} deployment items executed by ${userId}.`,
    severity: "MEDIUM", entityType: "regulatory_update", entityId: updateId,
  });
}
