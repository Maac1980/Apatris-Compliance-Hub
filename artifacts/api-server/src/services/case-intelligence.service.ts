/**
 * Case Intelligence Engine
 *
 * Reads a worker's full state across all subsystems and produces
 * actionable output for 3 audiences: internal team, lawyer, client.
 *
 * 7-section output:
 *  1. Case Summary (English)
 *  2. Case Readiness (NOT_READY / IN_PROGRESS / READY_FOR_SUBMISSION)
 *  3. Next Actions (with system feature links)
 *  4. Risks (scored: CRITICAL / HIGH / MEDIUM / LOW)
 *  5. Appeal Draft (Polish — only if rejection present)
 *  6. Worker Explanation (simple English — no jargon)
 *  7. Client Status Update (employer-facing)
 *
 * Includes:
 *  - Legal reference table (20 most-used Polish immigration articles)
 *  - Document completeness matrix per case type
 *  - Risk scoring
 *  - Action-to-system mapping
 */

import { query, queryOne } from "../lib/db.js";
import { getWorkerLegalSnapshot, type LegalSnapshot } from "./legal-status.service.js";

// ═══ LEGAL REFERENCE TABLE ══════════════════════════════════════════════════

const LEGAL_REFERENCES: Record<string, { article: string; law: string; summary: string }> = {
  TRC_APPLICATION:      { article: "Art. 98-100", law: "Ustawa o cudzoziemcach", summary: "Temporary residence card application requirements and procedure" },
  FILING_CONTINUITY:    { article: "Art. 108 ust. 1 pkt 2", law: "Ustawa o cudzoziemcach", summary: "Legal stay continuation when TRC application filed before permit expiry" },
  APPEAL_DEADLINE:      { article: "Art. 127 § 1-2", law: "KPA", summary: "14-day appeal deadline from decision delivery" },
  FORMAL_DEFECT:        { article: "Art. 64 § 2", law: "KPA", summary: "Authority must request missing documents before rejection for formal defect" },
  WORK_PERMIT:          { article: "Art. 88", law: "Ustawa o promocji zatrudnienia", summary: "Work permit requirements for foreigners" },
  SINGLE_PERMIT:        { article: "Art. 114", law: "Ustawa o cudzoziemcach", summary: "Single permit (unified TRC + work permit) requirements" },
  EMPLOYER_CHANGE:      { article: "Art. 120", law: "Ustawa o cudzoziemcach", summary: "Conditions for continued work authorization after employer change" },
  SEASONAL_WORK:        { article: "Art. 88n-88y", law: "Ustawa o promocji zatrudnienia", summary: "Seasonal work permit provisions" },
  TRC_REFUSAL:          { article: "Art. 100 ust. 1", law: "Ustawa o cudzoziemcach", summary: "Grounds for refusing temporary residence card" },
  TRC_STUDIES:          { article: "Art. 144", law: "Ustawa o cudzoziemcach", summary: "TRC for purpose of university studies — specific requirements" },
  POSTED_WORKERS:       { article: "Art. 88z-88ze", law: "Ustawa o promocji zatrudnienia", summary: "Posted workers provisions (EU Directive 96/71/EC implementation)" },
  A1_CERTIFICATE:       { article: "Art. 12-13", law: "Regulation (EC) 883/2004", summary: "A1 certificate for posted workers — social security coordination" },
  GDPR_CONSENT:         { article: "Art. 6 ust. 1 lit. a", law: "GDPR / RODO", summary: "Consent as legal basis for processing personal data" },
  GDPR_EMPLOYMENT:      { article: "Art. 221", law: "Kodeks pracy", summary: "Scope of employee data employer may process" },
  ZUS_REGISTRATION:     { article: "Art. 36", law: "Ustawa o systemie ubezpieczeń społecznych", summary: "7-day ZUS registration deadline for new employees" },
  CONTRACT_ZLECENIE:    { article: "Art. 734-751", law: "Kodeks cywilny", summary: "Civil law contract (umowa zlecenie) provisions" },
  CONTRACT_PRACA:       { article: "Art. 25-67", law: "Kodeks pracy", summary: "Employment contract provisions" },
  PIP_INSPECTION:       { article: "Art. 10-11", law: "Ustawa o PIP", summary: "Labor inspectorate powers and inspection scope" },
  CUKR_SPECIAL:         { article: "Art. 2 ust. 1", law: "Specustawa ukraińska (CUKR)", summary: "Special provisions for Ukrainian citizens — legal stay and work authorization" },
  MOS_FILING:           { article: "Rozporządzenie MSWiA", law: "MOS electronic filing", summary: "Electronic filing via login.gov.pl MOS system" },
};

