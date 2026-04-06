/**
 * Safe legal explanation layer for Apatris UI.
 *
 * Rule-based only — no AI dependency.
 * Transforms existing engine output into clearer human language.
 * Does NOT change the status, invent a legal basis, or add legal conclusions.
 *
 * Two audiences:
 *  - "worker": simpler language, less jargon
 *  - "internal": precise legal/operational wording
 */

// ═══ TYPES ══════════════════════════════════════════════════════════════════

export interface LegalSnapshotForExplanation {
  legalStatus: string;
  legalBasis: string;
  riskLevel: string;
  summary?: string;
  conditions?: string[];
  warnings?: string[];
  requiredActions?: string[];
  permitExpiresAt?: string | null;
  trcApplicationSubmitted?: boolean;
  legalProtectionFlag?: boolean;
  formalDefectStatus?: string | null;
}

export type ExplanationAudience = "worker" | "internal";

export interface LegalExplanation {
  headline: string;
  body: string;
  audience: ExplanationAudience;
}

// ═══ STATUS DISPLAY CONFIG ══════════════════════════════════════════════════

export const STATUS_DISPLAY: Record<string, {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  dotColor: string;
  icon: "shield-check" | "shield" | "alert-triangle" | "x-octagon" | "help-circle";
}> = {
  VALID:                 { label: "Valid",             color: "text-emerald-400", bgColor: "bg-emerald-500/10", borderColor: "border-emerald-500/20", dotColor: "bg-emerald-400", icon: "shield-check" },
  EXPIRING_SOON:         { label: "Expiring Soon",     color: "text-amber-400",   bgColor: "bg-amber-500/10",   borderColor: "border-amber-500/20",   dotColor: "bg-amber-400",   icon: "alert-triangle" },
  PROTECTED_PENDING:     { label: "Protected Pending", color: "text-blue-400",    bgColor: "bg-blue-500/10",    borderColor: "border-blue-500/20",    dotColor: "bg-blue-400",    icon: "shield" },
  REVIEW_REQUIRED:       { label: "Review Required",   color: "text-orange-400",  bgColor: "bg-orange-500/10",  borderColor: "border-orange-500/20",  dotColor: "bg-orange-400",  icon: "help-circle" },
  EXPIRED_NOT_PROTECTED: { label: "Expired",           color: "text-red-400",     bgColor: "bg-red-500/10",     borderColor: "border-red-500/20",     dotColor: "bg-red-400",     icon: "x-octagon" },
  NO_PERMIT:             { label: "No Permit",         color: "text-red-400",     bgColor: "bg-red-900/20",     borderColor: "border-red-800/30",     dotColor: "bg-red-500",     icon: "x-octagon" },
};

export const BASIS_LABELS: Record<string, string> = {
  PERMIT_VALID:     "Current Permit",
  ART_108:          "Art. 108 Continuity",
  SPECUSTAWA_UKR:   "Ukrainian Special Act",
  REVIEW_REQUIRED:  "Pending Review",
  NO_LEGAL_BASIS:   "No Legal Basis",
};

export const RISK_DISPLAY: Record<string, { label: string; color: string; bgColor: string }> = {
  LOW:      { label: "Low",      color: "text-emerald-400", bgColor: "bg-emerald-500/10" },
  MEDIUM:   { label: "Medium",   color: "text-amber-400",   bgColor: "bg-amber-500/10" },
  HIGH:     { label: "High",     color: "text-orange-400",  bgColor: "bg-orange-500/10" },
  CRITICAL: { label: "Critical", color: "text-red-400",     bgColor: "bg-red-500/10" },
};

// ═══ EXPLANATION GENERATOR ══════════════════════════════════════════════════

