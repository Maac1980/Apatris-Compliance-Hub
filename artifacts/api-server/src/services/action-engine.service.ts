/**
 * Action Engine — system-driven decisions for every worker.
 * Determines what needs to be done, what documents are required,
 * what can be generated instantly, what requires human review.
 *
 * Deterministic rules only — NO AI. Reads from existing data sources.
 * Does NOT modify legal engine logic.
 */

import { query, queryOne } from "../lib/db.js";
import { getWorkerLegalSnapshot, type LegalSnapshot } from "./legal-status.service.js";
import { generateDocument, type TemplateType } from "./legal-document.service.js";

// ═══ TYPES ══════════════════════════════════════════════════════════════════

export type ActionType = "DOCUMENT" | "AUTHORITY_PACK" | "CASE_UPDATE" | "REVIEW" | "EVIDENCE";
export type ActionPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type ActionStatus = "READY" | "BLOCKED" | "DONE";

export interface WorkerAction {
  id: string;
  type: ActionType;
  title: string;
  description: string;
  priority: ActionPriority;
  required: boolean;
  autoExecutable: boolean;
  templateType?: TemplateType;
  dependsOn?: string[];
  status: ActionStatus;
}

export interface ActionPackage {
  id: string;
  name: string;
  description: string;
  actionsIncluded: string[];
  ready: boolean;
}

export interface WorkerActionsResult {
  workerId: string;
  workerName: string;
  legalStatus: string;
  riskLevel: string;
  caseType: string | null;
  actions: WorkerAction[];
  packages: ActionPackage[];
}

// ═══ CORE: GET WORKER ACTIONS ═══════════════════════════════════════════════

