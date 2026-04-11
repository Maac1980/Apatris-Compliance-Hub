/**
 * Regulatory Review Workflow + Approval Service — Stage 4
 *
 * Human control gate: creates review tasks, manages approvals,
 * gates deployment readiness. NO auto-changes to legal engine.
 *
 * Status flow:
 *   INGESTED → UNDER_REVIEW → REVIEWED / APPROVED_FOR_DEPLOYMENT / REJECTED
 */

import { query, queryOne, execute } from "../lib/db.js";
import { prepareDeployment, logAuditEvent } from "./regulatory-deployment.service.js";

// ═══ TYPES ══════════════════════════════════════════════════════════════════

type ReviewType = "LEGAL" | "OPS" | "ADMIN";
type TaskStatus = "PENDING" | "IN_REVIEW" | "APPROVED" | "REJECTED" | "EDIT_REQUESTED";
type Decision = "APPROVED" | "REJECTED" | "EDIT_REQUESTED";

// ═══ REVIEW TASK CREATION ═══════════════════════════════════════════════════

export async function createReviewTasks(updateId: string): Promise<any[]> {
  const update = await queryOne<any>("SELECT id, severity, relevant_topics, requires_human_review FROM regulatory_updates WHERE id = $1", [updateId]);
  if (!update) return [];

  const severity = update.severity ?? "LOW";
  const topics: string[] = update.relevant_topics ?? [];
  const now = new Date();
  const tasks: Array<{ role: string; type: ReviewType; priority: number; dueDate: Date }> = [];

  if (severity === "CRITICAL") {
    tasks.push(
      { role: "LegalHead", type: "LEGAL", priority: 1, dueDate: addHours(now, 24) },
      { role: "TechOps", type: "OPS", priority: 1, dueDate: addHours(now, 24) },
      { role: "Admin", type: "ADMIN", priority: 1, dueDate: addHours(now, 24) },
    );
  } else if (severity === "HIGH") {
    tasks.push(
      { role: "LegalHead", type: "LEGAL", priority: 2, dueDate: addHours(now, 48) },
      { role: "TechOps", type: "OPS", priority: 2, dueDate: addHours(now, 48) },
    );
  } else if (severity === "MEDIUM") {
    const isLegal = topics.some(t => ["immigration", "residence_card", "work_permit", "labor_law"].includes(t));
    tasks.push({
      role: isLegal ? "LegalHead" : "TechOps",
      type: isLegal ? "LEGAL" : "OPS",
      priority: 3,
      dueDate: addHours(now, 72),
    });
  }
  // LOW severity: no tasks created

  const created: any[] = [];
  for (const t of tasks) {
    const row = await queryOne<any>(
      `INSERT INTO regulatory_review_tasks (update_id, assigned_role, review_type, task_status, priority, due_date)
       VALUES ($1,$2,$3,'PENDING',$4,$5) RETURNING *`,
      [updateId, t.role, t.type, t.priority, t.dueDate.toISOString()]
    );
    if (row) created.push(row);
  }

  // Update status to UNDER_REVIEW if tasks were created
  if (created.length > 0) {
    await execute("UPDATE regulatory_updates SET status = 'UNDER_REVIEW', updated_at = NOW() WHERE id = $1", [updateId]);
  }

  return created;
}

// ═══ TASK MANAGEMENT ════════════════════════════════════════════════════════

export async function getReviewTasks(updateId: string): Promise<any[]> {
  return query("SELECT * FROM regulatory_review_tasks WHERE update_id = $1 ORDER BY priority, created_at", [updateId]);
}

export async function assignReviewer(taskId: string, userId: string): Promise<any> {
  return queryOne(
    "UPDATE regulatory_review_tasks SET assigned_user_id = $1, task_status = 'IN_REVIEW', updated_at = NOW() WHERE id = $2 RETURNING *",
    [userId, taskId]
  );
}

export async function updateTaskStatus(taskId: string, status: TaskStatus, notes?: string): Promise<any> {
  return queryOne(
    "UPDATE regulatory_review_tasks SET task_status = $1, notes = COALESCE($2, notes), updated_at = NOW() WHERE id = $3 RETURNING *",
    [status, notes ?? null, taskId]
  );
}

