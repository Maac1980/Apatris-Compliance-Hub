/**
 * Regulatory Impact Mapping + Simulation — Stage 3
 *
 * Maps classified updates to Apatris modules.
 * Simulates effect on workers/cases/employers with read-only queries.
 *
 * NO writes to workers, cases, or legal engine.
 * NO approvals. NO deployment. Read-only impact assessment.
 */

import { query, queryOne, execute } from "../lib/db.js";

// ═══ TYPES ══════════════════════════════════════════════════════════════════

type ImpactedModule = "legal_engine_rules" | "worker_status_logic" | "compliance_status_logic"
  | "document_requirements" | "case_completeness_matrix" | "appeal_templates"
  | "authority_draft_templates" | "onboarding_workflows" | "payroll_zus_logic"
  | "dashboard_metrics" | "notification_logic" | "readiness_engine";

type ImpactType = "RULE_CHANGE" | "TEMPLATE_UPDATE" | "CHECKLIST_UPDATE" | "WORKFLOW_UPDATE"
  | "DOCUMENT_REQUIREMENT_CHANGE" | "DEADLINE_CHANGE" | "PROCESS_CHANGE" | "NO_ACTION";

type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
type RiskLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
type Workload = "LOW" | "MEDIUM" | "HIGH";

export interface ImpactRecord {
  impactedModule: ImpactedModule;
  impactType: ImpactType;
  impactSeverity: Severity;
  recommendedChange: string;
  reasoning: string;
  evidence: Record<string, any>;
}

export interface SimulationResult {
  affectedWorkersCount: number;
  affectedCasesCount: number;
  affectedEmployersCount: number;
  affectedWorkerIds: string[];
  affectedCaseIds: string[];
  operationalRiskLevel: RiskLevel;
  legalRiskLevel: RiskLevel;
  estimatedWorkload: Workload;
  reasoning: string;
}

// ═══ TOPIC → MODULE MAPPING ═════════════════════════════════════════════════

const TOPIC_MODULE_MAP: Record<string, ImpactedModule[]> = {
  immigration: ["legal_engine_rules", "worker_status_logic", "readiness_engine"],
  residence_card: ["legal_engine_rules", "worker_status_logic", "case_completeness_matrix", "document_requirements"],
  work_permit: ["legal_engine_rules", "document_requirements", "compliance_status_logic", "onboarding_workflows"],
  labor_law: ["compliance_status_logic", "onboarding_workflows", "dashboard_metrics"],
  payroll_zus: ["payroll_zus_logic", "dashboard_metrics"],
  gdpr: ["onboarding_workflows", "compliance_status_logic"],
  compliance: ["compliance_status_logic", "dashboard_metrics", "readiness_engine"],
  employer_obligations: ["onboarding_workflows", "compliance_status_logic", "notification_logic"],
};

const UPDATE_TYPE_IMPACT: Record<string, ImpactType> = {
  NEW_LAW: "RULE_CHANGE",
  AMENDMENT: "RULE_CHANGE",
  GUIDANCE: "PROCESS_CHANGE",
  COURT_DECISION: "RULE_CHANGE",
  ADMINISTRATIVE_CHANGE: "WORKFLOW_UPDATE",
  PROCESS_CHANGE: "PROCESS_CHANGE",
  DOCUMENTATION_CHANGE: "DOCUMENT_REQUIREMENT_CHANGE",
  CONSULTATION: "NO_ACTION",
  DEADLINE_UPDATE: "DEADLINE_CHANGE",
};

// ═══ IMPACT MAPPING ═════════════════════════════════════════════════════════