export async function getWorkerActions(workerId: string, tenantId: string): Promise<WorkerActionsResult> {
  // Load all existing data
  const snapshot = await getWorkerLegalSnapshot(workerId, tenantId);

  const worker = await queryOne<any>(
    "SELECT full_name FROM workers WHERE id = $1 AND tenant_id = $2",
    [workerId, tenantId]
  );

  const legalCase = await queryOne<any>(
    "SELECT id, case_type, status, appeal_deadline, mos_status FROM legal_cases WHERE worker_id = $1 AND tenant_id = $2 ORDER BY created_at DESC LIMIT 1",
    [workerId, tenantId]
  );

  const trcCase = await queryOne<any>(
    "SELECT id, status FROM trc_cases WHERE worker_id = $1::text AND tenant_id = $2::text ORDER BY created_at DESC LIMIT 1",
    [workerId, tenantId]
  );

  const evidenceCount = await queryOne<any>(
    "SELECT COUNT(*) as cnt FROM legal_evidence WHERE worker_id = $1 AND tenant_id = $2",
    [workerId, tenantId]
  );

  const hasPoa = await queryOne<any>(
    "SELECT id FROM legal_documents WHERE worker_id = $1 AND tenant_id = $2 AND template_type = 'POWER_OF_ATTORNEY' AND status != 'archived'",
    [workerId, tenantId]
  );

  const hasAuthorityPack = await queryOne<any>(
    "SELECT id, pack_status FROM authority_response_packs WHERE worker_id = $1 AND tenant_id = $2 ORDER BY created_at DESC LIMIT 1",
    [workerId, tenantId]
  );

  const hasTrcApp = await queryOne<any>(
    "SELECT id FROM legal_documents WHERE worker_id = $1 AND tenant_id = $2 AND template_type = 'TRC_APPLICATION' AND status != 'archived'",
    [workerId, tenantId]
  );

  const hasCoverLetter = await queryOne<any>(
    "SELECT id FROM legal_documents WHERE worker_id = $1 AND tenant_id = $2 AND template_type = 'COVER_LETTER' AND status != 'archived'",
    [workerId, tenantId]
  );

  const hasAppeal = await queryOne<any>(
    "SELECT id FROM legal_documents WHERE worker_id = $1 AND tenant_id = $2 AND template_type = 'APPEAL' AND status != 'archived'",
    [workerId, tenantId]
  );

  // Build actions
  const actions: WorkerAction[] = [];
  const status = snapshot.legalStatus;
  const risk = snapshot.riskLevel as ActionPriority;
  const evCount = Number(evidenceCount?.cnt ?? 0);

  // ── POA (always needed if missing) ────────────────────────────────────
  if (!hasPoa) {
    actions.push({
      id: "poa", type: "DOCUMENT", title: "Generate Power of Attorney",
      description: "Pełnomocnictwo required to represent worker before authorities",
      priority: "HIGH", required: true, autoExecutable: true,
      templateType: "POWER_OF_ATTORNEY", status: "READY",
    });
  } else {
    actions.push({ id: "poa", type: "DOCUMENT", title: "Power of Attorney", description: "Already on file", priority: "LOW", required: false, autoExecutable: false, status: "DONE" });
  }

  // ── Status-specific actions ───────────────────────────────────────────

  if (status === "EXPIRING_SOON" || (status === "VALID" && !legalCase)) {
    if (!hasTrcApp) {
      actions.push({
        id: "trc-app", type: "DOCUMENT", title: "Prepare TRC Application",
        description: "Wniosek o zmianę zezwolenia na pobyt czasowy i pracę",
        priority: "HIGH", required: true, autoExecutable: true,
        templateType: "TRC_APPLICATION", dependsOn: ["poa"], status: hasPoa ? "READY" : "BLOCKED",
      });
    } else {
      actions.push({ id: "trc-app", type: "DOCUMENT", title: "TRC Application", description: "Already generated", priority: "LOW", required: false, autoExecutable: false, status: "DONE" });
    }

    if (!hasCoverLetter) {
      actions.push({
        id: "cover-letter", type: "DOCUMENT", title: "Generate Cover Letter",
        description: "Pismo przewodnie do wniosku",
        priority: "MEDIUM", required: true, autoExecutable: true,
        templateType: "COVER_LETTER", dependsOn: ["trc-app"], status: hasTrcApp ? "READY" : "BLOCKED",
      });
    }

    if (!legalCase) {
      actions.push({
        id: "create-case", type: "CASE_UPDATE", title: "Create Legal Case",
        description: "No active legal case — create one to track this worker",
        priority: "HIGH", required: true, autoExecutable: false, status: "READY",
      });
    }
  }

  if (status === "PROTECTED_PENDING") {
    if (!hasAuthorityPack) {
      actions.push({
        id: "auth-pack", type: "AUTHORITY_PACK", title: "Generate Authority Pack",
        description: "Formal response pack for voivodeship (PL/EN/UK)",
        priority: "MEDIUM", required: true, autoExecutable: true, status: legalCase ? "READY" : "BLOCKED",
        dependsOn: legalCase ? undefined : ["create-case"],
      });
    } else if (hasAuthorityPack.pack_status !== "APPROVED") {
      actions.push({
        id: "approve-pack", type: "REVIEW", title: "Approve Authority Pack",
        description: `Pack is ${hasAuthorityPack.pack_status} — needs approval`,
        priority: "MEDIUM", required: true, autoExecutable: false, status: "READY",
      });
    }

    if (evCount === 0) {
      actions.push({
        id: "upload-evidence", type: "EVIDENCE", title: "Upload Filing Evidence",
        description: "No MoS/UPO/filing receipt on file — upload to verify Art. 108",
        priority: "HIGH", required: true, autoExecutable: false, status: "READY",
      });
    }
  }

  if (status === "REVIEW_REQUIRED") {
    actions.push({
      id: "file-inspection", type: "DOCUMENT", title: "Request File Inspection",
      description: "Wniosek o wgląd do akt — verify case status at voivodeship",
      priority: "HIGH", required: false, autoExecutable: true,
      templateType: "FILE_INSPECTION", status: "READY",
    });

    if (evCount === 0) {
      actions.push({
        id: "upload-evidence", type: "EVIDENCE", title: "Upload Missing Evidence",
        description: "No evidence on file — upload filing proof to resolve status",
        priority: "CRITICAL", required: true, autoExecutable: false, status: "READY",
      });
    }
  }

  if (status === "EXPIRED_NOT_PROTECTED" || status === "NO_PERMIT") {
    actions.push({
      id: "urgent-review", type: "REVIEW", title: "Urgent Legal Review",
      description: "Worker has no valid authorization — suspend deployment and consult lawyer",
      priority: "CRITICAL", required: true, autoExecutable: false, status: "READY",
    });

    if (!legalCase) {
      actions.push({
        id: "create-case", type: "CASE_UPDATE", title: "Create Legal Case",
        description: "Start legal case tracking immediately",
        priority: "CRITICAL", required: true, autoExecutable: false, status: "READY",
      });
    }
  }

  if (legalCase?.status === "REJECTED") {
    const deadline = legalCase.appeal_deadline ? new Date(legalCase.appeal_deadline) : null;
    const daysLeft = deadline ? Math.ceil((deadline.getTime() - Date.now()) / 86_400_000) : null;

    if (!hasAppeal) {
      actions.push({
        id: "appeal", type: "DOCUMENT", title: "Prepare Appeal",
        description: `Odwołanie od decyzji${daysLeft !== null ? ` — ${daysLeft} days until deadline` : ""}`,
        priority: "CRITICAL", required: true, autoExecutable: true,
        templateType: "APPEAL", status: "READY",
      });
    }
  }

  // ── Build packages ────────────────────────────────────────────────────

  const packages: ActionPackage[] = [];

  const renewalActions = ["poa", "trc-app", "cover-letter"].filter(id => actions.find(a => a.id === id && a.status !== "DONE"));
  if (renewalActions.length > 0) {
    packages.push({
      id: "trc-renewal", name: "TRC Renewal Package",
      description: "All documents needed for TRC renewal submission",
      actionsIncluded: renewalActions,
      ready: renewalActions.every(id => { const a = actions.find(x => x.id === id); return a?.status === "READY"; }),
    });
  }

  const appealActions = ["appeal"].filter(id => actions.find(a => a.id === id && a.status !== "DONE"));
  if (appealActions.length > 0) {
    packages.push({
      id: "appeal-package", name: "Appeal Package",
      description: "Documents for appealing a rejected decision",
      actionsIncluded: appealActions,
      ready: true,
    });
  }

  const complianceActions = ["upload-evidence", "file-inspection"].filter(id => actions.find(a => a.id === id));
  if (complianceActions.length > 0) {
    packages.push({
      id: "compliance-fix", name: "Compliance Fix Package",
      description: "Resolve missing evidence and unclear status",
      actionsIncluded: complianceActions,
      ready: complianceActions.some(id => { const a = actions.find(x => x.id === id); return a?.status === "READY" && a.autoExecutable; }),
    });
  }

  return {
    workerId,
    workerName: worker?.full_name ?? "Unknown",
    legalStatus: status,
    riskLevel: snapshot.riskLevel,
    caseType: legalCase?.case_type ?? null,
    actions: actions.sort((a, b) => priorityScore(b.priority) - priorityScore(a.priority)),
    packages,
  };
}

