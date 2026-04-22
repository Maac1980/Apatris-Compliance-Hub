/**
 * PII anonymization for vector embedding subjects.
 *
 * Purpose: produce an embedding-safe version of case narrative text that
 * (a) contains no PII and (b) preserves enough semantic signal that a
 * cosine-similarity match still recognizes "similar rejection grounds"
 * patterns. Differs from audit-log.ts::sanitizePiiFromAuditText, which
 * replaces every hit with "[encrypted]" — a single opaque token discards
 * structural information that the embedding model uses.
 *
 * Tokenization choice: each PII class gets a distinct semantic token
 * (`[WORKER_NAME]`, `[PESEL]`, `[PASSPORT]`, `[IBAN]`). This preserves
 * the "subject / identifier / amount" role structure in the sentence so
 * the embedding captures the legal-pattern signal, not just a bag of words.
 *
 * Reuses base regexes from audit-log.ts (PESEL 11-digit, Polish IBAN).
 * Adds: passport number (alphanumeric 6–12 chars uppercase), NER-lite
 * Polish name detection.
 *
 * Known gaps (see pii-anonymize.test.ts):
 *   - diacritic-free Polish names ("Lukasz Nowak") not caught
 *   - compound/multi-part names ("van der Berg") not caught
 *   - honorifics without surname ("Pan Jan") not caught
 *   - domain-inference identifiers ("plumber from Gdansk shipyard") not
 *     caught (per VECTOR-RAG-AUDIT §8 risk #6)
 *
 * Phase 2 may adopt a lightweight NER library if false-negative rate is
 * material once we have real rejection narratives in prod.
 */

export type ReplacementClass = "PESEL" | "IBAN" | "PASSPORT" | "WORKER_NAME";

export interface AnonymizeResult {
  /** Input with PII substituted by semantic tokens. */
  anonymized: string;
  /** Per-class counts of replacements made. Useful for audit logging. */
  replacements: Record<ReplacementClass, number>;
}

// PESEL: 11 digits, word-bounded. Same as audit-log.ts.
const PESEL_RX = /\b\d{11}\b/g;

// Polish IBAN: PL + 2-4 digits + 5-6 groups of 4 digits. Same as audit-log.ts.
const IBAN_PL_RX = /\bPL\s?\d{2,4}(?:\s?\d{4}){5,6}\b/g;

// Passport: 6–12 uppercase alphanumeric, word-bounded. Intentionally
// conservative — broad enough to catch most issuing-country formats,
// narrow enough to avoid gratuitously blanking unrelated codes.
const PASSPORT_RX = /\b[A-Z]{1,2}\d{6,9}\b|\b[A-Z]\d{7,8}\b/g;

// NER-lite Polish name: two consecutive Capitalized words where at least
// one contains a Polish diacritic OR the pair is preceded by a Polish
// honorific ("Pan", "Pani") or suffixed with a patronymic pattern.
// This deliberately misses diacritic-free names (see "known gaps" above).
//
// ⚠️ TODO(Phase 1.5 BLOCKER): This regex produces FALSE POSITIVES on Polish
// institutional and place names containing diacritics (e.g., "Szef Urzędu",
// "Śląski Ośrodek", "Wyrok Wojewódzkiego Sądu"). For Phase 1 backfill
// (legal_knowledge only, no names), this is safe. BEFORE enabling Phase 1.5
// backfill on rejection_analyses, REPLACE this with one of:
//   (a) honorific-only matching (require "Pan/Pani/Panu/Pana" prefix)
//   (b) lightweight NER library (spaCy Polish model)
//   (c) name-context markers ("urodzony/a", "obywatel/ce", "Panu/i")
// Test with real rejection letter text before enabling.
const POLISH_NAME_WITH_DIACRITIC_RX =
  /\b(?:[A-ZŁŚŻŹĆŃÓĄĘ][a-złśżźćńóąę]+\s[A-ZŁŚŻŹĆŃÓĄĘ][a-złśżźćńóąę]*[łśżźćńóąę][a-złśżźćńóąę]*|[A-ZŁŚŻŹĆŃÓĄĘ][a-złśżźćńóąę]*[łśżźćńóąę][a-złśżźćńóąę]*\s[A-ZŁŚŻŹĆŃÓĄĘ][a-złśżźćńóąę]+)\b/g;
const HONORIFIC_NAME_RX =
  /\b(?:Pan|Pani|Panu|Pana|Pani\b)\s+[A-ZŁŚŻŹĆŃÓĄĘ][a-złśżźćńóąę]+(?:\s+[A-ZŁŚŻŹĆŃÓĄĘ][a-złśżźćńóąę]+)+\b/g;

export function anonymizeForEmbedding(input: string): AnonymizeResult {
  const replacements: Record<ReplacementClass, number> = {
    PESEL: 0, IBAN: 0, PASSPORT: 0, WORKER_NAME: 0,
  };

  let text = input;

  text = text.replace(IBAN_PL_RX, () => { replacements.IBAN++; return "[IBAN]"; });
  text = text.replace(PESEL_RX, () => { replacements.PESEL++; return "[PESEL]"; });
  text = text.replace(PASSPORT_RX, () => { replacements.PASSPORT++; return "[PASSPORT]"; });

  // Honorific + name comes first so "Pan Jan Kowalski" collapses to a
  // single [WORKER_NAME] rather than "Pan [WORKER_NAME]" with a stray honorific.
  text = text.replace(HONORIFIC_NAME_RX, () => { replacements.WORKER_NAME++; return "[WORKER_NAME]"; });
  text = text.replace(POLISH_NAME_WITH_DIACRITIC_RX, () => { replacements.WORKER_NAME++; return "[WORKER_NAME]"; });

  return { anonymized: text, replacements };
}