// ═══ DOCUMENT COMPLETENESS MATRIX ═══════════════════════════════════════════

interface RequiredDoc {
  id: string;
  label: string;
  labelPL: string;
  critical: boolean;
}

const REQUIRED_DOCS: Record<string, RequiredDoc[]> = {
  TRC: [
    { id: "passport", label: "Valid passport", labelPL: "Ważny paszport", critical: true },
    { id: "work_contract", label: "Work contract", labelPL: "Umowa o pracę / zlecenie", critical: true },
    { id: "employer_declaration", label: "Employer declaration", labelPL: "Oświadczenie pracodawcy", critical: true },
    { id: "accommodation", label: "Accommodation proof", labelPL: "Potwierdzenie zakwaterowania", critical: true },
    { id: "health_insurance", label: "Health insurance", labelPL: "Ubezpieczenie zdrowotne", critical: true },
    { id: "financial_proof", label: "Financial proof", labelPL: "Środki finansowe", critical: true },
    { id: "photo", label: "Biometric photo", labelPL: "Zdjęcie biometryczne", critical: false },
    { id: "previous_permits", label: "Previous permits/stamps", labelPL: "Poprzednie zezwolenia", critical: false },
    { id: "zus_confirmation", label: "ZUS registration confirmation", labelPL: "Potwierdzenie ZUS", critical: false },
  ],
  WORK_PERMIT: [
    { id: "passport", label: "Valid passport", labelPL: "Ważny paszport", critical: true },
    { id: "labor_market_test", label: "Labor market test", labelPL: "Test rynku pracy", critical: true },
    { id: "employer_nip", label: "Employer NIP certificate", labelPL: "NIP pracodawcy", critical: true },
    { id: "job_description", label: "Job description", labelPL: "Opis stanowiska", critical: true },
    { id: "salary_offer", label: "Salary offer", labelPL: "Oferta wynagrodzenia", critical: true },
    { id: "qualifications", label: "Qualifications proof", labelPL: "Kwalifikacje", critical: false },
  ],
  APPEAL: [
    { id: "rejection_decision", label: "Rejection decision copy", labelPL: "Kopia decyzji odmownej", critical: true },
    { id: "appeal_letter", label: "Appeal letter", labelPL: "Odwołanie", critical: true },
    { id: "supporting_evidence", label: "Supporting evidence", labelPL: "Dokumenty dowodowe", critical: true },
    { id: "poa", label: "Power of attorney (if represented)", labelPL: "Pełnomocnictwo", critical: false },
  ],
  POSTED_WORKER: [
    { id: "a1_certificate", label: "A1 certificate", labelPL: "Zaświadczenie A1", critical: true },
    { id: "posting_notification", label: "Posting notification", labelPL: "Zgłoszenie delegowania", critical: true },
    { id: "work_contract", label: "Work contract", labelPL: "Umowa o pracę", critical: true },
    { id: "accommodation", label: "Accommodation in host country", labelPL: "Zakwaterowanie", critical: false },
  ],
};

// ═══ TYPES ══════════════════════════════════════════════════════════════════

type Readiness = "NOT_READY" | "IN_PROGRESS" | "READY_FOR_SUBMISSION";
type RiskSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

interface ActionItem {
  priority: number;
  action: string;
  systemLink: string;
  systemRoute: string;
}

interface RiskItem {
  severity: RiskSeverity;
  description: string;
  field: string;
}

interface DocStatus {
  id: string;
  label: string;
  required: boolean;
  present: boolean;
  expired: boolean;
  expiresInDays: number | null;
}

export interface CaseIntelligenceResult {
  workerId: string;
  workerName: string;
  analyzedAt: string;

  // Section 1
  caseSummary: string;

  // Section 2
  readiness: Readiness;
  readinessReason: string;
  completenessScore: number;
  documentsStatus: DocStatus[];