export function generateLegalExplanation(
  snapshot: LegalSnapshotForExplanation,
  audience: ExplanationAudience,
): LegalExplanation {
  const { legalStatus, legalBasis, riskLevel } = snapshot;

  // ── VALID / EXPIRING_SOON ──────────────────────────────────────────────
  if (legalStatus === "VALID" || legalStatus === "EXPIRING_SOON") {
    const hasFiling = snapshot.trcApplicationSubmitted;
    if (audience === "worker") {
      return {
        headline: "Your work permit is currently valid.",
        body: hasFiling
          ? "A renewal application has already been filed. When your current permit expires, your legal stay will be evaluated for continuity protection."
          : legalStatus === "EXPIRING_SOON"
            ? "Your permit will expire soon. Please contact your employer about filing a renewal application before it expires."
            : "No action is needed at this time. Your employer will notify you when renewal is required.",
        audience,
      };
    }
    return {
      headline: "Permit valid — worker authorized to work.",
      body: hasFiling
        ? "TRC/renewal application already filed before expiry. Art. 108 continuity path is pre-established. Upon permit expiry, legal engine will re-evaluate for protected status."
        : legalStatus === "EXPIRING_SOON"
          ? "Permit expiring within 60 days. TRC application should be filed before expiry to preserve Art. 108 continuity protection."
          : "Permit valid with sufficient time remaining. No immediate action required.",
      audience,
    };
  }

  // ── PROTECTED_PENDING ──────────────────────────────────────────────────
  if (legalStatus === "PROTECTED_PENDING") {
    if (legalBasis === "SPECUSTAWA_UKR") {
      if (audience === "worker") {
        return {
          headline: "You are protected under the Special Act for Ukrainian Citizens.",
          body: "Your permit has expired, but because you are a Ukrainian national with an active application, your legal stay is extended under the Specustawa. You may continue working while your application is being processed.",
          audience,
        };
      }
      return {
        headline: "Specustawa (CUKR) protection applies.",
        body: "Ukrainian national with CUKR application post-2026-03-04 cutoff. Legal stay extended under the Special Act for Ukrainian Citizens. Not a standard Art. 108 path — monitor Specustawa provisions for changes.",
        audience,
      };
    }

    // Art. 108
    if (audience === "worker") {
      return {
        headline: "You are currently protected because your renewal was filed before your permit expired.",
        body: "Your original permit has expired, but because filing evidence was recorded before expiry and continuity conditions are marked as unchanged, you may continue working for the same employer in the same role while the decision is pending.",
        audience,
      };
    }
    return {
      headline: "Art. 108 continuity protection indicated.",
      body: "Art. 108 continuity path is currently indicated based on filing before permit expiry, same-employer continuity, and no blocking formal defect. Worker may continue employment under the same conditions until a final decision is made. Any change in employer, role, or location requires legal review.",
      audience,
    };
  }

  // ── REVIEW_REQUIRED ────────────────────────────────────────────────────
  if (legalStatus === "REVIEW_REQUIRED") {
    const hasDefect = snapshot.formalDefectStatus === "formal_defect";
    if (audience === "worker") {
      return {
        headline: "Your legal status needs to be reviewed by your employer.",
        body: hasDefect
          ? "There is an issue with your application that needs to be corrected. Please contact your employer or the immigration office to resolve it."
          : "Some information about your work authorization is incomplete. Your employer is reviewing your situation.",
        audience,
      };
    }
    return {
      headline: hasDefect
        ? "Formal defect blocks automatic protection confirmation."
        : "Insufficient data for automatic legal assessment.",
      body: hasDefect
        ? "TRC application has a formal defect (brak formalny). Art. 108 or Specustawa protection cannot be confirmed until the defect is resolved within the voivodeship deadline. Manual verification required."
        : "One or more continuity conditions could not be confirmed automatically. Manual review of immigration records required before confirming legal work authorization.",
      audience,
    };
  }

  // ── EXPIRED_NOT_PROTECTED ──────────────────────────────────────────────
  if (legalStatus === "EXPIRED_NOT_PROTECTED") {
    if (audience === "worker") {
      return {
        headline: "Your work permit has expired and you are not currently protected.",
        body: "Your employer has been notified. Please do not report to work until this is resolved. Contact your employer for next steps.",
        audience,
      };
    }
    return {
      headline: "Permit expired — no legal protection applies.",
      body: legalBasis === "NO_LEGAL_BASIS"
        ? "Worker's permit has expired. No TRC application was filed before expiry, or filing was after expiry. Art. 108 continuity does not apply. Continued employment carries PIP fine risk up to 50,000 PLN. Suspend assignment and consult immigration lawyer."
        : "Worker's permit has expired without legal protection. Manual review and legal consultation required.",
      audience,
    };
  }

  // ── NO_PERMIT ──────────────────────────────────────────────────────────
  if (legalStatus === "NO_PERMIT") {
    if (audience === "worker") {
      return {
        headline: "No work permit is on file for you.",
        body: "Please provide your work authorization documents to your employer as soon as possible.",
        audience,
      };
    }
    return {
      headline: "No immigration permits or TRC records on file.",
      body: "No work authorization data exists for this worker. Verify right to work before any assignment. Upload permits or evidence via the immigration system.",
      audience,
    };
  }

  // ── Fallback ───────────────────────────────────────────────────────────
  return {
    headline: audience === "worker" ? "Your status is being reviewed." : "Legal status undetermined.",
    body: audience === "worker"
      ? "Your employer will update you when more information is available."
      : "Legal status could not be mapped to a known state. Manual review required.",
    audience,
  };
}
