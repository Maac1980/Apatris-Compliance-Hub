import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  extractStructuredDocumentData,
  typedToLegacyExtractedFields,
} from "./document-intelligence.service.js";
import type { TypedIntakeExtraction } from "../lib/document-schemas.js";

const EMPTY_COMMON = {
  fullName: null, pesel: null, dateOfBirth: null, nationality: null,
  authority: null, documentDate: null, language: null,
} as const;

function baseTyped(overrides: Partial<TypedIntakeExtraction> = {}): TypedIntakeExtraction {
  return {
    classification: "OTHER",
    commonFields: { ...EMPTY_COMMON },
    workPermit: null, trcDecision: null, trcRejection: null, filingProof: null, passport: null,
    perFieldConfidence: {},
    overallConfidence: 0,
    keyContent: "",
    ...overrides,
  };
}

function mockExtractWithAIResponse(typed: TypedIntakeExtraction): Response {
  // Shape matches Anthropic tool_use response that extractWithAI parses via callClaudeWithSchema.
  return new Response(JSON.stringify({
    content: [{ type: "tool_use", name: "emit_document_extraction", input: typed }],
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
});

// ── Direct translator tests (pure, fast) ────────────────────────────────

describe("typedToLegacyExtractedFields — B1 typed → legacy flat", () => {
  it("WORK_PERMIT: maps all 12 FIELD_DEFS keys with correct confidences", () => {
    const typed = baseTyped({
      classification: "WORK_PERMIT",
      commonFields: { ...EMPTY_COMMON, fullName: "Mithilesh KUMAR", nationality: "Indian" },
      workPermit: {
        permitType: "Typ A", employerName: "Apatris Sp. z o.o.", employerNip: "5252828706",
        role: "Spawacz TIG", voivodeship: "mazowieckie",
        validFrom: "2026-01-01", validUntil: "2028-12-31", workHoursPerWeek: 40,
      },
      perFieldConfidence: {
        "commonFields.fullName": 0.98,
        "workPermit.employerName": 0.95,
        "workPermit.employerNip": 0.92,
      },
      overallConfidence: 0.93,
    });
    const f = typedToLegacyExtractedFields(typed, "WORK_PERMIT");

    // All 12 keys present (FIELD_DEFS.WORK_PERMIT)
    expect(Object.keys(f)).toEqual([
      "full_name", "passport_number", "nationality",
      "employer_name", "employer_nip",
      "permit_number", "permit_type", "issue_date", "expiry_date",
      "work_position", "voivodeship", "conditions",
    ]);

    // Populated fields carry per-field confidence
    expect(f.full_name).toEqual({ value: "Mithilesh KUMAR", confidence: 0.98, source: "ai" });
    expect(f.employer_name).toEqual({ value: "Apatris Sp. z o.o.", confidence: 0.95, source: "ai" });
    expect(f.employer_nip).toEqual({ value: "5252828706", confidence: 0.92, source: "ai" });
    expect(f.issue_date).toEqual({ value: "2026-01-01", confidence: 0.8, source: "ai" });   // default 0.8
    expect(f.work_position.value).toBe("Spawacz TIG");

    // B1 schema gaps → null/0
    expect(f.passport_number).toEqual({ value: null, confidence: 0, source: "ai" });
    expect(f.permit_number).toEqual({ value: null, confidence: 0, source: "ai" });
    expect(f.conditions).toEqual({ value: null, confidence: 0, source: "ai" });
  });

  it("DECISION_LETTER via TRC_POSITIVE: decision_outcome='positive', no appeal_deadline", () => {
    const typed = baseTyped({
      classification: "TRC_POSITIVE",
      commonFields: { ...EMPTY_COMMON, fullName: "Anna KOWALCZYK", authority: "Wojewoda Mazowiecki" },
      trcDecision: {
        caseReference: "WSC-II-S.6151.111539.2025",
        decisionDate: "2026-03-15",
        validUntil: "2029-03-14",
        voivodeship: "mazowieckie",
        permitType: "TRC",
      },
      overallConfidence: 0.9,
    });
    const f = typedToLegacyExtractedFields(typed, "DECISION_LETTER");

    expect(f.case_reference.value).toBe("WSC-II-S.6151.111539.2025");
    expect(f.decision_date.value).toBe("2026-03-15");
    expect(f.decision_type.value).toBe("Decyzja o udzieleniu zezwolenia");
    expect(f.issuing_authority.value).toBe("Wojewoda Mazowiecki");
    expect(f.decision_outcome.value).toBe("positive");
    expect(f.appeal_deadline.value).toBeNull();     // no appeal on positive
    expect(f.legal_basis.value).toBeNull();          // no cited articles on positive
  });

  it("DECISION_LETTER via TRC_REJECTION: decision_outcome='negative', appeal_deadline computed", () => {
    const typed = baseTyped({
      classification: "TRC_REJECTION",
      commonFields: { ...EMPTY_COMMON, fullName: "Monica ASTHANA", authority: "Wojewoda Mazowiecki" },
      trcRejection: {
        caseReference: "WSC-II-S.6151.77212.2025",
        decisionDate: "2026-02-20",
        voivodeship: "mazowieckie",
        rejectionGrounds: "Employer did not sign Annex 1 within 30 days.",
        citedArticles: ["Art. 108 Ustawy o cudzoziemcach", "Art. 127 KPA"],
        appealDeadlineDays: 14,
      },
      overallConfidence: 0.88,
    });
    const f = typedToLegacyExtractedFields(typed, "DECISION_LETTER");

    expect(f.case_reference.value).toBe("WSC-II-S.6151.77212.2025");
    expect(f.decision_date.value).toBe("2026-02-20");
    expect(f.decision_type.value).toBe("Decyzja o odmowie");
    expect(f.decision_outcome.value).toBe("negative");
    expect(f.legal_basis.value).toBe("Art. 108 Ustawy o cudzoziemcach; Art. 127 KPA");
    // 2026-02-20 + 14 days = 2026-03-06
    expect(f.appeal_deadline.value).toBe("2026-03-06");
  });

  it("PASSPORT: passport_number + issuing_country populate from passport sub-object", () => {
    const typed = baseTyped({
      classification: "PASSPORT",
      commonFields: {
        ...EMPTY_COMMON, fullName: "Ivan PETROV",
        dateOfBirth: "1990-05-15", nationality: "Ukraine",
      },
      passport: {
        passportNumber: "FH1234567", issueDate: "2022-06-01",
        expiryDate: "2032-05-31", issuingCountry: "Ukraine",
      },
      overallConfidence: 0.95,
    });
    const f = typedToLegacyExtractedFields(typed, "PASSPORT");

    expect(f.passport_number.value).toBe("FH1234567");
    expect(f.issuing_country.value).toBe("Ukraine");
    expect(f.date_of_birth.value).toBe("1990-05-15");
    expect(f.expiry_date.value).toBe("2032-05-31");
    expect(f.sex.value).toBeNull();                  // not in B1 schema
  });

  it("UPO via FILING_PROOF: filing_date + upo_number populate from filingProof", () => {
    const typed = baseTyped({
      classification: "FILING_PROOF",
      commonFields: { ...EMPTY_COMMON, fullName: "Paweł NOWAK", authority: "Szef UdSC" },
      filingProof: {
        caseReference: "UPO-2026-0042", filingDate: "2026-04-10",
        submissionNumber: "MOS-889901", isUpo: true,
      },
      overallConfidence: 0.95,
    });
    const f = typedToLegacyExtractedFields(typed, "UPO");

    expect(f.case_reference.value).toBe("UPO-2026-0042");
    expect(f.filing_date.value).toBe("2026-04-10");
    expect(f.filing_office.value).toBe("Szef UdSC");
    expect(f.upo_number.value).toBe("MOS-889901");
    expect(f.confirmation_date.value).toBe("2026-04-10");
    expect(f.application_type.value).toBeNull();     // not in B1 schema
  });

  it("UNKNOWN (via OTHER classification): minimal mapping; only full_name populated", () => {
    const typed = baseTyped({
      classification: "OTHER",
      commonFields: { ...EMPTY_COMMON, fullName: "Jane DOE", documentDate: "2026-04-24" },
      overallConfidence: 0.5,
    });
    const f = typedToLegacyExtractedFields(typed, "UNKNOWN");

    expect(f.full_name.value).toBe("Jane DOE");
    expect(f.document_date.value).toBe("2026-04-24");
    expect(f.reference_number.value).toBeNull();
    expect(f.raw_text.value).toBeNull();
  });
});

// ── End-to-end integration (mocks fetch at the extractWithAI layer) ─────

describe("extractStructuredDocumentData — legacy shape preserved end-to-end", () => {
  it("WORK_PERMIT PDF → legacy response with all FIELD_DEFS keys + new additive fields", async () => {
    const typed = baseTyped({
      classification: "WORK_PERMIT",
      commonFields: { ...EMPTY_COMMON, fullName: "Mithilesh KUMAR", nationality: "Indian" },
      workPermit: {
        permitType: "Typ A", employerName: "Apatris Sp. z o.o.", employerNip: "5252828706",
        role: "Spawacz TIG", voivodeship: "mazowieckie",
        validFrom: "2026-01-01", validUntil: "2028-12-31", workHoursPerWeek: 40,
      },
      perFieldConfidence: {
        "commonFields.fullName": 0.98,
        "workPermit.employerName": 0.95,
        "workPermit.employerNip": 0.92,
        "workPermit.validUntil": 0.97,
        "workPermit.role": 0.93,
        "workPermit.voivodeship": 0.94,
      },
      overallConfidence: 0.95,
      keyContent: "Work permit for Mithilesh at Apatris, valid through 2028.",
    });

    // extractWithAI mock (tool_use response)
    const extractFetch = vi.fn().mockResolvedValueOnce(mockExtractWithAIResponse(typed));
    // maybeEnrichEmployer will call Biała Lista — mock that response too
    const bialaFetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
      result: {
        subject: {
          name: "APATRIS SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ",
          nip: "5252828706", regon: "386546470", krs: "0000849614",
          workingAddress: "CHŁODNA 51, 00-867 WARSZAWA", residenceAddress: null,
          statusVat: "Czynny", accountNumbers: ["14109..."], registrationLegalDate: "2020-10-31",
        },
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const fetchMock = vi.fn()
      .mockImplementationOnce(extractFetch)
      .mockImplementationOnce(bialaFetch);
    vi.stubGlobal("fetch", fetchMock);

    const r = await extractStructuredDocumentData({
      fileName: "mithilesh_zezwolenie.pdf",
      rawContent: Buffer.from("fake-pdf").toString("base64"),
      mimeType: "application/pdf",
    });

    // Legacy shape preserved
    expect(r.document_type).toBe("WORK_PERMIT");
    expect(r.extracted_fields.full_name.value).toBe("Mithilesh KUMAR");
    expect(r.extracted_fields.employer_name.value).toBe("Apatris Sp. z o.o.");
    expect(r.extracted_fields.employer_nip.value).toBe("5252828706");
    expect(r.extracted_fields.expiry_date.value).toBe("2028-12-31");
    expect(r.overall_confidence).toBeGreaterThanOrEqual(0.9);
    // requires_review is true because passport_number + permit_number are required
    // in legacy FIELD_DEFS.WORK_PERMIT but not captured in the B1 schema. That is
    // the correct signal: lawyer must manually fill them during the approve step.
    expect(r.requires_review).toBe(true);
    expect(r.missing_fields).toEqual(expect.arrayContaining(["passport_number", "permit_number"]));
    expect(r.extraction_timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // New additive fields
    expect(r.classification).toBe("WORK_PERMIT");
    expect(r.typeSpecific?.workPermit?.employerNip).toBe("5252828706");
    expect(r.typeScopedConfidence).toBe(r.overall_confidence);
    expect(r.keyContent).toMatch(/Apatris/);

    // B3 enrichment populated
    expect(r.enrichment?.employer?.data?.statusVat).toBe("Czynny");
    expect(r.enrichment?.employer?.data?.regon).toBe("386546470");
  });

  it("missing_fields: required keys with null value are surfaced", async () => {
    const typed = baseTyped({
      classification: "WORK_PERMIT",
      commonFields: { ...EMPTY_COMMON, fullName: "Partial Worker" },
      workPermit: {
        permitType: null, employerName: null, employerNip: null,   // key required gaps
        role: null, voivodeship: null,
        validFrom: null, validUntil: null, workHoursPerWeek: null,
      },
      overallConfidence: 0.4,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(mockExtractWithAIResponse(typed)));

    const r = await extractStructuredDocumentData({
      fileName: "blank.pdf",
      rawContent: Buffer.from("x").toString("base64"),
      mimeType: "application/pdf",
    });

    expect(r.missing_fields).toEqual(expect.arrayContaining([
      "passport_number", "nationality", "employer_name", "employer_nip",
      "permit_number", "permit_type", "issue_date", "expiry_date",
      "work_position", "voivodeship",
    ]));
    expect(r.requires_review).toBe(true);             // conf 0.4 < 0.7
  });

  it("No rawContent → empty result with classification='OTHER' and requires_review=true", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const r = await extractStructuredDocumentData({ fileName: "somefile.pdf" });

    expect(r.document_type).toBe("UNKNOWN");           // detectDocumentType fallback
    expect(r.overall_confidence).toBe(0);
    expect(r.requires_review).toBe(true);
    expect(r.classification).toBe("OTHER");
    expect(r.typeSpecific).toBeNull();
    expect(r.keyContent).toMatch(/requires file upload/i);
    expect(fetchSpy).not.toHaveBeenCalled();           // no Claude call without file
  });
});
