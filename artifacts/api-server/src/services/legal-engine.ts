/**
 * Operational legal-state engine for Apatris.
 * Used for deployability and authority-response foundation.
 *
 * PURE FUNCTION — no DB access, no side effects.
 * Takes structured input, returns structured legal assessment.
 *
 * This is NOT a legal opinion. It is an operational decision aid
 * based on documented Polish immigration rules as of 2026.
 * Always consult a qualified immigration lawyer for final decisions.
 *
 * Legal basis:
 * - Art. 108 of the Act on Foreigners (Ustawa o cudzoziemcach)
 *   "If an application for a temporary residence permit is submitted
 *   during the period of legal stay, the foreigner's stay is deemed
 *   legal until the decision on the application becomes final."
 *
 * - Special Act for Ukrainian Citizens (Specustawa / CUKR)
 *   Extended legal stay for Ukrainian nationals with active applications.
 *   Relevant post 2026-03-04 cutoff.
 */

// ═══ INPUT ══════════════════════════════════════════════════════════════════

export interface LegalProtectionInput {
  /** Date the TRC/permit application was filed (ISO string or null) */
  filingDate: string | null;

  /** Current permit expiry date (ISO string or null) */
  permitExpiryDate: string | null;

  /** Worker's nationality (ISO 2-letter code, e.g. "UKR", "PH", "IN") */
  nationality?: string;

  /** Whether a CUKR application (Ukrainian Special Act) was submitted */
  hasCukrApplication?: boolean;

  /** Whether the worker remains with the same employer as in the original permit */
  sameEmployer?: boolean;

  /** Whether the worker remains in the same role/position */
  sameRole?: boolean;

  /** Whether the worker remains at the same work location */
  sameLocation?: boolean;

  /** Whether the TRC application has a formal defect (brak formalny) */
  formalDefect?: boolean;

  /** Whether the worker had a prior right to work before the current application */
  hadPriorRightToWork?: boolean;
}

// ═══ OUTPUT ═════════════════════════════════════════════════════════════════

export type LegalProtectionStatus =
  | "VALID"
  | "PROTECTED_PENDING"
  | "REVIEW_REQUIRED"
  | "EXPIRED_NOT_PROTECTED";

export type LegalBasis =
  | "PERMIT_VALID"
  | "ART_108"
  | "SPECUSTAWA_UKR"
  | "REVIEW_REQUIRED"
  | "NO_LEGAL_BASIS";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface LegalProtectionResult {
  status: LegalProtectionStatus;
  legalBasis: LegalBasis;
  riskLevel: RiskLevel;
  label: string;
  summary: string;
  conditions: string[];
  warnings: string[];
  requiredActions: string[];
}

// ═══ STATUS LABELS ══════════════════════════════════════════════════════════

const LABELS: Record<LegalProtectionStatus, string> = {
  VALID: "Valid Work Authorization",
  PROTECTED_PENDING: "Protected — Application Pending",
  REVIEW_REQUIRED: "Manual Review Required",
  EXPIRED_NOT_PROTECTED: "Expired — Not Protected",
};

// ═══ RISK LEVEL MAPPING ═════════════════════════════════════════════════════

const RISK_MAP: Record<LegalProtectionStatus, RiskLevel> = {
  VALID: "LOW",
  PROTECTED_PENDING: "MEDIUM",
  REVIEW_REQUIRED: "HIGH",
  EXPIRED_NOT_PROTECTED: "CRITICAL",
};

// ═══ CORE DECISION ENGINE ═══════════════════════════════════════════════════

