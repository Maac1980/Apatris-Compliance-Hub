/**
 * MOS Legal Engine — electronic TRC filing via Moduł Obsługi Spraw.
 *
 * Patches into existing legal engine. Does NOT replace Art. 108 logic.
 * Adds MOS-specific status tracking, validation, and Art. 108 mapping.
 *
 * MOS 2026 Rules:
 *  - Electronic-only submission via login.gov.pl
 *  - Qualified e-signature / Trusted Profile / Personal Signature required
 *  - 2 photos required (35mm x 45mm)
 *  - MOS submission timestamp = filing date for Art. 108
 *  - correction_needed pauses workflow → internal task
 */

import { query, queryOne, execute } from "../lib/db.js";
import { refreshWorkerLegalSnapshot } from "./legal-status.service.js";

// ═══ MOS STATUS CODES ═══════════════════════════════════════════════════════

export type MOSStatus =
  | "draft"
  | "docs_ready"
  | "login_gov_pl"
  | "form_filled"
  | "signature_pending"
  | "submitted"
  | "mos_pending"
  | "correction_needed"
  | "approved"
  | "rejected";

export const MOS_STATUS_LABELS: Record<MOSStatus, string> = {
  draft: "Wersja robocza",
  docs_ready: "Dokumenty gotowe",
  login_gov_pl: "Wymagane logowanie login.gov.pl",
  form_filled: "Formularz wypełniony",
  signature_pending: "Oczekiwanie na podpis",
  submitted: "Złożony elektronicznie",
  mos_pending: "Oczekiwanie na decyzję",
  correction_needed: "Wymagana korekta",
  approved: "Zatwierdzony",
  rejected: "Odrzucony",
};

// MOS statuses that count as "filed" for Art. 108 continuity
const MOS_FILED_STATUSES: MOSStatus[] = ["submitted", "mos_pending", "approved", "correction_needed"];

// E-signature methods accepted by MOS 2026
export type SignatureMethod = "qualified" | "trusted_profile" | "personal_signature";

// ═══ MOS DOCUMENT REQUIREMENTS (2026) ═══════════════════════════════════════

export interface MOSDocumentChecklist {
  item: string;
  required: boolean;
  present: boolean;
}

export function getMOSDocumentChecklist(caseData: any): MOSDocumentChecklist[] {
  return [
    { item: "Wypełniony formularz wniosku (MOS)", required: true, present: !!caseData.form_filled },
    { item: "2 zdjęcia (35mm × 45mm, kolorowe, aktualne)", required: true, present: !!caseData.photos_uploaded },
    { item: "Kopia paszportu (wszystkie strony)", required: true, present: !!caseData.passport_copy },
    { item: "Potwierdzenie zameldowania", required: true, present: !!caseData.registration_proof },
    { item: "Umowa o pracę / zlecenie", required: true, present: !!caseData.employment_contract },
    { item: "Informacja starosty (test rynku pracy)", required: false, present: !!caseData.labor_market_test },
    { item: "Zaświadczenie o niezaleganiu ZUS", required: true, present: !!caseData.zus_certificate },
    { item: "Zaświadczenie o niezaleganiu US", required: true, present: !!caseData.tax_certificate },
    { item: "Potwierdzenie opłaty skarbowej (440 PLN)", required: true, present: !!caseData.fee_paid },
    { item: "Podpis elektroniczny (kwalifikowany / profil zaufany / osobisty)", required: true, present: !!caseData.e_signature_method },
    { item: "Uwierzytelnienie login.gov.pl", required: true, present: !!caseData.login_gov_pl_verified },
  ];
}

// ═══ MOS VALIDATION ═════════════════════════════════════════════════════════

export interface MOSValidationResult {
  ready: boolean;
  missingItems: string[];
  mosStatus: MOSStatus;
  canSubmit: boolean;
  art108Eligible: boolean;
  warnings: string[];
}