export async function getReviewQueue(filters?: { status?: string; role?: string }): Promise<any[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (filters?.status) { conditions.push(`rt.task_status = $${idx++}`); params.push(filters.status); }
  if (filters?.role) { conditions.push(`rt.assigned_role = $${idx++}`); params.push(filters.role); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return query(
    `SELECT rt.*, ru.title as update_title, ru.severity as update_severity, ru.update_type, ru.jurisdiction
     FROM regulatory_review_tasks rt
     LEFT JOIN regulatory_updates ru ON ru.id = rt.update_id
     ${where} ORDER BY rt.priority, rt.due_date NULLS LAST`,
    params
  );
}

// ═══ APPROVAL SERVICE ═══════════════════════════════════════════════════════

export async function approveTask(taskId: string, userId: string, notes?: string): Promise<{ task: any; updateStatus: string }> {
  // Update task
  const task = await queryOne<any>(
    "UPDATE regulatory_review_tasks SET task_status = 'APPROVED', notes = COALESCE($1, notes), updated_at = NOW() WHERE id = $2 RETURNING *",
    [notes ?? null, taskId]
  );
  if (!task) throw new Error("Task not found");

  // Record approval
  await execute(
    "INSERT INTO regulatory_approvals (update_id, review_task_id, approver_user_id, approval_decision, approval_notes) VALUES ($1,$2,$3,'APPROVED',$4)",
    [task.update_id, taskId, userId, notes ?? ""]
  );

  // Check if all required approvals are met
  const newStatus = await checkApprovalCompletion(task.update_id);
  return { task, updateStatus: newStatus };
}

export async function rejectTask(taskId: string, userId: string, notes?: string): Promise<{ task: any; updateStatus: string }> {
  const task = await queryOne<any>(
    "UPDATE regulatory_review_tasks SET task_status = 'REJECTED', notes = COALESCE($1, notes), updated_at = NOW() WHERE id = $2 RETURNING *",
    [notes ?? null, taskId]
  );
  if (!task) throw new Error("Task not found");

  await execute(
    "INSERT INTO regulatory_approvals (update_id, review_task_id, approver_user_id, approval_decision, approval_notes) VALUES ($1,$2,$3,'REJECTED',$4)",
    [task.update_id, taskId, userId, notes ?? ""]
  );

  // Any rejection → update REJECTED
  await execute("UPDATE regulatory_updates SET status = 'REJECTED', updated_at = NOW() WHERE id = $1", [task.update_id]);
  await logAuditEvent(task.update_id, "UPDATE_REJECTED", "USER", userId, { taskId, notes: notes ?? "" });
  return { task, updateStatus: "REJECTED" };
}

export async function requestEdit(taskId: string, userId: string, notes?: string): Promise<any> {
  const task = await queryOne<any>(
    "UPDATE regulatory_review_tasks SET task_status = 'EDIT_REQUESTED', notes = COALESCE($1, notes), updated_at = NOW() WHERE id = $2 RETURNING *",
    [notes ?? null, taskId]
  );
  if (!task) throw new Error("Task not found");

  await execute(
    "INSERT INTO regulatory_approvals (update_id, review_task_id, approver_user_id, approval_decision, approval_notes) VALUES ($1,$2,$3,'EDIT_REQUESTED',$4)",
    [task.update_id, taskId, userId, notes ?? ""]
  );

  return task;
}

export async function getApprovals(updateId: string): Promise<any[]> {
  return query("SELECT * FROM regulatory_approvals WHERE update_id = $1 ORDER BY approved_at DESC", [updateId]);
}

// ═══ APPROVAL COMPLETION CHECK ══════════════════════════════════════════════

async function checkApprovalCompletion(updateId: string): Promise<string> {
  const tasks = await query<any>("SELECT review_type, task_status FROM regulatory_review_tasks WHERE update_id = $1", [updateId]);
  if (tasks.length === 0) return "INGESTED";

  const allApproved = tasks.every(t => t.task_status === "APPROVED");
  const anyRejected = tasks.some(t => t.task_status === "REJECTED");

  if (anyRejected) {
    await execute("UPDATE regulatory_updates SET status = 'REJECTED', updated_at = NOW() WHERE id = $1", [updateId]);
    return "REJECTED";
  }

  if (allApproved) {
    // Check required review types based on severity
    const update = await queryOne<any>("SELECT severity FROM regulatory_updates WHERE id = $1", [updateId]);
    const severity = update?.severity ?? "LOW";

    const types = new Set(tasks.filter(t => t.task_status === "APPROVED").map(t => t.review_type));

    let complete = false;
    if (severity === "CRITICAL") {
      complete = types.has("LEGAL") && types.has("OPS") && types.has("ADMIN");
    } else if (severity === "HIGH") {
      complete = types.has("LEGAL") && types.has("OPS");
    } else {
      complete = tasks.length > 0; // MEDIUM: any 1 approval is enough
    }

    if (complete) {
      await execute("UPDATE regulatory_updates SET status = 'APPROVED_FOR_DEPLOYMENT', updated_at = NOW() WHERE id = $1", [updateId]);
      await logAuditEvent(updateId, "UPDATE_APPROVED", "SYSTEM", "approval-engine", { severity, requiredTypes: [...types] });
      // Auto-prepare deployment plan (failures don't break approval)
      try { await prepareDeployment(updateId); } catch {}
      return "APPROVED_FOR_DEPLOYMENT";
    } else {
      await execute("UPDATE regulatory_updates SET status = 'REVIEWED', updated_at = NOW() WHERE id = $1", [updateId]);
      return "REVIEWED";
    }
  }

  return "UNDER_REVIEW";
}

// ═══ HELPERS ════════════════════════════════════════════════════════════════

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}