export async function mapImpact(updateId: string, tenantId?: string): Promise<ImpactRecord[]> {
  const update = await queryOne<any>("SELECT * FROM regulatory_updates WHERE id = $1", [updateId]);
  if (!update) return [];

  const topics: string[] = update.relevant_topics ?? [];
  const updateType: string = update.update_type ?? "GUIDANCE";
  const severity: string = update.severity ?? "LOW";
  const docTypes: string[] = update.affected_document_types ?? [];
  const workerTypes: string[] = update.affected_worker_types ?? [];

  const impacts: ImpactRecord[] = [];
  const seenModules = new Set<string>();

  // Map topics to modules
  for (const topic of topics) {
    const modules = TOPIC_MODULE_MAP[topic] ?? [];
    for (const mod of modules) {
      if (seenModules.has(mod)) continue;
      seenModules.add(mod);

      const impactType = UPDATE_TYPE_IMPACT[updateType] ?? "PROCESS_CHANGE";
      const impactSeverity = computeModuleSeverity(severity, mod, updateType);

      impacts.push({
        impactedModule: mod,
        impactType,
        impactSeverity,
        recommendedChange: generateRecommendation(mod, impactType, update),
        reasoning: `Topic "${topic}" maps to module "${mod}". Update type "${updateType}" indicates ${impactType}.`,
        evidence: { topic, updateType, severity, docTypes: docTypes.slice(0, 5), workerTypes: workerTypes.slice(0, 5) },
      });
    }
  }

  // Document requirement changes
  if (docTypes.length > 0 && !seenModules.has("document_requirements")) {
    impacts.push({
      impactedModule: "document_requirements",
      impactType: "DOCUMENT_REQUIREMENT_CHANGE",
      impactSeverity: severity === "CRITICAL" ? "CRITICAL" : "MEDIUM",
      recommendedChange: `Review document requirements for: ${docTypes.join(", ")}`,
      reasoning: `Update affects document types: ${docTypes.join(", ")}`,
      evidence: { docTypes },
    });
  }

  // Deadline changes
  if (update.deadline_date && !seenModules.has("readiness_engine")) {
    impacts.push({
      impactedModule: "readiness_engine",
      impactType: "DEADLINE_CHANGE",
      impactSeverity: "HIGH",
      recommendedChange: `New deadline: ${update.deadline_date}. Update case readiness checks.`,
      reasoning: `Deadline date detected: ${update.deadline_date}`,
      evidence: { deadlineDate: update.deadline_date },
    });
  }

  // If no impacts found, add NO_ACTION
  if (impacts.length === 0) {
    impacts.push({
      impactedModule: "dashboard_metrics",
      impactType: "NO_ACTION",
      impactSeverity: "LOW",
      recommendedChange: "No action required. Update is informational only.",
      reasoning: "No relevant topics or document types detected.",
      evidence: {},
    });
  }

  // Persist
  for (const impact of impacts) {
    await execute(
      `INSERT INTO regulatory_impacts (update_id, impacted_module, impact_type, impact_severity, recommended_change, reasoning, evidence_json)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
      [updateId, impact.impactedModule, impact.impactType, impact.impactSeverity,
       impact.recommendedChange, impact.reasoning, JSON.stringify(impact.evidence)]
    );
  }

  return impacts;
}

function computeModuleSeverity(updateSeverity: string, module: string, updateType: string): Severity {
  if (updateSeverity === "CRITICAL") return "CRITICAL";
  if (updateSeverity === "HIGH" && ["legal_engine_rules", "worker_status_logic"].includes(module)) return "HIGH";
  if (updateType === "NEW_LAW" || updateType === "AMENDMENT") return updateSeverity === "MEDIUM" ? "MEDIUM" : "HIGH";
  if (updateSeverity === "MEDIUM") return "MEDIUM";
  return "LOW";
}

function generateRecommendation(module: string, impactType: string, update: any): string {
  const recs: Record<string, string> = {
    legal_engine_rules: "Review legal engine rules. Verify Art. 108 / permit validity logic still holds.",
    worker_status_logic: "Check if worker status determination needs updating for new provisions.",
    compliance_status_logic: "Update compliance checklists and monitoring thresholds.",
    document_requirements: `Review required documents list. Affected types: ${(update.affected_document_types ?? []).join(", ") || "unknown"}.`,
    case_completeness_matrix: "Update case completeness matrix with new requirements.",
    appeal_templates: "Review appeal letter templates for alignment with new rules.",
    authority_draft_templates: "Update authority correspondence templates.",
    onboarding_workflows: "Review onboarding checklist for new obligations.",
    payroll_zus_logic: "Verify ZUS contribution rates and payroll formulas.",
    dashboard_metrics: "Review compliance dashboard thresholds and alert triggers.",
    notification_logic: "Update notification rules for new deadlines or obligations.",
    readiness_engine: "Update readiness scoring with new requirements.",
  };
  return recs[module] ?? "Review this module for potential updates.";
}

// ═══ SIMULATION ═════════════════════════════════════════════════════════════

export async function simulateImpact(updateId: string, tenantId?: string): Promise<SimulationResult> {
  const update = await queryOne<any>("SELECT * FROM regulatory_updates WHERE id = $1", [updateId]);
  if (!update) return emptySimulation("Update not found");

  const tid = tenantId ?? (await queryOne<any>("SELECT id FROM tenants LIMIT 1"))?.id;
  if (!tid) return emptySimulation("No tenant found");

  const topics: string[] = update.relevant_topics ?? [];
  const docTypes: string[] = update.affected_document_types ?? [];
  const workerTypes: string[] = update.affected_worker_types ?? [];
  const regions: string[] = update.affected_regions ?? [];
  const severity: string = update.severity ?? "LOW";

  let affectedWorkerIds: string[] = [];
  let affectedCaseIds: string[] = [];
  let affectedEmployersCount = 0;
  const reasons: string[] = [];

  // Query workers by document type impact
  if (docTypes.includes("work_permit") || docTypes.includes("permit")) {
    const rows = await query<any>("SELECT id FROM workers WHERE tenant_id = $1 AND work_permit_expiry IS NOT NULL LIMIT 20", [tid]);
    affectedWorkerIds.push(...rows.map((r: any) => r.id));
    reasons.push(`${rows.length}+ workers have active work permits`);
  }

  if (docTypes.includes("residence_card") || topics.includes("residence_card") || topics.includes("immigration")) {
    const rows = await query<any>("SELECT id FROM workers WHERE tenant_id = $1 AND trc_expiry IS NOT NULL LIMIT 20", [tid]);
    const newIds = rows.map((r: any) => r.id).filter((id: string) => !affectedWorkerIds.includes(id));
    affectedWorkerIds.push(...newIds);
    reasons.push(`${rows.length}+ workers have TRC records`);
  }

  // Query by TRC cases
  if (topics.includes("residence_card") || topics.includes("immigration") || topics.includes("work_permit")) {
    const cases = await query<any>("SELECT id FROM legal_cases WHERE tenant_id = $1 AND status IN ('NEW','PENDING') LIMIT 20", [tid]);
    affectedCaseIds.push(...cases.map((c: any) => c.id));
    reasons.push(`${cases.length} active legal cases`);
  }

  // Query by payroll impact
  if (topics.includes("payroll_zus")) {
    const rows = await query<any>("SELECT COUNT(*)::int as count FROM workers WHERE tenant_id = $1", [tid]);
    const count = rows[0]?.count ?? 0;
    reasons.push(`All ${count} workers affected by payroll/ZUS changes`);
    if (affectedWorkerIds.length === 0) {
      const sample = await query<any>("SELECT id FROM workers WHERE tenant_id = $1 LIMIT 20", [tid]);
      affectedWorkerIds = sample.map((r: any) => r.id);
    }
  }

  // Query by compliance
  if (topics.includes("compliance") || topics.includes("employer_obligations")) {
    const employers = await query<any>("SELECT COUNT(DISTINCT assigned_site)::int as count FROM workers WHERE tenant_id = $1 AND assigned_site IS NOT NULL", [tid]);
    affectedEmployersCount = employers[0]?.count ?? 0;
    reasons.push(`${affectedEmployersCount} employer sites may need compliance updates`);
  }

  // All foreigners
  if (workerTypes.includes("all_foreigners")) {
    const total = await queryOne<any>("SELECT COUNT(*)::int as count FROM workers WHERE tenant_id = $1", [tid]);
    reasons.push(`All ${total?.count ?? 0} foreign workers potentially affected`);
  }

  // Deduplicate
  affectedWorkerIds = [...new Set(affectedWorkerIds)].slice(0, 20);
  affectedCaseIds = [...new Set(affectedCaseIds)].slice(0, 20);

  // Count totals
  const workersTotal = affectedWorkerIds.length > 0 ? (await queryOne<any>("SELECT COUNT(*)::int as count FROM workers WHERE tenant_id = $1", [tid]))?.count ?? affectedWorkerIds.length : 0;
  const casesTotal = affectedCaseIds.length > 0 ? (await queryOne<any>("SELECT COUNT(*)::int as count FROM legal_cases WHERE tenant_id = $1 AND status IN ('NEW','PENDING')", [tid]))?.count ?? affectedCaseIds.length : 0;

  // Risk levels
  const legalRisk: RiskLevel = severity === "CRITICAL" ? "CRITICAL" : severity === "HIGH" ? "HIGH" : topics.some(t => ["immigration", "residence_card", "work_permit"].includes(t)) ? "MEDIUM" : "LOW";
  const opRisk: RiskLevel = affectedWorkerIds.length > 10 ? (severity === "CRITICAL" ? "CRITICAL" : "HIGH") : severity === "CRITICAL" ? "HIGH" : "MEDIUM";
  const workload: Workload = affectedWorkerIds.length > 20 ? "HIGH" : affectedWorkerIds.length > 5 ? "MEDIUM" : "LOW";

  const reasoning = reasons.length > 0 ? reasons.join(". ") + "." : "No significant operational impact detected.";

  const result: SimulationResult = {
    affectedWorkersCount: Number(workersTotal),
    affectedCasesCount: Number(casesTotal),
    affectedEmployersCount,
    affectedWorkerIds,
    affectedCaseIds,
    operationalRiskLevel: opRisk,
    legalRiskLevel: legalRisk,
    estimatedWorkload: workload,
    reasoning,
  };

  // Persist (upsert)
  await execute("DELETE FROM regulatory_simulations WHERE update_id = $1", [updateId]);
  await execute(
    `INSERT INTO regulatory_simulations (update_id, affected_workers_count, affected_cases_count, affected_employers_count,
      affected_worker_ids_json, affected_case_ids_json, operational_risk_level, legal_risk_level, estimated_workload, reasoning)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9,$10)`,
    [updateId, result.affectedWorkersCount, result.affectedCasesCount, result.affectedEmployersCount,
     JSON.stringify(result.affectedWorkerIds), JSON.stringify(result.affectedCaseIds),
     result.operationalRiskLevel, result.legalRiskLevel, result.estimatedWorkload, result.reasoning]
  );

  return result;
}

function emptySimulation(reason: string): SimulationResult {
  return { affectedWorkersCount: 0, affectedCasesCount: 0, affectedEmployersCount: 0, affectedWorkerIds: [], affectedCaseIds: [], operationalRiskLevel: "LOW", legalRiskLevel: "LOW", estimatedWorkload: "LOW", reasoning: reason };
}

// ═══ READ ════════════════════════════════════════════════════════════════════

export async function getImpacts(updateId: string): Promise<any[]> {
  return query("SELECT * FROM regulatory_impacts WHERE update_id = $1 ORDER BY impact_severity DESC, created_at", [updateId]);
}

export async function getSimulation(updateId: string): Promise<any> {
  return queryOne("SELECT * FROM regulatory_simulations WHERE update_id = $1", [updateId]);
}