export async function validateMOSReadiness(caseId: string, tenantId: string): Promise<MOSValidationResult> {
  const legalCase = await queryOne<any>(
    "SELECT * FROM legal_cases WHERE id = $1 AND tenant_id = $2",
    [caseId, tenantId]
  );
  if (!legalCase) throw new Error("Legal case not found");

  const checklist = getMOSDocumentChecklist(legalCase);
  const missingRequired = checklist.filter(c => c.required && !c.present).map(c => c.item);

  const mosStatus: MOSStatus = legalCase.mos_status ?? "draft";
  const loginVerified = legalCase.login_gov_pl_verified === true;
  const hasSig = !!legalCase.e_signature_method;

  const warnings: string[] = [];
  if (!loginVerified) warnings.push("login.gov.pl authentication not verified");
  if (!hasSig) warnings.push("Electronic signature not configured");
  if (missingRequired.length > 0) warnings.push(`${missingRequired.length} required document(s) missing`);

  const canSubmit = missingRequired.length === 0 && loginVerified && hasSig;

  // Art. 108 eligible if already submitted and filing was before permit expiry
  const worker = await queryOne<any>(
    "SELECT trc_expiry, work_permit_expiry FROM workers WHERE id = $1",
    [legalCase.worker_id]
  );
  const permitExpiry = worker?.trc_expiry ?? worker?.work_permit_expiry;
  const filingDate = legalCase.mos_submission_date;
  const art108Eligible = MOS_FILED_STATUSES.includes(mosStatus) && filingDate && permitExpiry && new Date(filingDate) <= new Date(permitExpiry);

  return {
    ready: canSubmit,
    missingItems: missingRequired,
    mosStatus,
    canSubmit,
    art108Eligible: !!art108Eligible,
    warnings,
  };
}

// ═══ MOS STATUS UPDATE ══════════════════════════════════════════════════════

export async function updateMOSStatus(
  caseId: string,
  tenantId: string,
  newStatus: MOSStatus,
  extras?: { receiptUrl?: string; signatureMethod?: SignatureMethod; submissionDate?: string },
): Promise<any> {
  const sets: string[] = ["mos_status = $1", "updated_at = NOW()"];
  const vals: unknown[] = [newStatus];
  let idx = 2;

  if (newStatus === "submitted" || extras?.submissionDate) {
    sets.push(`mos_submission_date = $${idx++}`);
    vals.push(extras?.submissionDate ?? new Date().toISOString());
  }
  if (extras?.receiptUrl) {
    sets.push(`mos_receipt_url = $${idx++}`);
    vals.push(extras.receiptUrl);
  }
  if (extras?.signatureMethod) {
    sets.push(`e_signature_method = $${idx++}`);
    vals.push(extras.signatureMethod);
    sets.push(`e_signature_date = $${idx++}`);
    vals.push(new Date().toISOString());
  }
  if (newStatus === "submitted") {
    sets.push(`login_gov_pl_verified = TRUE`);
  }

  vals.push(caseId, tenantId);
  const updated = await queryOne<any>(
    `UPDATE legal_cases SET ${sets.join(", ")} WHERE id = $${idx} AND tenant_id = $${idx + 1} RETURNING *`,
    vals
  );
  if (!updated) throw new Error("Case not found");

  // Map MOS status to legal case status
  const legalStatusMap: Partial<Record<MOSStatus, string>> = {
    submitted: "PENDING",
    mos_pending: "PENDING",
    correction_needed: "PENDING",
    approved: "APPROVED",
    rejected: "REJECTED",
  };
  const mappedLegal = legalStatusMap[newStatus];
  if (mappedLegal && updated.status !== mappedLegal) {
    await execute(
      "UPDATE legal_cases SET status = $1, updated_at = NOW() WHERE id = $2",
      [mappedLegal, caseId]
    );
  }

  // correction_needed → create legal alert
  if (newStatus === "correction_needed") {
    const worker = await queryOne<any>("SELECT full_name FROM workers WHERE id = $1", [updated.worker_id]);
    await execute(
      `INSERT INTO legal_alerts (tenant_id, worker_id, alert_type, severity, new_status, message)
       VALUES ($1, $2, 'MOS_CORRECTION', 'HIGH', 'correction_needed', $3)`,
      [tenantId, updated.worker_id, `${worker?.full_name ?? "Worker"}: MOS application requires correction. Review and resubmit.`]
    );
  }

  // rejected → create alert + set appeal deadline
  if (newStatus === "rejected") {
    const deadline = new Date(Date.now() + 14 * 86_400_000).toISOString();
    await execute(
      "UPDATE legal_cases SET appeal_deadline = $1, next_action = 'Review MOS rejection and prepare appeal within 14 days' WHERE id = $2",
      [deadline, caseId]
    );
  }

  // Refresh legal snapshot
  try { await refreshWorkerLegalSnapshot(updated.worker_id, tenantId); } catch { /* non-blocking */ }

  return updated;
}

