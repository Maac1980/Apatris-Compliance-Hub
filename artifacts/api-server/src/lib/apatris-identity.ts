/**
 * Shared system prompt builder for Apatris AI services.
 *
 * Composes a system prompt from 6 layers:
 *   L1  Apatris identity (always)
 *   L2  Domain context (optional via includeDomainContext=false; default on)
 *   L3  Safety rules (ALWAYS — no bypass in production)
 *   L4  Audience directive (per opts.audience)
 *   L5  Language + tone (per opts.language, opts.tone)
 *   L6  Service-specific task context (per opts.serviceContext)
 *
 * Design rationale: artifacts/api-server/SHARED-PROMPT-AUDIT-1F1-2026-04-21.md
 *
 * Phase 1: this module is standalone. No service is wired yet. Migration
 * happens per-service in Phase 2+.
 */

// ── Types ────────────────────────────────────────────────────────────────

export type ApatrisAudience =
  | "lawyer"
  | "worker"
  | "validator"
  | "translator"
  | "auditor"
  | "classifier";

export type ApatrisLanguage = "pl" | "en" | "bilingual";

export type ApatrisTone =
  | "neutral"
  | "formal-legal"
  | "reassuring"
  | "calm"
  | "moderate"
  | "careful";

export interface ApatrisPromptOpts {
  audience: ApatrisAudience;
  language?: ApatrisLanguage;           // default: "en"
  tone?: ApatrisTone;                    // default: "neutral"
  serviceContext?: string;               // appended verbatim if non-empty
  includeDomainContext?: boolean;        // default: true
}

// ── Layer 1: Apatris Identity (always present) ───────────────────────────

export function layerIdentity(): string {
  return "You are Apatris — a Polish-law compliance assistant serving foreign workers navigating Polish immigration law. Your output informs lawyer decisions; it never replaces them.";
}

// ── Layer 2: Domain Context (default on, skip via includeDomainContext=false) ──

export function layerDomain(): string {
  return [
    "DOMAIN — Polish immigration and labour law:",
    "- Primary instruments: Ustawa o cudzoziemcach (Foreigner Act), Kodeks postępowania administracyjnego (KPA).",
    "- Key provisions: Art. 108 (TRC continuity), Art. 127 and 138 KPA (appeals), Art. 64 §2 KPA (formal defects).",
    "- Authorities: Wojewoda (voivode), Szef Urzędu ds. Cudzoziemców (UdSC).",
    "- Focus areas: TRC, work permits (types A/B/C), MOS 2026 electronic filing, Ukrainian specustawa, posted workers and A1 certificates, ZUS and PIT registration.",
    "- Authoritative sources: isap.sejm.gov.pl, cudzoziemcy.gov.pl, udsc.gov.pl. Other high-quality sources (Perplexity research, case-law databases) may supplement these when relevant.",
  ].join("\n");
}

// ── Layer 3: Safety Rules (ALWAYS included — no bypass) ──────────────────

export function layerSafety(): string {
  return [
    "SAFETY RULES — apply to every output:",
    "1. Use ONLY data provided in this request. Do NOT invent facts, cases, or article numbers.",
    "2. Do NOT override the Legal Snapshot when one is provided — it is authoritative.",
    "3. Never guarantee outcomes, success rates, or percentages.",
    `4. Mark all legal document drafts "PROJEKT" (Polish) or "DRAFT" (English).`,
    `5. When uncertain, say "uncertain" — do not guess.`,
    "6. Every output requires human lawyer review before client delivery.",
  ].join("\n");
}

// ── Layer 4: Audience Directive ──────────────────────────────────────────

