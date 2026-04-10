/**
 * TRC Case Workspace — structured task tracking, document linking,
 * readiness scoring, and AI guidance for TRC cases.
 *
 * Read-only AI. No auto-submission. No status overrides.
 * Uses existing legal_cases, worker_files, legal_evidence tables.
 */

import { query, queryOne, execute } from "../lib/db.js";
import { getAIProvider } from "./ai-provider.js";
import { analyzeCaseIntelligence } from "./case-intelligence.service.js";

// ═══ TYPES ══════════════════════════════════════════════════════════════════

export type TaskStatus = "not_started" | "in_progress" | "completed";
export type CaseReadiness = "NOT_READY" | "IN_PROGRESS" | "READY_FOR_SUBMISSION";

export interface CaseTask {
  id: string;
  case_id: string;
  task_key: string;
  label: string;
  status: TaskStatus;
  required: boolean;
  linked_document_id: string | null;
  notes: string | null;
  updated_at: string;
}

export interface TrcCaseView {
  caseId: string;
  workerId: string;
  workerName: string;
  employerName: string | null;
  caseType: string;
  caseStatus: string;
  tasks: CaseTask[];
  readiness: CaseReadiness;
  readinessPercent: number;
  documents: Array<{ id: string; fileName: string; docType: string; status: string; createdAt: string }>;
  timeline: Array<{ date: string; action: string; detail: string }>;
}

// ═══ DEFAULT TASKS ══════════════════════════════════════════════════════════

const DEFAULT_TRC_TASKS = [
  { key: "passport_copy", label: "Passport copy", required: true },
  { key: "work_contract", label: "Work contract (Umowa)", required: true },
  { key: "employer_declaration", label: "Employer declaration", required: true },
  { key: "trc_application", label: "TRC application submission", required: true },
  { key: "upo_receipt", label: "UPO receipt", required: true },
  { key: "mos_submission", label: "MOS submission", required: false },
  { key: "insurance_proof", label: "Insurance proof (ZUS/private)", required: true },
  { key: "address_registration", label: "Address registration (zameldowanie)", required: true },
  { key: "photos", label: "Biometric photos (4x)", required: false },
  { key: "medical_exam", label: "Medical exam (Badania lekarskie)", required: false },
  { key: "fee_payment", label: "Application fee payment (440 PLN)", required: false },
];

// ═══ TABLE SETUP ════════════════════════════════════════════════════════════

async function ensureTable(): Promise<void> {
  await execute(`
    CREATE TABLE IF NOT EXISTS case_tasks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      case_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL DEFAULT 'default',
      task_key TEXT NOT NULL,
      label TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'not_started',
      required BOOLEAN NOT NULL DEFAULT true,
      linked_document_id TEXT,
      notes TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(case_id, task_key)
    )
  `);
}

// ═══ INIT TASKS FOR A CASE ══════════════════════════════════════════════════

export async function initCaseTasks(caseId: string, tenantId: string): Promise<CaseTask[]> {
  await ensureTable();

  // Check if tasks already exist
  const existing = await query<CaseTask>(
    `SELECT * FROM case_tasks WHERE case_id = $1 AND tenant_id = $2 ORDER BY created_at`,
    [caseId, tenantId],
  );
  if (existing.length > 0) return existing;

  // Seed default tasks
  for (const t of DEFAULT_TRC_TASKS) {
    await execute(
      `INSERT INTO case_tasks (case_id, tenant_id, task_key, label, required)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (case_id, task_key) DO NOTHING`,
      [caseId, tenantId, t.key, t.label, t.required],
    );
  }

  return query<CaseTask>(
    `SELECT * FROM case_tasks WHERE case_id = $1 AND tenant_id = $2 ORDER BY created_at`,
    [caseId, tenantId],
  );
}

// ═══ UPDATE TASK ════════════════════════════════════════════════════════════

export async function updateTask(
  taskId: string, tenantId: string,
  updates: { status?: TaskStatus; notes?: string; linkedDocumentId?: string },
): Promise<CaseTask | null> {
  await ensureTable();
  const sets: string[] = ["updated_at = NOW()"];
  const params: unknown[] = [];
  let idx = 1;

  if (updates.status) { sets.push(`status = $${idx++}`); params.push(updates.status); }
  if (updates.notes !== undefined) { sets.push(`notes = $${idx++}`); params.push(updates.notes); }
  if (updates.linkedDocumentId !== undefined) { sets.push(`linked_document_id = $${idx++}`); params.push(updates.linkedDocumentId); }

  params.push(taskId, tenantId);
  return queryOne<CaseTask>(
    `UPDATE case_tasks SET ${sets.join(", ")} WHERE id = $${idx++} AND tenant_id = $${idx} RETURNING *`,
    params,
  );
}

// ═══ GET FULL CASE VIEW ═════════════════════════════════════════════════════