// ═══ PERMANENT RESIDENCE ELIGIBILITY ═════════════════════════════════════════

export interface PREligibility {
  eligible: boolean;
  eligibleDate: string | null;
  yearsInPoland: number;
  requirements: { item: string; met: boolean; detail: string }[];
  nextSteps: string[];
}

export async function checkPermanentResidenceEligibility(workerId: string, tenantId: string): Promise<PREligibility> {
  const worker = await queryOne<any>(
    "SELECT full_name, created_at FROM workers WHERE id = $1 AND tenant_id = $2",
    [workerId, tenantId]
  );
  if (!worker) throw new Error("Worker not found");

  // Get TRC history
  const trcCases = await query<any>(
    "SELECT status, start_date, expiry_date, created_at FROM trc_cases WHERE worker_id = $1::text AND tenant_id = $2::text ORDER BY created_at ASC",
    [workerId, tenantId]
  );

  // Get legal case
  const legalCase = await queryOne<any>(
    "SELECT status, mos_status FROM legal_cases WHERE worker_id = $1 AND tenant_id = $2 AND case_type = 'TRC' ORDER BY created_at DESC LIMIT 1",
    [workerId, tenantId]
  );

  // Calculate years — approximate from earliest TRC case or worker creation
  const earliestDate = trcCases[0]?.start_date ?? trcCases[0]?.created_at ?? worker.created_at;
  const yearsInPoland = earliestDate ? Math.floor((Date.now() - new Date(earliestDate).getTime()) / (365.25 * 86_400_000)) : 0;

  // PR requires 5 years of continuous legal stay + stable income + health insurance
  const requirements = [
    { item: "5 years continuous legal stay in Poland", met: yearsInPoland >= 5, detail: `${yearsInPoland} year(s) recorded` },
    { item: "Current valid TRC or protected status", met: legalCase?.status === "APPROVED" || legalCase?.status === "PENDING", detail: legalCase?.status ?? "No active case" },
    { item: "Stable and regular source of income", met: false, detail: "Requires manual verification" },
    { item: "Health insurance", met: false, detail: "Requires ZUS confirmation" },
    { item: "Knowledge of Polish language (B1)", met: false, detail: "Requires certificate" },
    { item: "Confirmed place of residence", met: false, detail: "Requires zameldowanie" },
  ];

  const allMet = requirements.every(r => r.met);
  const eligibleDate = yearsInPoland < 5 && earliestDate
    ? new Date(new Date(earliestDate).getTime() + 5 * 365.25 * 86_400_000).toISOString().slice(0, 10)
    : null;

  const nextSteps: string[] = [];
  if (yearsInPoland < 5) nextSteps.push(`Wait until ${eligibleDate ?? "5 years of stay"} to meet residency requirement`);
  if (!requirements[2].met) nextSteps.push("Obtain proof of stable income (employment contract + payslips)");
  if (!requirements[3].met) nextSteps.push("Obtain ZUS RCA confirmation for health insurance");
  if (!requirements[4].met) nextSteps.push("Pass Polish language exam at B1 level");
  if (!requirements[5].met) nextSteps.push("Obtain zameldowanie (residence registration)");
  if (allMet) nextSteps.push("All requirements met — prepare PR application");

  // Update eligibility on legal case
  if (legalCase) {
    await execute(
      "UPDATE legal_cases SET pr_eligible = $1, pr_eligible_date = $2, updated_at = NOW() WHERE id = $3",
      [allMet || yearsInPoland >= 5, eligibleDate, legalCase.id ?? null]
    ).catch(() => {});
  }

  return { eligible: allMet, eligibleDate, yearsInPoland, requirements, nextSteps };
}

