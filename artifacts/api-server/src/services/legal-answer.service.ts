/**
 * Legal Answer Service — centralises structured legal answer generation.
 *
 * Two entry points:
 *  1. mapAIResponseToStructuredAnswer  — maps raw Claude JSON into structured fields
 *  2. generateStructuredLegalAnswer    — builds structured answer from a legal snapshot
 *
 * Output shape matches the frontend StructuredResult component exactly.
 */

// ─── Output Type ────────────────────────────────────────────────────────────

export type LegalDecision = "PROCEED" | "CAUTION" | "BLOCKED";

export interface StructuredLegalAnswer {
  answer: string;
  operator_summary: string;
  legal_summary: string;
  legal_basis: { law: string; article: string; explanation: string }[];
  applies_to: string;
  required_documents: string[];
  process_steps: string[];
  deadlines: string[];
  risks: string[];
  next_actions: string[];
  decision: LegalDecision;
  sources: { url: string; title?: string }[];
  confidence: number;
  human_review_required: boolean;
  /** Legacy field for backward compatibility */
  actionItems: string[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function arr(v: unknown): any[] {
  return Array.isArray(v) ? v : [];
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

const VALID_DECISIONS: LegalDecision[] = ["PROCEED", "CAUTION", "BLOCKED"];

function toDecision(raw: string): LegalDecision {
  const u = raw.toUpperCase() as LegalDecision;
  return VALID_DECISIONS.includes(u) ? u : "CAUTION";
}

function normaliseLegalBasis(items: unknown[]): StructuredLegalAnswer["legal_basis"] {
  return items.map((b: any) =>
    typeof b === "string"
      ? { law: "", article: "", explanation: b }
      : { law: str(b?.law), article: str(b?.article), explanation: str(b?.explanation) }
  );
}

// ─── 1. Map raw AI response to structured answer ────────────────────────────

/**
 * Takes the raw parsed JSON from a Claude response and maps it into
 * the canonical StructuredLegalAnswer shape. Every field has a safe default.
 */
export function mapAIResponseToStructuredAnswer(parsed: Record<string, any>): StructuredLegalAnswer {
  const confidence = Number(parsed.confidence) || 0;

  return {
    answer: str(parsed.answer) || str(parsed.response) || str(parsed.text) || "No answer available",
    operator_summary: str(parsed.operator_summary) || str(parsed.summary),
    legal_summary: str(parsed.legal_summary),
    legal_basis: normaliseLegalBasis(arr(parsed.legal_basis)),
    applies_to: str(parsed.applies_to),
    required_documents: arr(parsed.required_documents),
    process_steps: arr(parsed.process_steps),
    deadlines: arr(parsed.deadlines),
    risks: arr(parsed.risks),
    next_actions: arr(parsed.next_actions),
    decision: toDecision(str(parsed.decision)),
    sources: arr(parsed.sources),
    confidence,
    human_review_required: parsed.human_review_required === true || confidence < 0.6,
    actionItems: arr(parsed.next_actions).concat(arr(parsed.actionItems)).concat(arr(parsed.action_items)),
  };
}

// ─── 2. Build structured answer from legal snapshot ─────────────────────────

/** Legal snapshot status → decision mapping */
const STATUS_TO_DECISION: Record<string, LegalDecision> = {
  VALID: "PROCEED",
  PROTECTED_PENDING: "CAUTION",
  REVIEW_REQUIRED: "CAUTION",
  EXPIRING_SOON: "CAUTION",
  EXPIRED_NOT_PROTECTED: "BLOCKED",
  NO_PERMIT: "BLOCKED",
};

/** Legal basis → law reference mapping */
const BASIS_TO_LAW: Record<string, { law: string; article: string; explanation: string }> = {
  PERMIT_VALID: { law: "Ustawa o cudzoziemcach", article: "Art. 114", explanation: "Valid temporary residence and work permit" },
  ART_108: { law: "Ustawa o cudzoziemcach", article: "Art. 108", explanation: "Continuity of legal stay during pending renewal application" },
  SPECUSTAWA_UKR: { law: "Specustawa (CUKR)", article: "Art. 42", explanation: "Special protection for Ukrainian nationals under the Special Act" },
  REVIEW_REQUIRED: { law: "", article: "", explanation: "Legal basis could not be determined — manual review required" },
  NO_LEGAL_BASIS: { law: "", article: "", explanation: "No applicable legal basis identified" },
};

export interface LegalSnapshotInput {
  /** From legal-engine or legal-status service */
  legalStatus?: string;
  legalBasis?: string;
  riskLevel?: string;
  summary?: string;
  label?: string;
  conditions?: string[];
  warnings?: string[];
  requiredActions?: string[];
  /** Worker context */
  workerName?: string;
  nationality?: string;
  permitExpiry?: string | null;
  passportExpiry?: string | null;
  trcSubmitted?: boolean;
}

export interface GenerateInput {
  legalSnapshot?: LegalSnapshotInput;
  rawAnswer?: Record<string, any>;
  questionType?: string;
  audience?: string;
}

/**
 * Generates a structured legal answer from a legal snapshot and/or a raw AI answer.
 *
 * Priority:
 *  - legalSnapshot fields override rawAnswer equivalents (snapshot is deterministic truth)
 *  - rawAnswer fills in any gaps (AI-generated content)
 *  - safe defaults fill everything else
 */
export function generateStructuredLegalAnswer(input: GenerateInput): StructuredLegalAnswer {
  const snap = input.legalSnapshot;
  const raw = input.rawAnswer ?? {};

  // Start from AI answer if available
  const base = Object.keys(raw).length > 0 ? mapAIResponseToStructuredAnswer(raw) : emptyAnswer();

  // Override with snapshot truth
  if (snap) {
    const status = snap.legalStatus ?? "";
    const basis = snap.legalBasis ?? "";

    base.decision = STATUS_TO_DECISION[status] ?? base.decision;

    if (snap.summary) {
      base.operator_summary = snap.summary;
    }

    // Legal basis from snapshot
    const basisRef = BASIS_TO_LAW[basis];
    if (basisRef && basisRef.article) {
      // Prepend deterministic basis, keep any AI-found ones after
      const existing = base.legal_basis.filter(b => b.article !== basisRef.article);
      base.legal_basis = [basisRef, ...existing];
    }

    // Legal summary from snapshot label + conditions
    if (snap.label) {
      const condStr = (snap.conditions ?? []).length > 0
        ? ` Conditions: ${snap.conditions!.join("; ")}.`
        : "";
      base.legal_summary = `${snap.label}.${condStr}`;
    }

    // Warnings → risks
    if (snap.warnings?.length) {
      const snapshotWarnings = snap.warnings.filter(w => !base.risks.includes(w));
      base.risks = [...snapshotWarnings, ...base.risks];
    }

    // Required actions → next_actions
    if (snap.requiredActions?.length) {
      const snapshotActions = snap.requiredActions.filter(a => !base.next_actions.includes(a));
      base.next_actions = [...snapshotActions, ...base.next_actions];
      base.actionItems = [...base.next_actions];
    }

    // Applies to from worker context
    if (snap.workerName) {
      base.applies_to = base.applies_to || `${snap.workerName}${snap.nationality ? ` (${snap.nationality})` : ""}`;
    }

    // Deadlines from permit expiry
    if (snap.permitExpiry) {
      const days = Math.ceil((new Date(snap.permitExpiry).getTime() - Date.now()) / 86400000);
      const expiryLine = days <= 0
        ? `Permit expired ${Math.abs(days)} day(s) ago`
        : `Permit expires in ${days} day(s) (${snap.permitExpiry})`;
      if (!base.deadlines.some(d => d.includes(snap.permitExpiry!))) {
        base.deadlines.unshift(expiryLine);
      }
    }

    // Confidence: snapshot-derived is high certainty (deterministic)
    if (status === "VALID" || status === "EXPIRED_NOT_PROTECTED") {
      base.confidence = Math.max(base.confidence, 0.95);
    } else if (status === "PROTECTED_PENDING") {
      base.confidence = Math.max(base.confidence, 0.85);
    }

    base.human_review_required = base.human_review_required || status === "REVIEW_REQUIRED" || base.confidence < 0.6;
  }

  return base;
}

// ─── Empty answer factory ───────────────────────────────────────────────────

function emptyAnswer(): StructuredLegalAnswer {
  return {
    answer: "",
    operator_summary: "",
    legal_summary: "",
    legal_basis: [],
    applies_to: "",
    required_documents: [],
    process_steps: [],
    deadlines: [],
    risks: [],
    next_actions: [],
    decision: "CAUTION",
    sources: [],
    confidence: 0,
    human_review_required: true,
    actionItems: [],
  };
}
