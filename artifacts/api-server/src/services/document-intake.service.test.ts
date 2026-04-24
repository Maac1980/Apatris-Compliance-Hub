import { describe, it, expect, vi, beforeEach } from "vitest";
import { extractWithAI, flattenTypedExtraction, maybeEnrichEmployer } from "./document-intake.service.js";
import type { TypedIntakeExtraction } from "../lib/document-schemas.js";

// Mock fetch response helper that returns a tool_use block matching the
// emit_document_extraction schema from lib/document-schemas.ts.
function mockToolUseResponse(input: TypedIntakeExtraction): Response {
  return new Response(
    JSON.stringify({
      content: [
        { type: "tool_use", name: "emit_document_extraction", input },
      ],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

const EMPTY_COMMON = {
  fullName: null, pesel: null, dateOfBirth: null, nationality: null,
  authority: null, documentDate: null, language: null,
} as const;

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
});

// ── Per-type extraction tests — verify Claude's schema response is
//    parsed and flattened correctly onto the legacy shape.

describe("extractWithAI + flattenTypedExtraction — discriminated union schema", () => {
  it("WORK_PERMIT: populates identity.fullName, credentials.employer, credentials.role", async () => {
    const typed: TypedIntakeExtraction = {
      classification: "WORK_PERMIT",
      commonFields: {
        ...EMPTY_COMMON,
        fullName: "Mithilesh KUMAR",
        authority: "Wojewoda Mazowiecki",
        language: "pl",
      },
      workPermit: {
        permitType: "Typ A",
        employerName: "Apatris Sp. z o.o.",
        employerNip: "5252828706",
        role: "Spawacz TIG",
        voivodeship: "mazowieckie",
        validFrom: "2026-01-01",
        validUntil: "2028-12-31",
        workHoursPerWeek: 40,
      },
      trcDecision: null, trcRejection: null, filingProof: null, passport: null,
      perFieldConfidence: {
        "commonFields.fullName": 0.98,
        "workPermit.employerName": 0.95,
        "workPermit.employerNip": 0.88,
        "workPermit.role": 0.92,
      },
      overallConfidence: 0.92,
      keyContent: "Type A work permit for Mithilesh Kumar as TIG welder at Apatris, valid through 2028.",
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockToolUseResponse(typed)));

    const r = await extractWithAI(Buffer.from("fake-pdf"), "application/pdf");

    // Backward-compat flat fields populated from typed sub-object:
    expect(r.classification).toBe("WORK_PERMIT");
    expect(r.identity.fullName).toBe("Mithilesh KUMAR");
    expect(r.credentials.employer).toBe("Apatris Sp. z o.o.");
    expect(r.credentials.role).toBe("Spawacz TIG");
    expect(r.credentials.issueDate).toBe("2026-01-01");
    expect(r.credentials.expiryDate).toBe("2028-12-31");
    expect(r.credentials.authority).toBe("Wojewoda Mazowiecki");
    expect(r.confidence).toBe("HIGH");
    expect(r.language).toBe("pl");
    // New typed field attached for B2+:
    expect(r.typeSpecific?.classification).toBe("WORK_PERMIT");
    expect(r.typeSpecific?.workPermit?.employerNip).toBe("5252828706");
    // B2 end-to-end: typeScopedConfidence computed over the 5 required WORK_PERMIT fields.
    // 4 fields had scores (0.98, 0.95, 0.92 + default 0.8 for validUntil + default 0.8 for voivodeship via missing confidence)
    // All 5 required fields are populated → score ≥ 0.8.
    expect(r.typeScopedConfidence).toBeGreaterThanOrEqual(0.8);
    expect(r.typeScopedConfidence).toBeLessThanOrEqual(1);
  });

  it("TRC_POSITIVE: maps to legacy DECISION_LETTER and populates credentials.decisionDate", async () => {
    const typed: TypedIntakeExtraction = {
      classification: "TRC_POSITIVE",
      commonFields: {
        ...EMPTY_COMMON,
        fullName: "Anna KOWALCZYK",
        authority: "Wojewoda Mazowiecki",
        documentDate: "2026-03-15",
        language: "pl",
      },
      workPermit: null,
      trcDecision: {
        caseReference: "WSC-II-S.6151.111539.2025",
        decisionDate: "2026-03-15",
        validUntil: "2029-03-14",
        voivodeship: "mazowieckie",
        permitType: "TRC",
      },
      trcRejection: null, filingProof: null, passport: null,
      perFieldConfidence: { "trcDecision.caseReference": 0.97 },
      overallConfidence: 0.89,
      keyContent: "Favourable TRC decision for Anna Kowalczyk, valid until March 2029.",
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockToolUseResponse(typed)));

    const r = await extractWithAI(Buffer.from("x"), "application/pdf");

    expect(r.classification).toBe("DECISION_LETTER");
    expect(r.credentials.caseReference).toBe("WSC-II-S.6151.111539.2025");
    expect(r.credentials.decisionDate).toBe("2026-03-15");
    expect(r.credentials.expiryDate).toBe("2029-03-14");
    expect(r.rejectionReasons).toBeNull();
    expect(r.typeSpecific?.trcDecision?.permitType).toBe("TRC");
  });

  it("TRC_REJECTION: maps to legacy REJECTION_LETTER and surfaces rejectionReasons", async () => {
    const typed: TypedIntakeExtraction = {
      classification: "TRC_REJECTION",
      commonFields: {
        ...EMPTY_COMMON,
        fullName: "Monica ASTHANA",
        authority: "Wojewoda Mazowiecki",
        language: "pl",
      },
      workPermit: null, trcDecision: null,
      trcRejection: {
        caseReference: "WSC-II-S.6151.77212.2025",
        decisionDate: "2026-02-20",
        voivodeship: "mazowieckie",
        rejectionGrounds: "Employer did not sign Annex 1 digitally within 30 days; Art. 108 protection not activated.",
        citedArticles: ["Art. 108 Ustawy o cudzoziemcach", "Art. 127 KPA"],
        appealDeadlineDays: 14,
      },
      filingProof: null, passport: null,
      perFieldConfidence: { "trcRejection.rejectionGrounds": 0.91 },
      overallConfidence: 0.87,
      keyContent: "TRC rejection for Monica Asthana due to missing employer digital signature.",
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockToolUseResponse(typed)));

    const r = await extractWithAI(Buffer.from("x"), "application/pdf");

    expect(r.classification).toBe("REJECTION_LETTER");
    expect(r.rejectionReasons).toMatch(/Annex 1/);
    expect(r.credentials.caseReference).toBe("WSC-II-S.6151.77212.2025");
    expect(r.credentials.decisionDate).toBe("2026-02-20");
    expect(r.typeSpecific?.trcRejection?.citedArticles).toContain("Art. 108 Ustawy o cudzoziemcach");
    expect(r.typeSpecific?.trcRejection?.appealDeadlineDays).toBe(14);
  });

  it("FILING_PROOF: populates credentials.filingDate from filingProof sub-object", async () => {
    const typed: TypedIntakeExtraction = {
      classification: "FILING_PROOF",
      commonFields: { ...EMPTY_COMMON, fullName: "Paweł NOWAK", authority: "Szef Urzędu ds. Cudzoziemców", language: "pl" },
      workPermit: null, trcDecision: null, trcRejection: null,
      filingProof: {
        caseReference: "UPO-2026-0042",
        filingDate: "2026-04-10",
        submissionNumber: "MOS-889901",
        isUpo: true,
      },
      passport: null,
      perFieldConfidence: { "filingProof.filingDate": 0.99 },
      overallConfidence: 0.95,
      keyContent: "UPO filing receipt confirming TRC submission on 2026-04-10.",
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockToolUseResponse(typed)));

    const r = await extractWithAI(Buffer.from("x"), "application/pdf");

    expect(r.classification).toBe("FILING_PROOF");
    expect(r.credentials.filingDate).toBe("2026-04-10");
    expect(r.credentials.caseReference).toBe("UPO-2026-0042");
    expect(r.credentials.documentNumber).toBe("MOS-889901");
    expect(r.typeSpecific?.filingProof?.isUpo).toBe(true);
  });

  it("PASSPORT: populates identity.passportNumber and identity.issuingCountry", async () => {
    const typed: TypedIntakeExtraction = {
      classification: "PASSPORT",
      commonFields: {
        ...EMPTY_COMMON,
        fullName: "Ivan PETROV",
        dateOfBirth: "1990-05-15",
        nationality: "Ukraine",
        language: "en",
      },
      workPermit: null, trcDecision: null, trcRejection: null, filingProof: null,
      passport: {
        passportNumber: "FH1234567",
        issueDate: "2022-06-01",
        expiryDate: "2032-05-31",
        issuingCountry: "Ukraine",
      },
      perFieldConfidence: { "passport.passportNumber": 0.99 },
      overallConfidence: 0.94,
      keyContent: "Ukrainian passport for Ivan Petrov, valid through May 2032.",
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockToolUseResponse(typed)));

    const r = await extractWithAI(Buffer.from("x"), "application/pdf");

    expect(r.classification).toBe("PASSPORT");
    expect(r.identity.passportNumber).toBe("FH1234567");
    expect(r.identity.issuingCountry).toBe("Ukraine");
    expect(r.identity.nationality).toBe("Ukraine");
    expect(r.credentials.documentNumber).toBe("FH1234567");
    expect(r.credentials.expiryDate).toBe("2032-05-31");
  });

  it("OTHER: maps to legacy UNKNOWN; no sub-object populated", async () => {
    const typed: TypedIntakeExtraction = {
      classification: "OTHER",
      commonFields: { ...EMPTY_COMMON, fullName: "Jane DOE", language: "en" },
      workPermit: null, trcDecision: null, trcRejection: null, filingProof: null, passport: null,
      perFieldConfidence: { "commonFields.fullName": 0.85 },
      overallConfidence: 0.4,
      keyContent: "Unrecognized document type; identity visible but no legal classification matched.",
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockToolUseResponse(typed)));

    const r = await extractWithAI(Buffer.from("x"), "application/pdf");

    expect(r.classification).toBe("UNKNOWN");
    expect(r.identity.fullName).toBe("Jane DOE");
    expect(r.confidence).toBe("LOW");                    // 0.4 < 0.5 bucket
    expect(r.typeSpecific?.classification).toBe("OTHER");
    expect(r.typeSpecific?.workPermit).toBeNull();
    expect(r.typeSpecific?.trcDecision).toBeNull();
  });

  // ── Failure paths — verify backward-compat fallback shape

  it("returns fallback when Claude API returns non-2xx status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response("rate limited", { status: 429 }),
    ));
    const r = await extractWithAI(Buffer.from("x"), "application/pdf");
    expect(r.classification).toBe("UNKNOWN");
    expect(r.confidence).toBe("LOW");
    expect(r.typeSpecific).toBeNull();
    expect(r.typeScopedConfidence).toBe(0);       // B2: fallback scores 0
  });

  it("returns fallback when Claude does not emit the required tool_use block", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ content: [{ type: "text", text: "Sorry, cannot analyze." }] }), {
        status: 200, headers: { "Content-Type": "application/json" },
      }),
    ));
    const r = await extractWithAI(Buffer.from("x"), "application/pdf");
    expect(r.classification).toBe("UNKNOWN");
    expect(r.typeSpecific).toBeNull();
  });

  it("returns fallback when ANTHROPIC_API_KEY is unset (no network call)", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const r = await extractWithAI(Buffer.from("x"), "application/pdf");
    expect(r.classification).toBe("UNKNOWN");
    expect(r.typeSpecific).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ── B3 employer enrichment dispatch ─────────────────────────────────────

function workPermitTyped(employerNip: string | null): TypedIntakeExtraction {
  return {
    classification: "WORK_PERMIT",
    commonFields: { ...EMPTY_COMMON, fullName: "Test Worker" },
    workPermit: {
      permitType: "Typ A", employerName: "Apatris Sp. z o.o.",
      employerNip,
      role: "Welder", voivodeship: "mazowieckie",
      validFrom: "2026-01-01", validUntil: "2028-12-31", workHoursPerWeek: 40,
    },
    trcDecision: null, trcRejection: null, filingProof: null, passport: null,
    perFieldConfidence: {},
    overallConfidence: 0.9,
    keyContent: "Work permit.",
  };
}

function bialaResponse(subject: Record<string, unknown> | null, status = 200): Response {
  const body = subject === null
    ? { result: { subject: null } }
    : { result: { subject } };
  return new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json" },
  });
}