/**
 * Evaluates a worker's legal protection status based on Polish immigration rules.
 *
 * Decision order (v1.1 — patched):
 *  1. No permit expiry → REVIEW_REQUIRED
 *  2. Permit still valid (with filing-awareness — Patch 4)
 *  3. Permit expired + no filing → EXPIRED_NOT_PROTECTED
 *  4. Formal defect on TRC application → REVIEW_REQUIRED  ← moved earlier (Patch 1)
 *  5. Ukrainian Special Act (CUKR) → PROTECTED_PENDING
 *  6. Art. 108 full continuity → PROTECTED_PENDING
 *  7. Art. 108 partial continuity → REVIEW_REQUIRED
 *  8. Filed after expiry → EXPIRED_NOT_PROTECTED
 *  9. Fallback → REVIEW_REQUIRED
 */
export function evaluateWorkerLegalProtection(input: LegalProtectionInput): LegalProtectionResult {
  const now = new Date();
  const permitExpiry = input.permitExpiryDate ? new Date(input.permitExpiryDate) : null;
  const filingDate = input.filingDate ? new Date(input.filingDate) : null;

  // ── RULE 1: No permit expiry date → cannot assess ─────────────────────
  if (!permitExpiry) {
    return {
      status: "REVIEW_REQUIRED",
      legalBasis: "REVIEW_REQUIRED",
      riskLevel: "HIGH",
      label: LABELS.REVIEW_REQUIRED,
      summary: "No permit expiry date on file. Legal work authorization cannot be determined automatically.",
      conditions: [],
      warnings: [
        "Without a permit expiry date, the system cannot determine legal status.",
        "This does not mean the worker is unauthorized — it means the data is incomplete.",
      ],
      requiredActions: [
        "Verify the worker's current permit and enter the expiry date.",
        "Check the worker's passport for a stamp (stempel) confirming legal stay.",
      ],
    };
  }

  const daysUntilExpiry = Math.ceil((permitExpiry.getTime() - now.getTime()) / 86_400_000);

  // ── RULE 2: Permit is still valid ─────────────────────────────────────
  if (daysUntilExpiry > 0) {
    const warnings: string[] = [];
    const actions: string[] = [];
    const conditions: string[] = [
      "Worker holds a valid work authorization.",
      `Permit expires on ${permitExpiry.toLocaleDateString("en-GB")}.`,
    ];

    if (daysUntilExpiry <= 30) {
      warnings.push(`Permit expires in ${daysUntilExpiry} days — urgent renewal needed.`);
      actions.push("Submit TRC application immediately to preserve Art. 108 continuity protection.");
    } else if (daysUntilExpiry <= 60) {
      warnings.push(`Permit expires in ${daysUntilExpiry} days — plan renewal.`);
      actions.push("Begin TRC application process to ensure filing before expiry.");
    }

    // ── Patch 4: Acknowledge filing-before-expiry on a still-valid permit
    const filedBeforeExpiry = filingDate && filingDate <= permitExpiry;
    if (filedBeforeExpiry) {
      conditions.push(`TRC application already filed on ${filingDate.toLocaleDateString("en-GB")} (before permit expiry). Art. 108 continuity protection will apply upon expiry if conditions are met.`);
      warnings.push("A TRC application has been filed. Upon permit expiry, Art. 108 continuity protection will be evaluated automatically.");
    }

    return {
      status: "VALID",
      legalBasis: "PERMIT_VALID",
      riskLevel: "LOW",
      label: LABELS.VALID,
      summary: `Work permit is valid with ${daysUntilExpiry} day(s) remaining (expires ${permitExpiry.toLocaleDateString("en-GB")}).`,
      conditions,
      warnings,
      requiredActions: actions,
    };
  }

  // ── Permit is expired from this point ─────────────────────────────────
  const daysSinceExpiry = Math.abs(daysUntilExpiry);

  // ── RULE 3: No filing date AND permit expired → not protected ─────────
  if (!filingDate) {
    return {
      status: "EXPIRED_NOT_PROTECTED",
      legalBasis: "NO_LEGAL_BASIS",
      riskLevel: "CRITICAL",
      label: LABELS.EXPIRED_NOT_PROTECTED,
      summary: `Work permit expired ${daysSinceExpiry} day(s) ago. No TRC application on file. Worker is NOT legally protected.`,
      conditions: [],
      warnings: [
        "Worker is not legally authorized to work.",
        "Continued employment carries PIP fine risk up to 50,000 PLN per worker.",
        "The worker's stay may be considered illegal.",
      ],
      requiredActions: [
        "Suspend work assignment immediately.",
        "Consult immigration lawyer before taking further action.",
        "Submit new permit application if the worker wishes to continue employment.",
      ],
    };
  }

  // ── RULE 4 (MOVED EARLIER — Patch 1): Formal defect → REVIEW ─────────
  // A formal defect (brak formalny) on the TRC application creates legal
  // uncertainty. It MUST be checked BEFORE Art. 108 or CUKR protection
  // is granted — a defect means the application may not be properly pending.
  if (input.formalDefect === true) {
    return {
      status: "REVIEW_REQUIRED",
      legalBasis: "REVIEW_REQUIRED",
      riskLevel: "HIGH",
      label: LABELS.REVIEW_REQUIRED,
      summary: `TRC application has a formal defect (brak formalny). Art. 108 or Specustawa protection CANNOT be confirmed until the defect is resolved. Permit expired ${daysSinceExpiry} day(s) ago.`,
      conditions: [
        "A formal defect notice was issued by the voivodeship office.",
        `TRC application was filed on ${filingDate.toLocaleDateString("en-GB")}.`,
        "Formal defect must be resolved before any legal protection can be confirmed.",
      ],
      warnings: [
        "A formal defect may void Art. 108 continuity protection if not corrected within the deadline.",
        "The worker has a deadline to correct the defect — missing it may terminate the application entirely.",
        "Until the defect is resolved, the worker's legal work authorization is uncertain.",
        "Do NOT assume legal protection while a defect is unresolved.",
      ],
      requiredActions: [
        "Identify the specific defect from the voivodeship notice.",
        "Correct the defect within the deadline specified in the notice.",
        "After correction is confirmed, reassess legal status immediately.",
        "Consult immigration lawyer if the defect is substantive or deadline is near.",
      ],
    };
  }

  // ── RULE 5: 2026 Ukrainian Special Act (Specustawa / CUKR) ───────────
  const ukrCutoff = new Date("2026-03-04");
  if (
    now > ukrCutoff &&
    input.nationality?.toUpperCase() === "UKR" &&
    input.hasCukrApplication === true
  ) {
    return {
      status: "PROTECTED_PENDING",
      legalBasis: "SPECUSTAWA_UKR",
      riskLevel: "MEDIUM",
      label: LABELS.PROTECTED_PENDING,
      summary: `Ukrainian national with CUKR application. Legal stay extended under the Special Act for Ukrainian Citizens (Specustawa). Permit expired ${daysSinceExpiry} day(s) ago but protection applies.`,
      conditions: [
        "Worker is a Ukrainian national (UKR).",
        "CUKR application has been submitted.",
        "Current date is after the 2026-03-04 cutoff.",
        "Protection applies under the Special Act for Ukrainian Citizens.",
        "No formal defect on the application.",
      ],
      warnings: [
        "This protection is specific to the Ukrainian Special Act and may have a defined end date.",
        "Monitor official announcements for any changes to the Specustawa provisions.",
        "This is not a standard Art. 108 protection — different rules may apply.",
      ],
      requiredActions: [
        "Verify CUKR application status with the voivodeship office.",
        "Ensure the worker has documentation proving the application was submitted.",
      ],
    };
  }

  // ── RULE 6: Art. 108 Continuity Protection ────────────────────────────
  const filedBeforeExpiry = filingDate <= permitExpiry;

  if (filedBeforeExpiry) {
    const hasFullContinuity =
      input.hadPriorRightToWork === true &&
      input.sameEmployer === true &&
      input.sameRole === true;

    // ── RULE 6a: Full continuity → PROTECTED ────────────────────────────
    if (hasFullContinuity) {
      return {
        status: "PROTECTED_PENDING",
        legalBasis: "ART_108",
        riskLevel: "MEDIUM",
        label: LABELS.PROTECTED_PENDING,
        summary: `Permit expired ${daysSinceExpiry} day(s) ago, but Art. 108 protection applies. TRC application was filed before permit expiry (${filingDate.toLocaleDateString("en-GB")}). Worker may continue working for the same employer in the same role.`,
        conditions: [
          `TRC application filed on ${filingDate.toLocaleDateString("en-GB")} (before permit expiry on ${permitExpiry.toLocaleDateString("en-GB")}).`,
          "Worker had a prior right to work under the expired permit.",
          "Worker remains with the same employer.",
          "Worker remains in the same role/position.",
          "No formal defect (brak formalny) in the TRC application.",
        ],
        warnings: [
          "Protection is conditional — any change in employer, role, or work location may void it.",
          "The worker must obtain a stamp in passport (stempel w paszporcie) as proof of legal stay.",
          "If the voivodeship issues a formal defect notice, protection status must be reassessed.",
          "This assessment is based on available data — it is not a legal opinion.",
        ],
        requiredActions: [
          "Verify that the stamp (stempel) has been obtained from the voivodeship office.",
          "Monitor the TRC application status for any formal defect notices.",
          "Do NOT change the worker's employer, role, or primary work location without legal review.",
        ],
      };
    }

    // ── RULE 7: Filed before expiry but continuity unclear → REVIEW ─────
    const missingFlags: string[] = [];
    if (input.hadPriorRightToWork !== true) missingFlags.push("prior right to work not confirmed");
    if (input.sameEmployer !== true) missingFlags.push("same employer not confirmed");
    if (input.sameRole !== true) missingFlags.push("same role not confirmed");

    return {
      status: "REVIEW_REQUIRED",
      legalBasis: "REVIEW_REQUIRED",
      riskLevel: "HIGH",
      label: LABELS.REVIEW_REQUIRED,
      summary: `TRC application was filed before permit expiry, but Art. 108 continuity cannot be confirmed automatically. Missing: ${missingFlags.join(", ")}. Manual review is required.`,
      conditions: [
        `TRC application filed on ${filingDate.toLocaleDateString("en-GB")} (before permit expiry).`,
        "However, not all continuity conditions can be verified automatically.",
      ],
      warnings: [
        `The following could not be confirmed: ${missingFlags.join("; ")}.`,
        "Art. 108 protection requires ALL conditions to be met simultaneously.",
        "If any condition is not met, the worker may not be legally protected.",
      ],
      requiredActions: [
        "Verify each continuity condition with the worker and immigration records.",
        "Confirm same employer, same role, and prior right to work.",
        "If all conditions are met, update the worker's record and reassess.",
        "If uncertain, consult an immigration lawyer before continuing employment.",
      ],
    };
  }

  // ── RULE 8: Filing was AFTER permit expiry → NOT PROTECTED ────────────
  return {
    status: "EXPIRED_NOT_PROTECTED",
    legalBasis: "NO_LEGAL_BASIS",
    riskLevel: "CRITICAL",
    label: LABELS.EXPIRED_NOT_PROTECTED,
    summary: `Permit expired on ${permitExpiry.toLocaleDateString("en-GB")}. TRC application was filed on ${filingDate.toLocaleDateString("en-GB")} — AFTER expiry. Art. 108 protection does NOT apply because the application was not filed during the period of legal stay.`,
    conditions: [],
    warnings: [
      "Art. 108 requires the application to be filed BEFORE the permit expires.",
      "Filing after expiry does not establish legal stay protection.",
      "Worker is not legally authorized to work under this permit.",
      "PIP fine risk: up to 50,000 PLN per worker for employing without valid authorization.",
    ],
    requiredActions: [
      "Suspend work assignment immediately.",
      "Consult immigration lawyer for options (new application, voluntary departure, etc.).",
      "Do NOT continue employment based on the late-filed application.",
    ],
  };
}