// ═══ EXECUTE ACTION ═════════════════════════════════════════════════════════

export async function executeAction(workerId: string, tenantId: string, actionId: string): Promise<{ success: boolean; result?: any; error?: string }> {
  const workerActions = await getWorkerActions(workerId, tenantId);
  const action = workerActions.actions.find(a => a.id === actionId);
  if (!action) return { success: false, error: "Action not found" };
  if (action.status === "DONE") return { success: true, result: { message: "Already completed" } };
  if (action.status === "BLOCKED") return { success: false, error: `Blocked — complete dependencies first: ${action.dependsOn?.join(", ")}` };
  if (!action.autoExecutable) return { success: false, error: "This action requires manual completion" };

  // Execute document generation
  if (action.type === "DOCUMENT" && action.templateType) {
    const legalCase = await queryOne<any>(
      "SELECT id FROM legal_cases WHERE worker_id = $1 AND tenant_id = $2 ORDER BY created_at DESC LIMIT 1",
      [workerId, tenantId]
    );
    const doc = await generateDocument({
      workerId, tenantId, templateType: action.templateType,
      legalCaseId: legalCase?.id, createdBy: "action-engine",
    });
    return { success: true, result: { documentId: doc.id, title: doc.title } };
  }

  // Execute authority pack generation
  if (action.type === "AUTHORITY_PACK") {
    const legalCase = await queryOne<any>(
      "SELECT id FROM legal_cases WHERE worker_id = $1 AND tenant_id = $2 ORDER BY created_at DESC LIMIT 1",
      [workerId, tenantId]
    );
    if (!legalCase) return { success: false, error: "No legal case — create one first" };
    const { generateAuthorityPack } = await import("./authority-response.service.js");
    const pack = await generateAuthorityPack(legalCase.id, tenantId);
    return { success: true, result: { packId: pack.id } };
  }

  return { success: false, error: "Action type not auto-executable" };
}

export async function executePackage(workerId: string, tenantId: string, packageId: string): Promise<{ executed: number; failed: number; results: any[] }> {
  const workerActions = await getWorkerActions(workerId, tenantId);
  const pkg = workerActions.packages.find(p => p.id === packageId);
  if (!pkg) throw new Error("Package not found");

  let executed = 0, failed = 0;
  const results: any[] = [];

  for (const actionId of pkg.actionsIncluded) {
    const action = workerActions.actions.find(a => a.id === actionId);
    if (!action || action.status === "DONE" || !action.autoExecutable) continue;

    const result = await executeAction(workerId, tenantId, actionId);
    results.push({ actionId, ...result });
    if (result.success) executed++; else failed++;
  }

  return { executed, failed, results };
}

// ═══ HELPERS ════════════════════════════════════════════════════════════════

function priorityScore(p: ActionPriority): number {
  return { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }[p] ?? 0;
}
