import { describe, it, expect } from "vitest";
import {
  getApatrisSystemPrompt,
  type ApatrisAudience,
  type ApatrisLanguage,
  type ApatrisTone,
} from "./apatris-identity.js";

// The 7 safety-rule literal substrings every compiled prompt must contain.
const SAFETY_PHRASES = [
  "Do NOT invent",
  "Legal Snapshot",
  "Never guarantee",
  "PROJEKT",
  "DRAFT",
  "uncertain",
  "lawyer review",
] as const;

const AUDIENCES: ApatrisAudience[] = [
  "lawyer", "worker", "validator", "translator", "auditor", "classifier",
];
const LANGUAGES: ApatrisLanguage[] = ["pl", "en", "bilingual"];
const TONES: ApatrisTone[] = [
  "neutral", "formal-legal", "reassuring", "calm", "moderate", "careful",
];

describe("apatris-identity — getApatrisSystemPrompt", () => {
  it("always includes Apatris identity line for every audience", () => {
    for (const a of AUDIENCES) {
      const p = getApatrisSystemPrompt({ audience: a });
      expect(p, `missing identity line for audience=${a}`).toContain("You are Apatris");
    }
  });

  it("always includes every safety phrase across all (audience × language × tone) combinations", () => {
    for (const a of AUDIENCES) {
      for (const l of LANGUAGES) {
        for (const t of TONES) {
          const p = getApatrisSystemPrompt({ audience: a, language: l, tone: t });
          for (const phrase of SAFETY_PHRASES) {
            expect(
              p,
              `missing "${phrase}" for audience=${a} language=${l} tone=${t}`,
            ).toContain(phrase);
          }
        }
      }
    }
  });

  it("produces distinct audience directives for each of the 6 audiences", () => {
    const results = AUDIENCES.map((a) => getApatrisSystemPrompt({ audience: a }));
    expect(new Set(results).size).toBe(AUDIENCES.length);

    // Spot-check each audience contains its distinctive phrase.
    expect(results[0]).toContain("Polish immigration lawyer reviewing"); // lawyer
    expect(results[1]).toContain("first name");                          // worker
    expect(results[2]).toContain("validation pass");                     // validator
    expect(results[3]).toContain("translation layer");                   // translator
    expect(results[4]).toContain("compliance / audit review");           // auditor
    expect(results[5]).toContain("triage / classification layer");       // classifier
  });

  it("produces the correct language line for each of pl / en / bilingual", () => {
    expect(getApatrisSystemPrompt({ audience: "lawyer", language: "pl" }))
      .toContain("Pan/Pani");
    expect(getApatrisSystemPrompt({ audience: "lawyer", language: "en" }))
      .toContain("Commonwealth legal style");
    expect(getApatrisSystemPrompt({ audience: "lawyer", language: "bilingual" }))
      .toContain("Polish (authoritative)");
  });

  it("emits TONE directive for non-neutral tones; omits it for neutral", () => {
    const neutral = getApatrisSystemPrompt({ audience: "lawyer", tone: "neutral" });
    expect(neutral).not.toContain("TONE —");

    expect(getApatrisSystemPrompt({ audience: "lawyer", tone: "formal-legal" }))
      .toContain("TONE — formal legal register");
    expect(getApatrisSystemPrompt({ audience: "worker", tone: "reassuring" }))
      .toContain("TONE — reassuring");
    expect(getApatrisSystemPrompt({ audience: "worker", tone: "calm" }))
      .toContain("TONE — calm");
    expect(getApatrisSystemPrompt({ audience: "worker", tone: "moderate" }))
      .toContain("TONE — moderate");
    expect(getApatrisSystemPrompt({ audience: "worker", tone: "careful" }))
      .toContain("TONE — careful");
  });

  it("appends serviceContext verbatim under a SERVICE CONTEXT: marker when provided", () => {
    const context = "TASK: analyse case X. Produce fields A, B, C. Cite only provided articles.";
    const p = getApatrisSystemPrompt({ audience: "lawyer", serviceContext: context });
    expect(p).toContain("SERVICE CONTEXT:");
    expect(p).toContain(context);
  });

  it("omits the SERVICE CONTEXT block when serviceContext is missing, empty, or whitespace-only", () => {
    expect(getApatrisSystemPrompt({ audience: "lawyer" }))
      .not.toContain("SERVICE CONTEXT:");
    expect(getApatrisSystemPrompt({ audience: "lawyer", serviceContext: "" }))
      .not.toContain("SERVICE CONTEXT:");
    expect(getApatrisSystemPrompt({ audience: "lawyer", serviceContext: "   \n  " }))
      .not.toContain("SERVICE CONTEXT:");
  });

  it("includes Domain Context by default; skips it when includeDomainContext is false; Safety persists either way", () => {
    const defaultP = getApatrisSystemPrompt({ audience: "lawyer" });
    expect(defaultP).toContain("DOMAIN —");
    expect(defaultP).toContain("Ustawa o cudzoziemcach");

    const skipped = getApatrisSystemPrompt({ audience: "lawyer", includeDomainContext: false });
    expect(skipped).not.toContain("DOMAIN —");
    expect(skipped).not.toContain("Ustawa o cudzoziemcach");

    // Safety layer must still be present when domain is skipped.
    for (const phrase of SAFETY_PHRASES) {
      expect(skipped).toContain(phrase);
    }
  });
});
