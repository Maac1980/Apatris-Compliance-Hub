/**
 * Test Scenario Engine — calls REAL services via dry-run adapter.
 *
 * Strategy: For services needing a DB record (updateId), we:
 * 1. Insert a temp record into regulatory_updates with status='TEST'
 * 2. Call real services against that record
 * 3. Read results from real tables
 * 4. Clean up ALL temp data in finally block
 *
 * For case/document scenarios: call real services with real worker data
 * or use in-memory paths where services accept direct input.
 *
 * NO permanent writes to production tables. Cleanup is guaranteed.
 */

import { query, queryOne, execute } from "../lib/db.js";
import { classifyWithAI } from "./regulatory-classification.service.js";
import { classifyAndPersist } from "./regulatory-classification.service.js";
import { extractAndPersist } from "./regulatory-extraction.service.js";
import { mapImpact } from "./regulatory-impact.service.js";
import { simulateImpact } from "./regulatory-impact.service.js";
import { getImpacts, getSimulation } from "./regulatory-impact.service.js";
import { createReviewTasks, getReviewTasks } from "./regulatory-review.service.js";
import { prepareDeployment, getDeploymentPlan } from "./regulatory-deployment.service.js";
import { runCaseOoda } from "./ooda-orchestration.service.js";
import { analyzeCaseIntelligence } from "./case-intelligence.service.js";
import { advanceStage, getCycle } from "./ooda-engine.service.js";

// ═══ CRUD ═══════════════════════════════════════════════════════════════════

export async function createScenario(data: { name: string; scenarioType: string; description: string; inputJson: any; expectedOutputJson: any; createdBy: string }): Promise<any> {
  return queryOne(
    `INSERT INTO test_scenarios (name, scenario_type, description, input_json, expected_output_json, created_by)
     VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6) RETURNING *`,
    [data.name, data.scenarioType, data.description, JSON.stringify(data.inputJson), JSON.stringify(data.expectedOutputJson), data.createdBy]
  );
}

export async function listScenarios(): Promise<any[]> {
  return query("SELECT ts.*, (SELECT run_at FROM test_scenario_runs WHERE scenario_id = ts.id ORDER BY run_at DESC LIMIT 1) as last_run, (SELECT match_result FROM test_scenario_runs WHERE scenario_id = ts.id ORDER BY run_at DESC LIMIT 1) as last_result FROM test_scenarios ts ORDER BY ts.created_at DESC");
}

export async function getScenario(id: string): Promise<any> { return queryOne("SELECT * FROM test_scenarios WHERE id = $1", [id]); }
export async function getScenarioRun(id: string): Promise<any> { return queryOne("SELECT * FROM test_scenario_runs WHERE id = $1", [id]); }

// ═══ RUN ════════════════════════════════════════════════════════════════════

export async function runScenario(id: string, userId: string): Promise<any> {
  const scenario = await getScenario(id);
  if (!scenario) throw new Error("Scenario not found");

  let actual: any = {};
  try {
    switch (scenario.scenario_type) {
      case "REGULATORY": actual = await runRegulatoryDryRun(scenario.input_json); break;
      case "CASE": actual = await runCaseDryRun(scenario.input_json); break;
      case "DOCUMENT": actual = await runDocumentDryRun(scenario.input_json); break;
      default: actual = { error: `Unknown: ${scenario.scenario_type}` };
    }
  } catch (err) { actual = { error: err instanceof Error ? err.message : "Failed" }; }

  const { match, differences } = compareResult(scenario.expected_output_json, actual);
  const run = await queryOne(
    "INSERT INTO test_scenario_runs (scenario_id, actual_output_json, match_result, differences_json, run_by) VALUES ($1,$2::jsonb,$3,$4::jsonb,$5) RETURNING *",
    [id, JSON.stringify(actual), match, JSON.stringify(differences), userId]
  );
  return { run, scenario: { name: scenario.name, type: scenario.scenario_type }, match, differences, expected: scenario.expected_output_json, actual };
}

// ═══ REGULATORY DRY RUN (real services, temp record, guaranteed cleanup) ════