describe("maybeEnrichEmployer — B3 enrichment dispatch", () => {
  it("populates enrichment.employer when typed.workPermit.employerNip is present and Biała Lista succeeds", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(bialaResponse({
      name: "APATRIS SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ",
      nip: "5252828706", regon: "386546470", krs: "0000849614",
      workingAddress: "CHŁODNA 51, 00-867 WARSZAWA", residenceAddress: null,
      statusVat: "Czynny", accountNumbers: ["14109..."], registrationLegalDate: "2020-10-31",
    })));

    const r = await maybeEnrichEmployer(workPermitTyped("5252828706"));

    expect(r).toBeDefined();
    expect(r!.employer).toBeDefined();
    expect(r!.employer!.source).toBe("biala_lista");
    expect(r!.employer!.error).toBeUndefined();
    expect(r!.employer!.data?.statusVat).toBe("Czynny");
    expect(r!.employer!.data?.regon).toBe("386546470");
  });

  it("returns undefined (enrichment field omitted from IntakeResult) when employerNip is null", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const r = await maybeEnrichEmployer(workPermitTyped(null));

    expect(r).toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns undefined when typed extraction has no workPermit sub-object (TRC type)", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const trcTyped: TypedIntakeExtraction = {
      classification: "TRC_REJECTION",
      commonFields: { ...EMPTY_COMMON, fullName: "Worker" },
      workPermit: null, trcDecision: null,
      trcRejection: {
        caseReference: "WSC-1", decisionDate: "2026-01-01",
        voivodeship: null, rejectionGrounds: "...", citedArticles: [], appealDeadlineDays: 14,
      },
      filingProof: null, passport: null,
      perFieldConfidence: {}, overallConfidence: 0.8, keyContent: "",
    };
    const r = await maybeEnrichEmployer(trcTyped);

    expect(r).toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns undefined when typed is null (extraction fallback path)", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    expect(await maybeEnrichEmployer(null)).toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("populates enrichment.employer.error when Biała Lista returns 5xx (fail open, NOT thrown)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response("Service Unavailable", { status: 503 }),
    ));

    const r = await maybeEnrichEmployer(workPermitTyped("5252828706"));

    expect(r).toBeDefined();
    expect(r!.employer).toBeDefined();
    expect(r!.employer!.data).toBeNull();
    expect(r!.employer!.error).toBe("biala_lista_503");
    // Critical: function did NOT throw — intake flow continues.
  });

  it("populates enrichment.employer with statusVat='Wykreślony' as a SUCCESS (lawyer must see this)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(bialaResponse({
      name: "BANKRUPT SP Z O O", nip: "1111111111", regon: null, krs: null,
      workingAddress: null, residenceAddress: null,
      statusVat: "Wykreślony", accountNumbers: [], registrationLegalDate: null,
    })));

    const r = await maybeEnrichEmployer(workPermitTyped("1111111111"));

    expect(r!.employer!.error).toBeUndefined();           // success path
    expect(r!.employer!.data!.statusVat).toBe("Wykreślony"); // surfaced, not swallowed
  });
});

// ── flattenTypedExtraction as a pure function (no network)

describe("flattenTypedExtraction — pure adapter", () => {
  it("handles empty commonFields gracefully", () => {
    const typed: TypedIntakeExtraction = {
      classification: "OTHER",
      commonFields: EMPTY_COMMON,
      workPermit: null, trcDecision: null, trcRejection: null, filingProof: null, passport: null,
      perFieldConfidence: {},
      overallConfidence: 0,
      keyContent: "",
    };
    const r = flattenTypedExtraction(typed);
    expect(r.classification).toBe("UNKNOWN");
    expect(r.identity.fullName).toBeNull();
    expect(r.confidence).toBe("LOW");
    expect(r.language).toBe("unknown");
  });
});