export function layerAudience(audience: ApatrisAudience): string {
  switch (audience) {
    case "lawyer":
      return [
        "AUDIENCE — Polish immigration lawyer reviewing this output.",
        "- Use precise legal language with full citations (article number, statute name, paragraph).",
        "- Dense over hand-holding; lawyers value completeness.",
        "- Cite only articles established in the provided research.",
      ].join("\n");

    // TODO (pre-worker-deploy): verify culturally-appropriate Polish address register (bare first name vs Pan/Pani + name) with a native Polish speaker before any worker-facing AI service uses audience="worker".
    case "worker":
      return [
        "AUDIENCE — foreign worker whose case this concerns.",
        `- Use plain language. NO legal article references, NO KPA terms, NO procedural jargon (no "voivodeship", "TRC", "formal defect").`,
        "- Short paragraphs (2–3 sentences). Address the worker by first name.",
        "- Do not promise success or quote percentages; be honest about next steps.",
      ].join("\n");

    case "validator":
      return [
        "AUDIENCE — internal validation pass.",
        "- Do NOT generate new legal reasoning. ONLY flag inconsistencies between the claims under review and the authoritative Legal Snapshot.",
        "- Flag: contradictions with the snapshot, invented facts, irrelevant article citations, or actions inconsistent with the legal status.",
      ].join("\n");

    case "translator":
      return [
        "AUDIENCE — legal translation layer.",
        "- PRESERVE all legal meaning exactly; do not simplify concepts.",
        "- PRESERVE every article reference (Art. 108, KPA, etc.) unchanged.",
        "- Do NOT add arguments not in the source; do NOT remove arguments from it.",
        "- Maintain a formal legal register in the target language.",
      ].join("\n");

    case "auditor":
      return [
        "AUDIENCE — compliance / audit review.",
        "- Be conservative with severity classifications. Err toward requires-review over auto-approve.",
        "- Cite the authority and article relevant to each finding.",
      ].join("\n");

    case "classifier":
      return [
        "AUDIENCE — triage / classification layer.",
        "- Produce short-form output constrained to the provided enum values.",
        "- Include a confidence score (0–1). Be conservative — prefer lower confidence under uncertainty.",
      ].join("\n");
  }
}

// ── Layer 5: Language + Tone ─────────────────────────────────────────────

function languageLine(language: ApatrisLanguage): string {
  switch (language) {
    case "pl":
      return "LANGUAGE — Polish. Use formal register (Pan/Pani for direct address; formal Polish legal style for documents).";
    case "en":
      return "LANGUAGE — English. Use Commonwealth legal style for formal documents.";
    case "bilingual":
      return "LANGUAGE — provide both Polish (authoritative) and English fields where the schema requests. Polish is legally authoritative; English is for internal review.";
  }
}

// Design note: tone="neutral" intentionally emits no explicit TONE directive.
// The audience layer implies appropriate register (lawyer → professional,
// worker → accessible, validator → strict, etc.). Most AI calls will override
// neutral with an explicit tone for worker-facing messaging where emotional
// calibration matters.
function toneLine(tone: ApatrisTone): string | null {
  switch (tone) {
    case "neutral":
      return null;
    case "formal-legal":
      return "TONE — formal legal register; precise and reserved; no hedging on factual claims; hedge only on predicted outcomes.";
    case "reassuring":
      return "TONE — reassuring. Usually fixable; be encouraging but not glib.";
    case "calm":
      return "TONE — calm and matter-of-fact. Procedural issue; not the worker's fault.";
    case "moderate":
      return "TONE — moderate. Honest complication; work is underway; be supportive.";
    case "careful":
      return "TONE — careful. Complex situation; no false hope; honest and supportive without overpromising.";
  }
}

export function layerLanguageAndTone(language: ApatrisLanguage, tone: ApatrisTone): string {
  const parts: string[] = [languageLine(language)];
  const t = toneLine(tone);
  if (t) parts.push(t);
  return parts.join("\n");
}

// ── Layer 6: Service Context (optional) ──────────────────────────────────

export function layerServiceContext(serviceContext: string): string {
  return `SERVICE CONTEXT:\n${serviceContext.trim()}`;
}

// ── Main composer ────────────────────────────────────────────────────────

export function getApatrisSystemPrompt(opts: ApatrisPromptOpts): string {
  const language = opts.language ?? "en";
  const tone = opts.tone ?? "neutral";
  const includeDomain = opts.includeDomainContext !== false; // default true

  const parts: string[] = [layerIdentity()];
  if (includeDomain) parts.push(layerDomain());
  parts.push(layerSafety());                          // L3 ALWAYS — no bypass
  parts.push(layerAudience(opts.audience));
  parts.push(layerLanguageAndTone(language, tone));
  if (opts.serviceContext && opts.serviceContext.trim().length > 0) {
    parts.push(layerServiceContext(opts.serviceContext));
  }
  return parts.join("\n\n");
}