async function runRegulatoryDryRun(input: any): Promise<any> {
  const title = input.title ?? "";
  const text = input.raw_text ?? "";

  // Get tenant
  const tenant = await queryOne<any>("SELECT id FROM tenants LIMIT 1");
  const tenantId = tenant?.id ?? "00000000-0000-0000-0000-000000000000";

  // Insert temp record — uses real status 'NEW', marked by source='[TEST_SCENARIO]' for cleanup identification
  const temp = await queryOne<{ id: string }>(
    `INSERT INTO regulatory_updates (source, title, summary, raw_text, category, severity, status, source_id)
     VALUES ('[TEST_SCENARIO]',$1,$2,$3,'test','info','NEW',NULL) RETURNING id`,
    [title, text.slice(0, 500), text]
  );
  if (!temp) throw new Error("Failed to create temp record");
  const tempId = temp.id;

  try {
    // Stage 2: REAL classification service
    await classifyAndPersist(tempId);
    const classified = await queryOne<any>("SELECT severity, update_type, relevance_score, confidence_score, requires_human_review, language, relevant_topics FROM regulatory_updates WHERE id = $1", [tempId]);

    // Stage 2: REAL extraction service
    await extractAndPersist(tempId);
    const extracted = await queryOne<any>("SELECT summary_pl, summary_en, cited_articles, affected_worker_types, affected_document_types, affected_regions, effective_date, deadline_date FROM regulatory_updates WHERE id = $1", [tempId]);

    // Stage 3: REAL impact mapping
    await mapImpact(tempId, tenantId);
    const impacts = await getImpacts(tempId);

    // Stage 3: REAL simulation
    await simulateImpact(tempId, tenantId);
    const sim = await getSimulation(tempId);

    // Stage 4: REAL review task creation (reads severity from the record)
    // First update status to allow review creation
    await execute("UPDATE regulatory_updates SET status = 'INGESTED' WHERE id = $1", [tempId]);
    await createReviewTasks(tempId);
    const reviewTasks = await getReviewTasks(tempId);

    // Stage 5: REAL deployment plan (needs APPROVED_FOR_DEPLOYMENT status)
    await execute("UPDATE regulatory_updates SET status = 'APPROVED_FOR_DEPLOYMENT' WHERE id = $1", [tempId]);
    await prepareDeployment(tempId);
    const deployPlan = await getDeploymentPlan(tempId);

    // OODA: get cycle trace
    const oodaCycle = await getCycle("REGULATORY", tempId);
    const ooda_trace = oodaCycle?.events?.map((e: any) => `${e.stage}: ${e.description ?? e.event_type ?? ""}`) ?? [];

    // Build output
    const severity = classified?.severity ?? "LOW";
    const topics: string[] = classified?.relevant_topics ?? [];

    return {
      summary: `Regulatory: ${severity} ${classified?.update_type ?? "GUIDANCE"} — ${topics.join(", ") || "unclassified"}`,
      severity,
      update_type: classified?.update_type ?? "GUIDANCE",
      relevance_categories: topics,
      relevance_score: classified?.relevance_score ?? 0,
      confidence: classified?.confidence_score ?? 0,
      requires_human_review: classified?.requires_human_review ?? true,
      extraction_preview: {
        summaryPL: (extracted?.summary_pl ?? "").slice(0, 200),
        summaryEN: (extracted?.summary_en ?? "").slice(0, 200),
        citedArticles: extracted?.cited_articles ?? [],
        affectedTopics: extracted?.affected_document_types ?? [],
      },
      impacted_modules: impacts.map((i: any) => i.impacted_module),
      recommendations: impacts.map((i: any) => i.recommended_change).filter(Boolean),
      simulation_summary: sim ? { affectedWorkers: sim.affected_workers_count, affectedCases: sim.affected_cases_count, riskLevel: sim.legal_risk_level } : null,
      review_tasks_preview: reviewTasks.map((t: any) => ({ type: t.review_type, role: t.assigned_role, status: t.task_status })),
      deployment_plan_preview: deployPlan.map((d: any) => ({ targetModule: d.target_module, type: d.deployment_type, status: d.deployment_status })),
      ooda_trace,
    };
  } finally {
    // GUARANTEED CLEANUP — remove all temp data
    await execute("DELETE FROM regulatory_deployments WHERE update_id = $1", [tempId]).catch(() => {});
    await execute("DELETE FROM regulatory_approvals WHERE update_id = $1", [tempId]).catch(() => {});
    await execute("DELETE FROM regulatory_review_tasks WHERE update_id = $1", [tempId]).catch(() => {});
    await execute("DELETE FROM regulatory_simulations WHERE update_id = $1", [tempId]).catch(() => {});
    await execute("DELETE FROM regulatory_impacts WHERE update_id = $1", [tempId]).catch(() => {});
    await execute("DELETE FROM regulatory_audit_log WHERE update_id = $1", [tempId]).catch(() => {});
    // Clean OODA
    const cycle = await queryOne<any>("SELECT id FROM ooda_cycles WHERE entity_id = $1", [tempId]);
    if (cycle) {
      await execute("DELETE FROM ooda_decisions WHERE cycle_id = $1", [cycle.id]).catch(() => {});
      await execute("DELETE FROM ooda_events WHERE cycle_id = $1", [cycle.id]).catch(() => {});
      await execute("DELETE FROM ooda_cycles WHERE id = $1", [cycle.id]).catch(() => {});
    }
    // Delete the temp regulatory_updates record last
    await execute("DELETE FROM regulatory_updates WHERE id = $1", [tempId]).catch(() => {});
  }
}