  // Section 3
  nextActions: ActionItem[];

  // Section 4
  risks: RiskItem[];
  overallRiskLevel: RiskSeverity;

  // Section 5 (only if rejection present)
  appealDraftPL: string | null;

  // Section 6
  workerExplanation: string | null;

  // Section 7
  clientStatusUpdate: string;

  // Metadata
  legalReferences: Array<{ key: string; article: string; law: string; summary: string }>;
  caseType: string;
  legalStatus: string;
}

// ═══ MAIN ANALYSIS ══════════════════════════════════════════════════════════

export async function analyzeCaseIntelligence(
  workerId: string,
  tenantId: string,
): Promise<CaseIntelligenceResult> {
  const now = new Date();
  const analyzedAt = now.toISOString();

  // 1. Load worker
  const worker = await queryOne<any>(
    `SELECT id, full_name, nationality, pesel, passport_number, specialization, assigned_site,
            trc_expiry, passport_expiry, work_permit_expiry, bhp_expiry, medical_exam_expiry,
            contract_end_date, email, phone
     FROM workers WHERE id = $1 AND tenant_id = $2`,
    [workerId, tenantId]
  );
  if (!worker) throw new Error("Worker not found");

  // 2. Load legal snapshot
  let snapshot: LegalSnapshot | null = null;
  try { snapshot = await getWorkerLegalSnapshot(workerId, tenantId); } catch {}

  // 3. Load legal case
  const legalCase = await queryOne<any>(
    "SELECT * FROM legal_cases WHERE worker_id = $1 AND tenant_id = $2 ORDER BY created_at DESC LIMIT 1",
    [workerId, tenantId]
  ).catch(() => null);

  // 4. Load uploaded files
  const files = await query<any>(
    "SELECT doc_type, file_name, created_at FROM worker_files WHERE worker_id = $1 AND tenant_id = $2",
    [workerId, tenantId]
  ).catch(() => []);

  // 5. Load rejection analysis
  const rejection = await queryOne<any>(
    "SELECT * FROM rejection_analyses WHERE worker_id = $1 AND tenant_id = $2 ORDER BY created_at DESC LIMIT 1",
    [workerId, tenantId]
  ).catch(() => null);

  // Determine case type
  const caseType = legalCase?.case_type ?? (rejection ? "APPEAL" : "TRC");
  const requiredDocs = REQUIRED_DOCS[caseType] ?? REQUIRED_DOCS.TRC;

  // ── Document completeness check ───────────────────────────────────────
  const fileTypes = new Set(files.map((f: any) => f.doc_type));
  const documentsStatus: DocStatus[] = requiredDocs.map(d => {
    const present = fileTypes.has(d.id);
    let expired = false;
    let expiresInDays: number | null = null;

    // Check expiry for specific doc types
    const expiryMap: Record<string, string | null> = {
      passport: worker.passport_expiry,
      health_insurance: worker.medical_exam_expiry,
    };
    if (expiryMap[d.id]) {
      const exp = new Date(expiryMap[d.id]!);
      expiresInDays = Math.ceil((exp.getTime() - now.getTime()) / 86400000);
      if (expiresInDays < 0) expired = true;
    }

    return { id: d.id, label: d.label, required: d.critical, present, expired, expiresInDays };
  });

  const criticalMissing = documentsStatus.filter(d => d.required && !d.present);
  const totalRequired = documentsStatus.filter(d => d.required).length;
  const totalPresent = documentsStatus.filter(d => d.required && d.present).length;
  const completenessScore = totalRequired > 0 ? Math.round((totalPresent / totalRequired) * 100) : 0;

  // ── Readiness ─────────────────────────────────────────────────────────
  let readiness: Readiness;
  let readinessReason: string;
  if (criticalMissing.length === 0 && completenessScore >= 80) {
    readiness = "READY_FOR_SUBMISSION";
    readinessReason = `All ${totalRequired} critical documents present. Completeness: ${completenessScore}%.`;
  } else if (completenessScore >= 40) {
    readiness = "IN_PROGRESS";
    readinessReason = `${criticalMissing.length} critical documents missing: ${criticalMissing.map(d => d.label).join(", ")}. Completeness: ${completenessScore}%.`;
  } else {
    readiness = "NOT_READY";
    readinessReason = `${criticalMissing.length} critical documents missing. Completeness: ${completenessScore}%. Case cannot proceed.`;
  }

  // ── Risks ─────────────────────────────────────────────────────────────
  const risks: RiskItem[] = [];

  // Missing critical docs
  for (const d of criticalMissing) {
    risks.push({ severity: "CRITICAL", description: `Missing: ${d.label}`, field: d.id });
  }

  // Expired documents
  if (worker.passport_expiry && new Date(worker.passport_expiry) < now) {
    risks.push({ severity: "CRITICAL", description: `Passport expired on ${worker.passport_expiry}`, field: "passport_expiry" });
  }
  if (worker.trc_expiry && new Date(worker.trc_expiry) < now && snapshot?.legalStatus !== "PROTECTED_PENDING") {
    risks.push({ severity: "CRITICAL", description: `TRC expired on ${worker.trc_expiry} — no Art. 108 protection`, field: "trc_expiry" });
  }
  if (worker.work_permit_expiry && new Date(worker.work_permit_expiry) < now) {
    risks.push({ severity: "HIGH", description: `Work permit expired on ${worker.work_permit_expiry}`, field: "work_permit_expiry" });
  }
  if (worker.bhp_expiry && new Date(worker.bhp_expiry) < now) {
    risks.push({ severity: "MEDIUM", description: `BHP certificate expired on ${worker.bhp_expiry}`, field: "bhp_expiry" });
  }
  if (worker.medical_exam_expiry && new Date(worker.medical_exam_expiry) < now) {
    risks.push({ severity: "MEDIUM", description: `Medical exam expired on ${worker.medical_exam_expiry}`, field: "medical_exam_expiry" });
  }

  // Expiring soon (30 days)
  const soon = (field: string | null, label: string, fieldKey: string) => {
    if (!field) return;
    const days = Math.ceil((new Date(field).getTime() - now.getTime()) / 86400000);
    if (days > 0 && days <= 30) {
      risks.push({ severity: "HIGH", description: `${label} expires in ${days} days (${field})`, field: fieldKey });
    }
  };
  soon(worker.trc_expiry, "TRC", "trc_expiry");
  soon(worker.passport_expiry, "Passport", "passport_expiry");
  soon(worker.work_permit_expiry, "Work permit", "work_permit_expiry");
  soon(worker.contract_end_date, "Contract", "contract_end_date");

  // Appeal deadline
  if (legalCase?.appeal_deadline) {
    const days = Math.ceil((new Date(legalCase.appeal_deadline).getTime() - now.getTime()) / 86400000);
    if (days < 0) {
      risks.push({ severity: "CRITICAL", description: `Appeal deadline passed ${Math.abs(days)} days ago`, field: "appeal_deadline" });
    } else if (days <= 7) {
      risks.push({ severity: "CRITICAL", description: `Appeal deadline in ${days} days`, field: "appeal_deadline" });
    }
  }

  // No legal protection
  if (snapshot?.legalStatus === "EXPIRED_NOT_PROTECTED") {
    risks.push({ severity: "CRITICAL", description: "Worker has no legal stay protection — risk of illegal stay", field: "legal_status" });
  }

  const overallRiskLevel: RiskSeverity = risks.some(r => r.severity === "CRITICAL") ? "CRITICAL"
    : risks.some(r => r.severity === "HIGH") ? "HIGH"
    : risks.some(r => r.severity === "MEDIUM") ? "MEDIUM" : "LOW";

  // ── Next Actions (with system links) ──────────────────────────────────
  const nextActions: ActionItem[] = [];
  let p = 1;

  for (const d of criticalMissing) {
    const routeMap: Record<string, string> = {
      passport: "/document-intake", work_contract: `/contract-gen?workerId=${workerId}`,
      employer_declaration: `/contract-gen?workerId=${workerId}&template=employer-declaration`,
      health_insurance: "/document-intake", financial_proof: "/document-intake",
      rejection_decision: "/rejection-intelligence", appeal_letter: "/rejection-intelligence",
      supporting_evidence: "/document-intake", accommodation: "/document-intake",
      a1_certificate: "/posted-workers", photo: "/document-intake",
    };
    nextActions.push({
      priority: p++,
      action: `Upload ${d.label}`,
      systemLink: `UPLOAD:${d.id}`,
      systemRoute: routeMap[d.id] ?? "/document-intake",
    });
  }

  if (snapshot?.legalStatus === "EXPIRED_NOT_PROTECTED") {
    nextActions.unshift({ priority: 0, action: "URGENT: Consult lawyer — worker has no legal stay protection", systemLink: "LEGAL:review", systemRoute: "/legal-brief" });
  }

  if (rejection && !legalCase?.appeal_deadline) {
    nextActions.push({ priority: p++, action: "Generate appeal letter", systemLink: "LEGAL:appeal", systemRoute: "/rejection-intelligence" });
  }

  if (readiness === "READY_FOR_SUBMISSION") {
    nextActions.push({ priority: p++, action: "Submit application to voivodeship office", systemLink: "SUBMIT:application", systemRoute: "/trc-service" });
  }

  // ── Case Summary ──────────────────────────────────────────────────────
  const caseSummary = buildCaseSummary(worker, snapshot, legalCase, rejection, readiness, completenessScore, criticalMissing, risks);

  // ── Worker Explanation ────────────────────────────────────────────────
  const workerExplanation = buildWorkerExplanation(worker, snapshot, readiness, rejection);

  // ── Client Status Update ──────────────────────────────────────────────
  const clientStatusUpdate = buildClientStatus(worker, readiness, completenessScore, nextActions);

  // ── Appeal Draft (only if rejection exists) ───────────────────────────
  let appealDraftPL: string | null = null;
  if (rejection) {
    appealDraftPL = await generateAppealDraft(worker, rejection, snapshot, tenantId);
  }

  // ── Relevant legal references ─────────────────────────────────────────
  const legalReferences = selectRelevantReferences(caseType, snapshot, rejection);

  return {
    workerId, workerName: worker.full_name, analyzedAt,
    caseSummary, readiness, readinessReason, completenessScore, documentsStatus,
    nextActions, risks, overallRiskLevel,
    appealDraftPL, workerExplanation, clientStatusUpdate,
    legalReferences, caseType, legalStatus: snapshot?.legalStatus ?? "UNKNOWN",
  };
}