export async function getTrcCaseView(caseId: string, tenantId: string): Promise<TrcCaseView> {
  await ensureTable();

  // Load case
  const lc = await queryOne<Record<string, any>>(
    `SELECT * FROM legal_cases WHERE id = $1 AND tenant_id = $2`, [caseId, tenantId],
  );
  if (!lc) throw new Error("Case not found");

  // Load worker
  const w = await queryOne<Record<string, any>>(
    `SELECT name, full_name FROM workers WHERE id = $1`, [lc.worker_id],
  );

  // Load employer from trc_cases if available
  const trc = await queryOne<{ employer_name: string }>(
    `SELECT employer_name FROM trc_cases WHERE worker_id = $1::text AND tenant_id = $2::text ORDER BY created_at DESC LIMIT 1`,
    [lc.worker_id, tenantId],
  ).catch(() => null);

  // Tasks
  const tasks = await initCaseTasks(caseId, tenantId);

  // Documents linked to this case
  const docs = await query<{ id: string; file_name: string; doc_type: string; status: string; created_at: string }>(
    `SELECT id, file_name, doc_type, status, created_at FROM worker_files
     WHERE case_id = $1 AND tenant_id = $2 ORDER BY created_at DESC`,
    [caseId, tenantId],
  ).catch(() => [] as any[]);

  // Also get documents linked to this worker (for broader view)
  const workerDocs = await query<{ id: string; file_name: string; doc_type: string; status: string; created_at: string }>(
    `SELECT id, file_name, doc_type, status, created_at FROM worker_files
     WHERE worker_id = $1 AND tenant_id = $2 AND case_id IS NULL ORDER BY created_at DESC LIMIT 20`,
    [lc.worker_id, tenantId],
  ).catch(() => [] as any[]);

  const allDocs = [...docs, ...workerDocs].map(d => ({
    id: d.id, fileName: d.file_name, docType: d.doc_type, status: d.status, createdAt: d.created_at,
  }));

  // Timeline
  const timeline: Array<{ date: string; action: string; detail: string }> = [];

  // Case creation
  timeline.push({ date: lc.created_at, action: "Case created", detail: `Type: ${lc.case_type}, Status: ${lc.status}` });

  // Task completions
  for (const t of tasks) {
    if (t.status === "completed") {
      timeline.push({ date: t.updated_at, action: "Task completed", detail: t.label });
    } else if (t.status === "in_progress") {
      timeline.push({ date: t.updated_at, action: "Task started", detail: t.label });
    }
  }

  // Document uploads
  for (const d of allDocs.slice(0, 10)) {
    timeline.push({ date: d.createdAt, action: "Document uploaded", detail: `${d.fileName} (${d.docType})` });
  }

  timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Readiness
  const requiredTasks = tasks.filter(t => t.required);
  const completedRequired = requiredTasks.filter(t => t.status === "completed").length;
  const readinessPercent = requiredTasks.length > 0 ? Math.round((completedRequired / requiredTasks.length) * 100) : 0;
  const readiness: CaseReadiness =
    completedRequired === requiredTasks.length ? "READY_FOR_SUBMISSION" :
    completedRequired > 0 ? "IN_PROGRESS" : "NOT_READY";

  return {
    caseId,
    workerId: lc.worker_id,
    workerName: w?.name ?? w?.full_name ?? "—",
    employerName: trc?.employer_name ?? null,
    caseType: lc.case_type,
    caseStatus: lc.status,
    tasks,
    readiness,
    readinessPercent,
    documents: allDocs,
    timeline: timeline.slice(0, 20),
  };
}

// ═══ AI GUIDANCE ════════════════════════════════════════════════════════════

export async function getCaseGuidance(caseId: string, tenantId: string, prompt: string): Promise<{ guidance: string; source: string }> {
  const view = await getTrcCaseView(caseId, tenantId);

  // Build deterministic context
  const taskSummary = view.tasks.map(t => `- ${t.label}: ${t.status}${t.required ? " (required)" : ""}`).join("\n");
  const docSummary = view.documents.map(d => `- ${d.fileName} (${d.docType})`).join("\n") || "No documents uploaded yet.";

  const context = `CASE DATA (source of truth — do NOT contradict):
Worker: ${view.workerName}
Employer: ${view.employerName ?? "Unknown"}
Case Type: ${view.caseType}
Case Status: ${view.caseStatus}
Readiness: ${view.readiness} (${view.readinessPercent}%)

TASKS:
${taskSummary}

DOCUMENTS ON FILE:
${docSummary}`;

  const ai = getAIProvider();
  if (ai?.isAvailable()) {
    try {
      const answer = await ai.complete(
        `${context}\n\nQUESTION: ${prompt}\n\nAnswer based ONLY on the data above. Never invent documents or tasks. Never guarantee outcomes. Output is advisory only.`,
        {
          system: "You are a Polish immigration case assistant. Answer based only on provided case data. Never fabricate information. All guidance is advisory — requires human review.",
          maxTokens: 600,
        },
      );
      return { guidance: answer, source: "ai" };
    } catch { /* fallback */ }
  }

  // Deterministic fallback
  const missing = view.tasks.filter(t => t.required && t.status !== "completed");
  if (missing.length === 0) {
    return { guidance: `All required tasks are completed. Case readiness: ${view.readiness}. Review and proceed with submission.`, source: "deterministic" };
  }
  return {
    guidance: `Missing ${missing.length} required task(s):\n${missing.map(t => `- ${t.label}`).join("\n")}\n\nComplete these before submission.`,
    source: "deterministic",
  };
}

// ═══ FULL INTELLIGENCE VIEW ═════════════════════════════════════════════════

/**
 * Combines TRC workspace tasks with case intelligence engine analysis.
 * Returns both task-level tracking and document/risk/legal article analysis.
 */
export async function getFullCaseIntelligence(caseId: string, tenantId: string) {
  const view = await getTrcCaseView(caseId, tenantId);

  let intelligence = null;
  try {
    intelligence = await analyzeCaseIntelligence(view.workerId, tenantId);
  } catch { /* intelligence unavailable */ }

  return {
    workspace: view,
    intelligence,
  };
}