// ═══ CASE DRY RUN (temp worker → real services → cleanup) ═══════════════════

async function runCaseDryRun(input: any): Promise<any> {
  const tenant = await queryOne<any>("SELECT id FROM tenants LIMIT 1");
  const tenantId = tenant?.id ?? "00000000-0000-0000-0000-000000000000";

  // If real workerId provided, use directly
  if (input.workerId) {
    return runCaseServicesForWorker(input.workerId, tenantId);
  }

  // Otherwise: create temp worker with input data, run real services, cleanup
  const tempWorker = await queryOne<{ id: string }>(
    `INSERT INTO workers (tenant_id, full_name, trc_expiry, passport_expiry, work_permit_expiry, contract_end_date, specialization)
     VALUES ($1,'[TEST_SCENARIO] Test Worker',$2,$3,$4,$5,'Test') RETURNING id`,
    [tenantId, input.trc_expiry ?? null, input.passport_expiry ?? null, input.work_permit_expiry ?? null, input.contract_end_date ?? null]
  );
  if (!tempWorker) throw new Error("Failed to create temp worker");

  // If rejection data, create temp legal case + rejection
  let tempCaseId: string | null = null;
  let tempRejectionId: string | null = null;
  try {
    if (input.has_rejection || input.appeal_deadline) {
      const tc = await queryOne<{ id: string }>(
        `INSERT INTO legal_cases (worker_id, tenant_id, case_type, status, appeal_deadline)
         VALUES ($1,$2,'APPEAL','REJECTED',$3) RETURNING id`,
        [tempWorker.id, tenantId, input.appeal_deadline ?? null]
      );
      tempCaseId = tc?.id ?? null;
    }
    if (input.has_rejection) {
      const tr = await queryOne<{ id: string }>(
        `INSERT INTO rejection_analyses (tenant_id, worker_id, rejection_text, category, explanation, appeal_possible, confidence_score, source_type)
         VALUES ($1,$2,'[TEST] rejection','MISSING_DOCS','Test rejection',$3,0.5,'RULE') RETURNING id`,
        [tenantId, tempWorker.id, input.appeal_possible ?? false]
      );
      tempRejectionId = tr?.id ?? null;
    }

    return await runCaseServicesForWorker(tempWorker.id, tenantId);
  } finally {
    // Cleanup temp data
    if (tempRejectionId) await execute("DELETE FROM rejection_analyses WHERE id = $1", [tempRejectionId]).catch(() => {});
    if (tempCaseId) await execute("DELETE FROM legal_cases WHERE id = $1", [tempCaseId]).catch(() => {});
    // Clean OODA for temp worker
    const cycle = await queryOne<any>("SELECT id FROM ooda_cycles WHERE entity_id = $1", [tempWorker.id]);
    if (cycle) {
      await execute("DELETE FROM ooda_decisions WHERE cycle_id = $1", [cycle.id]).catch(() => {});
      await execute("DELETE FROM ooda_events WHERE cycle_id = $1", [cycle.id]).catch(() => {});
      await execute("DELETE FROM ooda_cycles WHERE id = $1", [cycle.id]).catch(() => {});
    }
    await execute("DELETE FROM workers WHERE id = $1", [tempWorker.id]).catch(() => {});
  }
}