// ═══ SECTION BUILDERS ═══════════════════════════════════════════════════════

function buildCaseSummary(worker: any, snapshot: LegalSnapshot | null, legalCase: any, rejection: any, readiness: Readiness, completeness: number, missing: DocStatus[], risks: RiskItem[]): string {
  const parts = [
    `Worker ${worker.full_name} (${worker.nationality ?? "nationality unknown"}).`,
    snapshot ? `Legal status: ${snapshot.legalStatus}. Basis: ${snapshot.legalBasis}.` : "Legal status unknown.",
    legalCase ? `Active case: ${legalCase.case_type} — status: ${legalCase.status}.` : "No active legal case.",
    `Document completeness: ${completeness}%.`,
    missing.length > 0 ? `Missing critical: ${missing.map(d => d.label).join(", ")}.` : "All critical documents present.",
    risks.filter(r => r.severity === "CRITICAL").length > 0 ? `${risks.filter(r => r.severity === "CRITICAL").length} critical risk(s) identified.` : "",
    rejection ? `Rejection on file: ${rejection.category} — appeal ${rejection.appeal_possible ? "possible" : "unlikely"}.` : "",
    `Readiness: ${readiness}.`,
  ];
  return parts.filter(Boolean).join(" ");
}

function buildWorkerExplanation(worker: any, snapshot: LegalSnapshot | null, readiness: Readiness, rejection: any): string {
  const name = (worker.full_name ?? "").split(/\s+/)[0] || "Worker";
  const parts = [`Dear ${name},`];

  if (readiness === "READY_FOR_SUBMISSION") {
    parts.push("Your documents are ready. Our team will submit your application soon. You do not need to do anything right now.");
  } else if (readiness === "IN_PROGRESS") {
    parts.push("We are working on your case. Some documents are still needed. Your coordinator will contact you if we need anything from you.");
  } else {
    parts.push("We are preparing your case. Several important documents are still missing. Please respond promptly when your coordinator contacts you about documents.");
  }

  if (rejection) {
    parts.push("There was a decision about your application that was not positive. Our legal team is reviewing this and working on the next steps. We will keep you informed.");
  }

  parts.push("If you have any questions, please contact your coordinator. You do not need to visit any office unless we specifically ask you to.");
  return parts.join("\n\n");
}