// ═══ CITIZENSHIP ROADMAP ════════════════════════════════════════════════════

export interface CitizenshipRoadmap {
  currentStage: string;
  yearsInPoland: number;
  yearsRequired: number;
  eligibleDate: string | null;
  milestones: { year: number; milestone: string; status: "completed" | "current" | "future" }[];
  requirements: string[];
}

export async function getCitizenshipRoadmap(workerId: string, tenantId: string): Promise<CitizenshipRoadmap> {
  const worker = await queryOne<any>(
    "SELECT full_name, created_at FROM workers WHERE id = $1 AND tenant_id = $2",
    [workerId, tenantId]
  );
  if (!worker) throw new Error("Worker not found");

  const earliestCase = await queryOne<any>(
    "SELECT start_date, created_at FROM trc_cases WHERE worker_id = $1::text AND tenant_id = $2::text ORDER BY created_at ASC LIMIT 1",
    [workerId, tenantId]
  );

  const startDate = earliestCase?.start_date ?? earliestCase?.created_at ?? worker.created_at;
  const yearsInPoland = startDate ? Math.floor((Date.now() - new Date(startDate).getTime()) / (365.25 * 86_400_000)) : 0;

  // Polish citizenship requires: 3 years PR + 10 years total, OR marriage, OR Polish origin
  const yearsRequired = 10; // Standard path
  const eligibleDate = yearsInPoland < yearsRequired && startDate
    ? new Date(new Date(startDate).getTime() + yearsRequired * 365.25 * 86_400_000).toISOString().slice(0, 10)
    : null;

  const milestones = [
    { year: 0, milestone: "Arrival in Poland — first TRC application", status: yearsInPoland >= 0 ? "completed" as const : "future" as const },
    { year: 1, milestone: "First TRC renewal", status: yearsInPoland >= 1 ? "completed" as const : "future" as const },
    { year: 3, milestone: "Third TRC renewal — stable employment record", status: yearsInPoland >= 3 ? "completed" as const : "future" as const },
    { year: 5, milestone: "Permanent Residence (PR) eligibility", status: yearsInPoland >= 5 ? "completed" as const : yearsInPoland >= 4 ? "current" as const : "future" as const },
    { year: 6, milestone: "PR application + B1 Polish language", status: yearsInPoland >= 6 ? "completed" as const : "future" as const },
    { year: 8, milestone: "3 years with PR — citizenship eligibility approaching", status: yearsInPoland >= 8 ? "completed" as const : "future" as const },
    { year: 10, milestone: "Polish citizenship application eligible", status: yearsInPoland >= 10 ? "completed" as const : "future" as const },
  ];

  const currentStage = milestones.filter(m => m.status === "completed").pop()?.milestone ?? "Not started";

  return {
    currentStage,
    yearsInPoland,
    yearsRequired,
    eligibleDate,
    milestones,
    requirements: [
      "10 years of continuous legal stay in Poland",
      "At least 3 years with permanent residence permit",
      "Stable source of income",
      "Polish language certificate (B1 minimum)",
      "No criminal record",
      "Integration with Polish society",
    ],
  };
}