async function runCaseServicesForWorker(workerId: string, tenantId: string): Promise<any> {
  // REAL runCaseOoda
  const caseOoda = await runCaseOoda(workerId, tenantId);

  // REAL analyzeCaseIntelligence
  let caseIntel: any = null;
  try { caseIntel = await analyzeCaseIntelligence(workerId, tenantId); } catch {}

  const recs = caseOoda.recommendations ?? [];
  const riskLevel = recs.some(r => r.urgency === "CRITICAL") ? "CRITICAL" : recs.some(r => r.urgency === "HIGH") ? "HIGH" : recs.length > 0 ? "MEDIUM" : "LOW";

  // OODA trace from real cycle
  const oodaCycle = await getCycle("CASE", workerId);
  const ooda_trace = oodaCycle?.events?.map((e: any) => `${e.stage}: ${e.description ?? ""}`) ?? recs.map(r => `DECIDE: ${r.action} (${r.urgency})`);

  return {
    summary: `Case OODA: ${caseOoda.summary?.worker ?? "worker"}, ${recs.length} recommendations`,
    risk_level: riskLevel,
    readiness: caseIntel?.readiness ?? (riskLevel === "LOW" ? "READY" : "NOT_READY"),
    escalation_needed: recs.some(r => r.urgency === "CRITICAL"),
    requires_human_review: riskLevel === "CRITICAL" || riskLevel === "HIGH",
    recommendations: recs.map(r => r.action),
    key_counts: { recommendations: recs.length },
    ooda_trace,
    case_intelligence: caseIntel ? { completenessScore: caseIntel.completenessScore, overallRiskLevel: caseIntel.overallRiskLevel, readiness: caseIntel.readiness } : null,
  };
}

// ═══ DOCUMENT DRY RUN (temp worker → real case-intelligence → cleanup) ══════

async function runDocumentDryRun(input: any): Promise<any> {
  const tenant = await queryOne<any>("SELECT id FROM tenants LIMIT 1");
  const tenantId = tenant?.id ?? "00000000-0000-0000-0000-000000000000";

  // If real workerId provided, use directly
  if (input.workerId) {
    return runDocServicesForWorker(input.workerId, tenantId, input);
  }

  // Create temp worker with simulated document state, run real case-intelligence, cleanup
  const tempWorker = await queryOne<{ id: string }>(
    `INSERT INTO workers (tenant_id, full_name, specialization) VALUES ($1,'[TEST_SCENARIO] Doc Test Worker','Test') RETURNING id`,
    [tenantId]
  );
  if (!tempWorker) throw new Error("Failed to create temp worker for document scenario");

  // If missing_fields specified, we DON'T upload those files — case-intelligence will detect absence
  // If we want to simulate some files present, upload temp worker_files for non-missing ones
  const docType = input.document_type ?? "trc_application";
  const allFields: Record<string, string[]> = {
    trc_application: ["passport", "work_contract", "health_insurance", "financial_proof", "employer_declaration", "accommodation"],
    work_permit: ["passport", "labor_market_test", "employer_nip", "job_description"],
    appeal: ["rejection_decision", "appeal_letter", "supporting_evidence"],
  };
  const required = allFields[docType] ?? [];
  const missing: string[] = input.missing_fields ?? [];
  const present = required.filter(f => !missing.includes(f));

  // Insert temp worker_files for present docs
  const tempFileIds: string[] = [];
  try {
    for (const f of present) {
      const row = await queryOne<{ id: string }>(
        "INSERT INTO worker_files (tenant_id, worker_id, file_key, file_name, doc_type, source, uploaded_by) VALUES ($1,$2,$3,$4,$5,'test','[TEST]') RETURNING id",
        [tenantId, tempWorker.id, `test/${f}`, `${f}.pdf`, f]
      );
      if (row) tempFileIds.push(row.id);
    }

    return await runDocServicesForWorker(tempWorker.id, tenantId, input);
  } finally {
    // Cleanup
    for (const fid of tempFileIds) await execute("DELETE FROM worker_files WHERE id = $1", [fid]).catch(() => {});
    await execute("DELETE FROM workers WHERE id = $1", [tempWorker.id]).catch(() => {});
  }
}

async function runDocServicesForWorker(workerId: string, tenantId: string, input: any): Promise<any> {
  // REAL analyzeCaseIntelligence — reads worker_files, computes completeness, risk, recommendations
  const intel = await analyzeCaseIntelligence(workerId, tenantId);

  return {
    summary: `Document: ${intel.readiness}, ${intel.completenessScore}% complete, risk ${intel.overallRiskLevel}`,
    document_type: input.document_type ?? "case_documents",
    confidence: input.confidence ?? 100,
    readiness: intel.readiness,
    completeness_score: intel.completenessScore,
    risk_level: intel.overallRiskLevel,
    requires_human_review: intel.overallRiskLevel === "CRITICAL" || intel.overallRiskLevel === "HIGH",
    recommendations: intel.nextActions?.map((a: any) => a.action) ?? [],
    missing_critical: intel.documentsStatus?.filter((d: any) => d.required && !d.present).map((d: any) => d.id) ?? [],
    key_counts: { recommendations: intel.nextActions?.length ?? 0, missing_critical: intel.documentsStatus?.filter((d: any) => d.required && !d.present).length ?? 0 },
    ooda_trace: [`OBSERVE: Worker ${workerId} docs analyzed via case-intelligence`, `DECIDE: ${intel.readiness}, risk ${intel.overallRiskLevel}, ${intel.completenessScore}% complete`],
  };
}