function buildClientStatus(worker: any, readiness: Readiness, completeness: number, actions: ActionItem[]): string {
  const parts = [
    `Worker: ${worker.full_name}`,
    `Site: ${worker.assigned_site ?? "Not assigned"}`,
    `Case readiness: ${readiness} (${completeness}% complete)`,
  ];

  if (readiness === "READY_FOR_SUBMISSION") {
    parts.push("Status: All documents collected. Application ready for submission.");
  } else if (readiness === "IN_PROGRESS") {
    parts.push("Status: Case in progress. Some documents pending.");
  } else {
    parts.push("Status: Case not ready. Critical documents missing.");
  }

  const topActions = actions.slice(0, 3);
  if (topActions.length > 0) {
    parts.push(`Next steps: ${topActions.map(a => a.action).join("; ")}`);
  }

  parts.push("For questions, contact Apatris compliance team.");
  return parts.join("\n");
}

// ═══ APPEAL DRAFT (AI-GENERATED, POLISH) ════════════════════════════════════

async function generateAppealDraft(worker: any, rejection: any, snapshot: LegalSnapshot | null, tenantId: string): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const refs = selectRelevantReferences("APPEAL", snapshot, rejection);
  const refText = refs.map(r => `${r.article} ${r.law}: ${r.summary}`).join("\n");

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6", max_tokens: 3000,
        system: `You are a Polish immigration lawyer drafting an appeal (odwołanie). Write in formal Polish legal language. Use ONLY the legal articles provided below — do NOT invent article numbers.\n\nAVAILABLE LEGAL REFERENCES:\n${refText}\n\nThis is a DRAFT for lawyer review. Mark as PROJEKT.`,
        messages: [{ role: "user", content: `Worker: ${worker.full_name}, nationality: ${worker.nationality ?? "unknown"}.\nRejection category: ${rejection.category}\nExplanation: ${rejection.explanation}\nLikely cause: ${rejection.likely_cause ?? "unknown"}\nRejection text: ${(rejection.rejection_text ?? "").slice(0, 2000)}\n\nWrite a formal appeal letter in Polish.` }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json() as any;
    return data.content?.find((b: any) => b.type === "text")?.text ?? null;
  } catch { return null; }
}

