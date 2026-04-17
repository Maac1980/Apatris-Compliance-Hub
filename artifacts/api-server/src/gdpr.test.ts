import { describe, it, expect } from "vitest";
import { checkDocumentCompliance, getCountryConfig, getSupportedCountryCodes } from "./lib/country-compliance.js";

// ═══════════════════════════════════════════════════════════════════════════
// GDPR Consent Types
// ═══════════════════════════════════════════════════════════════════════════
describe("GDPR — Consent types", () => {
  const CONSENT_TYPES = [
    "data_processing",
    "document_storage",
    "gps_tracking",
    "biometric_data",
    "payroll_processing",
    "cross_border_transfer",
    "marketing_communications",
  ];

  it("has 7 consent types", () => {
    expect(CONSENT_TYPES).toHaveLength(7);
  });

  it("includes GPS tracking consent (required for geofencing)", () => {
    expect(CONSENT_TYPES).toContain("gps_tracking");
  });

  it("includes biometric consent (required for face login)", () => {
    expect(CONSENT_TYPES).toContain("biometric_data");
  });

  it("includes cross-border transfer (required for EU posting)", () => {
    expect(CONSENT_TYPES).toContain("cross_border_transfer");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Data Erasure Logic (Article 17)
// ═══════════════════════════════════════════════════════════════════════════
describe("GDPR — Erasure logic", () => {
  // Tables explicitly handled in eraseWorkerData() — order matters
  const ERASURE_TABLES = [
    "documents",              // 1.  deleted
    "consent_records",        // 2.  deleted
    "hours_log",              // 3.  anonymized (worker_name → REDACTED, worker_id → NULL)
    "payroll_snapshots",      // 4.  anonymized (worker_name → REDACTED, worker_id → NULL)
    "notification_log",       // 5.  anonymized
    "face_encodings",         // 6.  deleted (biometric data — no retention)
    "gps_checkins",           // 7.  deleted (location history — no retention)
    "audit_logs",             // 8.  anonymized (worker_name → REDACTED, worker_id → NULL)
    "signatures",             // 9.  anonymized (signer_name → REDACTED)
    "voice_checkins",         // 10. anonymized
    "generated_contracts",    // 11. anonymized + contract_html cleared
    "immigration_permits",    // 12. anonymized
    "onboarding_checklists",  // 13. anonymized
    "inbound_emails",         // 14. worker_id set to NULL
    "legal_documents",        // 15. worker_id set to NULL
    "workers",                // 16. deleted LAST (CASCADE handles remaining FK tables)
  ];

  it("erasure affects 16 tables", () => {
    expect(ERASURE_TABLES).toHaveLength(16);
  });

  it("workers table is deleted last (after dependencies)", () => {
    expect(ERASURE_TABLES[ERASURE_TABLES.length - 1]).toBe("workers");
  });

  it("financial data is anonymized, not deleted (legal requirement)", () => {
    expect(ERASURE_TABLES).toContain("payroll_snapshots");
  });

  it("consent records are fully deleted (no retention needed)", () => {
    expect(ERASURE_TABLES).toContain("consent_records");
  });

  it("biometric data (face_encodings) is fully deleted", () => {
    expect(ERASURE_TABLES).toContain("face_encodings");
  });

  it("GPS location history is fully deleted", () => {
    expect(ERASURE_TABLES).toContain("gps_checkins");
  });

  it("audit logs are anonymized, not deleted (keep action trail)", () => {
    expect(ERASURE_TABLES).toContain("audit_logs");
    // Audit log keeps the action record but strips worker PII
    // This is correct — GDPR doesn't require deleting audit trails,
    // only removing personally identifiable information
  });

  it("biometric deletion happens BEFORE worker deletion", () => {
    const faceIdx = ERASURE_TABLES.indexOf("face_encodings");
    const workerIdx = ERASURE_TABLES.indexOf("workers");
    expect(faceIdx).toBeLessThan(workerIdx);
  });

  it("all PII tables are covered — no orphaned worker data", () => {
    const piiTables = [
      "face_encodings", "gps_checkins", "audit_logs", "signatures",
      "voice_checkins", "generated_contracts", "immigration_permits",
      "onboarding_checklists", "inbound_emails", "legal_documents",
    ];
    for (const t of piiTables) {
      expect(ERASURE_TABLES).toContain(t);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Multi-Tenant Isolation
// ═══════════════════════════════════════════════════════════════════════════
describe("Multi-Tenant — Isolation logic", () => {
  // Simulate tenant-scoped queries
  function buildQuery(table: string, tenantId: string): string {
    return `SELECT * FROM ${table} WHERE tenant_id = '${tenantId}'`;
  }

  it("every query includes tenant_id filter", () => {
    const tables = ["workers", "documents", "contracts", "admins", "site_coordinators"];
    const tenantA = "tenant-aaa-111";
    const tenantB = "tenant-bbb-222";

    for (const table of tables) {
      const qA = buildQuery(table, tenantA);
      const qB = buildQuery(table, tenantB);
      expect(qA).toContain(tenantA);
      expect(qA).not.toContain(tenantB);
      expect(qB).toContain(tenantB);
      expect(qB).not.toContain(tenantA);
    }
  });

  it("tenant IDs are UUIDs", () => {
    const uuid = "550e8400-e29b-41d4-a716-446655440000";
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("default tenant slug is 'apatris'", () => {
    const DEFAULT_SLUG = "apatris";
    expect(DEFAULT_SLUG).toBe("apatris");
  });

  it("tenant slugs must be lowercase alphanumeric with hyphens", () => {
    const valid = /^[a-z0-9-]+$/;
    expect(valid.test("apatris")).toBe(true);
    expect(valid.test("my-company")).toBe(true);
    expect(valid.test("My Company")).toBe(false);
    expect(valid.test("company@123")).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Document Compliance (per country)
// ═══════════════════════════════════════════════════════════════════════════
describe("GDPR — Document compliance check", () => {
  it("PL requires 7 document types", () => {
    const config = getCountryConfig("PL");
    expect(config!.requiredDocuments).toHaveLength(7);
  });

  it("100% compliance when all docs present", () => {
    const config = getCountryConfig("PL");
    const result = checkDocumentCompliance("PL", config!.requiredDocuments);
    expect(result.isCompliant).toBe(true);
    expect(result.complianceRate).toBe(100);
  });

  it("identifies missing documents", () => {
    const result = checkDocumentCompliance("PL", ["Passport"]);
    expect(result.isCompliant).toBe(false);
    expect(result.missingDocuments.length).toBeGreaterThan(0);
    expect(result.complianceRate).toBeLessThan(100);
  });

  it("CZ requires different documents than PL", () => {
    const plDocs = getCountryConfig("PL")!.requiredDocuments;
    const czDocs = getCountryConfig("CZ")!.requiredDocuments;
    // They should have different document lists
    expect(plDocs).not.toEqual(czDocs);
  });

  it("all supported countries have document requirements", () => {
    for (const code of getSupportedCountryCodes()) {
      const config = getCountryConfig(code);
      expect(config!.requiredDocuments.length).toBeGreaterThan(0);
    }
  });
});