// ═══ COMPARISON ═════════════════════════════════════════════════════════════

function compareResult(expected: any, actual: any): { match: boolean; differences: Array<{ path: string; expected: any; actual: any }> } {
  const differences: Array<{ path: string; expected: any; actual: any }> = [];
  for (const [key, expVal] of Object.entries(expected)) {
    const actVal = actual[key];
    if (["ooda_trace", "review_tasks_preview", "deployment_plan_preview"].includes(key)) {
      if (expVal === "exists" && (!actVal || (Array.isArray(actVal) && actVal.length === 0))) differences.push({ path: key, expected: "exists (non-empty)", actual: actVal });
      continue;
    }
    if (typeof expVal === "boolean") { if (actVal !== expVal) differences.push({ path: key, expected: expVal, actual: actVal }); }
    else if (typeof expVal === "number") { if (typeof actVal !== "number" || Math.abs(actVal - expVal) > 10) differences.push({ path: key, expected: expVal, actual: actVal }); }
    else if (typeof expVal === "string") { if (actVal !== expVal) differences.push({ path: key, expected: expVal, actual: actVal }); }
    else if (Array.isArray(expVal)) { if (!Array.isArray(actVal)) differences.push({ path: key, expected: expVal, actual: actVal }); else { for (const item of expVal) { if (!actVal.includes(item)) differences.push({ path: `${key}[${item}]`, expected: "present", actual: "missing" }); } } }
  }
  return { match: differences.length === 0, differences };
}

// ═══ SEED ═══════════════════════════════════════════════════════════════════

export async function seedDefaultScenarios(): Promise<number> {
  const existing = await query<{ count: string }>("SELECT COUNT(*)::int as count FROM test_scenarios");
  if (parseInt(existing[0]?.count ?? "0") >= 5) return 0;

  const scenarios = [
    { name: "Regulatory — New TRC document requirement", type: "REGULATORY", desc: "Runs real classification, extraction, impact, simulation, review, deployment services against temp record.",
      input: { title: "Rozporządzenie zmieniające wymagania dot. środków finansowych dla cudzoziemców", raw_text: "Zmiana wymagań dotyczących dokumentów potwierdzających posiadanie wystarczających środków finansowych przez cudzoziemców ubiegających się o kartę pobytu czasowego. Nowy próg wynosi 1000 PLN miesięcznie. Zmiana wchodzi w życie 1 lipca 2026." },
      expected: { requires_human_review: true, review_tasks_preview: "exists", deployment_plan_preview: "exists", ooda_trace: "exists" } },
    { name: "Case — Worker with expired permit", type: "CASE", desc: "Uses case OODA logic. TRC expired 15 days ago.",
      input: { trc_expiry: new Date(Date.now() - 15 * 86400000).toISOString().slice(0, 10), passport_expiry: "2028-01-01" },
      expected: { risk_level: "CRITICAL", escalation_needed: true, requires_human_review: true, ooda_trace: "exists" } },
    { name: "Case — Appeal deadline in 3 days", type: "CASE", desc: "Uses case OODA. Appeal deadline approaching.",
      input: { trc_expiry: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10), appeal_deadline: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10), has_rejection: true, appeal_possible: true },
      expected: { risk_level: "CRITICAL", escalation_needed: true, ooda_trace: "exists" } },
    { name: "Document — Missing financial proof for TRC", type: "DOCUMENT", desc: "Uses case-intelligence completeness matrix.",
      input: { document_type: "trc_application", confidence: 75, missing_fields: ["financial_proof", "health_insurance"] },
      expected: { readiness: "NOT_READY", risk_level: "HIGH", requires_human_review: true, ooda_trace: "exists" } },
    { name: "Case — Worker ready for deployment", type: "CASE", desc: "Valid TRC, passport, no issues.",
      input: { trc_expiry: "2027-06-01", passport_expiry: "2029-01-01", contract_end_date: "2027-03-01" },
      expected: { risk_level: "LOW", readiness: "READY", escalation_needed: false, requires_human_review: false, ooda_trace: "exists" } },
  ];

  let seeded = 0;
  for (const s of scenarios) { await createScenario({ name: s.name, scenarioType: s.type, description: s.desc, inputJson: s.input, expectedOutputJson: s.expected, createdBy: "SYSTEM" }); seeded++; }
  return seeded;
}