// ═══ LEGAL REFERENCE SELECTOR ═══════════════════════════════════════════════

function selectRelevantReferences(caseType: string, snapshot: LegalSnapshot | null, rejection: any): Array<{ key: string; article: string; law: string; summary: string }> {
  const refs: string[] = [];

  // Always relevant
  refs.push("FILING_CONTINUITY");

  if (caseType === "TRC") {
    refs.push("TRC_APPLICATION", "SINGLE_PERMIT", "ZUS_REGISTRATION");
  }
  if (caseType === "WORK_PERMIT") {
    refs.push("WORK_PERMIT");
  }
  if (caseType === "APPEAL" || rejection) {
    refs.push("APPEAL_DEADLINE", "TRC_REFUSAL");
    if (rejection?.category === "FORMAL_DEFECT") refs.push("FORMAL_DEFECT");
  }
  if (caseType === "POSTED_WORKER") {
    refs.push("POSTED_WORKERS", "A1_CERTIFICATE");
  }
  if (snapshot?.legalBasis === "SPECUSTAWA_UKR") {
    refs.push("CUKR_SPECIAL");
  }
  if (snapshot?.legalStatus === "PROTECTED_PENDING") {
    refs.push("FILING_CONTINUITY");
  }
  if (rejection?.category === "MISSING_DOCS" && rejection?.rejection_text?.includes("144")) {
    refs.push("TRC_STUDIES");
  }

  refs.push("GDPR_CONSENT", "PIP_INSPECTION");

  // Deduplicate and resolve
  const unique = [...new Set(refs)];
  return unique.filter(k => LEGAL_REFERENCES[k]).map(k => ({ key: k, ...LEGAL_REFERENCES[k] }));
}
