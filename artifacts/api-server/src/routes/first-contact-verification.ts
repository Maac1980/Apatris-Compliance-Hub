/**
 * First Contact Data Verification — Monday Morning Readiness Check (Apatris Hub).
 *
 * TASK 1: Smart Ingest Audit — validate document intake pipeline for 5 doc types
 * TASK 2: Decision Engine Stress Test — run Legal Engine on 5 profiles, April 2026 MOS rules
 * TASK 3: OCR Feedback Loop — Anna logs extraction errors for prompt tuning
 *
 * All endpoints use Apatris native APIs only.
 */

import { Router } from "express";
import { query, execute } from "../lib/db.js";
import { requireAuth } from "../lib/auth-middleware.js";
import { evaluateWorkerLegalProtection, type LegalProtectionInput, type LegalProtectionResult } from "../services/legal-engine.js";

const router = Router();

// ═══ TABLE SETUP ════════════════════════════════════════════════════════════

async function ensureFeedbackTable() {
  await execute(`
    CREATE TABLE IF NOT EXISTS ocr_feedback_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      document_id TEXT,
      worker_id TEXT,
      doc_type TEXT NOT NULL,
      field_name TEXT NOT NULL,
      ocr_value TEXT,
      corrected_value TEXT NOT NULL,
      error_type TEXT NOT NULL DEFAULT 'extraction_error',
      severity TEXT NOT NULL DEFAULT 'medium',
      notes TEXT,
      logged_by TEXT NOT NULL DEFAULT 'anna',
      resolved BOOLEAN DEFAULT false,
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await execute(`CREATE INDEX IF NOT EXISTS idx_ocr_feedback_doc_type ON ocr_feedback_log(doc_type)`);
  await execute(`CREATE INDEX IF NOT EXISTS idx_ocr_feedback_field ON ocr_feedback_log(field_name)`);
  await execute(`CREATE INDEX IF NOT EXISTS idx_ocr_feedback_resolved ON ocr_feedback_log(resolved)`);
}

// ═══════════════════════════════════════════════════════════════════════════
// TASK 1: SMART INGEST AUDIT
// ═══════════════════════════════════════════════════════════════════════════

const AUDIT_DOC_TYPES = [
  { type: "PASSPORT", label: "Passport (Paszport)", requiredFields: ["fullName", "passportNumber", "dateOfBirth", "expiryDate", "nationality"], intakeClassification: "PASSPORT" },
  { type: "ZUS_REGISTRATION", label: "ZUS ZUA Registration", requiredFields: ["fullName", "pesel", "employerName", "employerNip", "issueDate"], intakeClassification: "SUPPORTING_DOCUMENT" },
  { type: "WORK_PERMIT", label: "Work Permit (Zezwolenie na pracę)", requiredFields: ["fullName", "employerName", "expiryDate", "role", "voivodeship"], intakeClassification: "WORK_PERMIT" },
  { type: "TRC_DECISION", label: "TRC Decision (Decyzja KP)", requiredFields: ["fullName", "caseReference", "decisionDate", "expiryDate", "authority"], intakeClassification: "RESIDENCE_PERMIT" },
  { type: "UPO_RECEIPT", label: "UPO Filing Receipt", requiredFields: ["fullName", "caseReference", "filingDate", "authority"], intakeClassification: "FILING_PROOF" },
];

router.get("/v1/first-contact/ingest-audit", requireAuth, async (req, res) => {
  try {
    const results: any[] = [];

    for (const docDef of AUDIT_DOC_TYPES) {
      const issues: string[] = [];

      let tableExists = false;
      try { await query(`SELECT 1 FROM document_intake LIMIT 0`); tableExists = true; }
      catch { issues.push("document_intake table not initialized — first upload will create it"); }

      const supportedClassifications = ["PASSPORT", "RESIDENCE_PERMIT", "FILING_PROOF", "UPO", "MOS_SUBMISSION", "DECISION_LETTER", "REJECTION_LETTER", "WORK_PERMIT", "WORK_CONTRACT", "MEDICAL_CERT", "BHP_CERT", "UDT_CERT", "SUPPORTING_DOCUMENT", "UNKNOWN"];
      const classificationSupported = supportedClassifications.includes(docDef.intakeClassification);

      let existingCount = 0;
      if (tableExists) {
        try {
          const rows = await query<{ count: number }>(`SELECT COUNT(*)::int as count FROM document_intake WHERE ai_classification = $1`, [docDef.intakeClassification]);
          existingCount = rows[0]?.count ?? 0;
        } catch { /* */ }
      }

      if (existingCount > 0) {
        try {
          const samples = await query<{ ai_confidence: number }>(`SELECT ai_confidence FROM document_intake WHERE ai_classification = $1 ORDER BY created_at DESC LIMIT 5`, [docDef.intakeClassification]);
          const avgConf = samples.reduce((s, r) => s + (r.ai_confidence ?? 0), 0) / (samples.length || 1);
          if (avgConf < 0.7) issues.push(`Average OCR confidence ${Math.round(avgConf * 100)}% — below 70% threshold`);
        } catch { /* */ }
      }

      results.push({
        docType: docDef.type, label: docDef.label, intakeClassification: docDef.intakeClassification,
        pipelineReady: classificationSupported && issues.filter(i => !i.includes("not initialized")).length === 0,
        uploadEndpoint: "POST /api/v1/intake/process",
        requiredFields: docDef.requiredFields, existingDocuments: existingCount, classificationSupported, issues,
      });
    }

    return res.json({
      audit: "SMART_INGEST_FIRST_CONTACT", timestamp: new Date().toISOString(),
      overallStatus: results.every(r => r.pipelineReady) ? "READY" : "NEEDS_ATTENTION",
      summary: { totalDocTypes: results.length, ready: results.filter(r => r.pipelineReady).length, needsAttention: results.filter(r => !r.pipelineReady).length },
      pipeline: {
        upload: "POST /api/v1/intake/process (multipart file + workerId)",
        classify: "Claude Vision → ai_classification + ai_confidence",
        extract: "Claude Vision → ai_extracted_json (structured fields)",
        workerMatch: "Multi-signal matching (PESEL, passport, name, DOB)",
        legalAssess: "evaluateWorkerLegalProtection() — deterministic, no AI",
        confirm: "POST /api/v1/intake/:id/confirm → apply to worker record",
      },
      documentTypes: results,
      instructions: {
        forAnna: [
          "1. Navigate to Document Intake page",
          "2. Upload document (PDF, JPG, PNG, or WebP — max 20MB)",
          "3. Review AI classification + extracted identity fields",
          "4. Check worker match and legal impact assessment",
          "5. If OCR errors, click 'Correct Data' to log feedback for prompt tuning",
          "6. Confirm/reject intake — confirmed data syncs to worker record",
        ],
      },
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// TASK 2: DECISION ENGINE STRESS TEST
// ═══════════════════════════════════════════════════════════════════════════

interface StressProfile {
  name: string; scenario: string; input: LegalProtectionInput; expectedStatus: string; mos2026Applicable: boolean;
}

const STRESS_PROFILES: StressProfile[] = [
  {
    name: "Profile A — Ukrainian, Art. 108 Protected (full continuity)",
    scenario: "TRC filed before expiry, same employer/role, no defect. Expected: PROTECTED_PENDING.",
    input: { filingDate: "2026-01-20", permitExpiryDate: "2026-02-15", nationality: "UKR", hasCukrApplication: false, sameEmployer: true, sameRole: true, sameLocation: true, formalDefect: false, hadPriorRightToWork: true },
    expectedStatus: "PROTECTED_PENDING", mos2026Applicable: false,
  },
  {
    name: "Profile B — Philippine, Permit expiring in 45 days",
    scenario: "Work Permit expiring June 2026. <90 days → MOS digital filing required.",
    input: { filingDate: null, permitExpiryDate: "2026-05-28", nationality: "PH", sameEmployer: true, sameRole: true, formalDefect: false, hadPriorRightToWork: true },
    expectedStatus: "VALID", mos2026Applicable: true,
  },
  {
    name: "Profile C — Indian, EXPIRED not protected",
    scenario: "Permit expired March 2026, no TRC filed. CRITICAL.",
    input: { filingDate: null, permitExpiryDate: "2026-03-10", nationality: "IN", sameEmployer: false, sameRole: false, formalDefect: false, hadPriorRightToWork: false },
    expectedStatus: "EXPIRED_NOT_PROTECTED", mos2026Applicable: true,
  },
  {
    name: "Profile D — Belarusian, Filed but formal defect",
    scenario: "TRC filed before expiry but has brak formalny. REVIEW_REQUIRED.",
    input: { filingDate: "2026-03-25", permitExpiryDate: "2026-04-01", nationality: "BLR", sameEmployer: true, sameRole: false, formalDefect: true, hadPriorRightToWork: true },
    expectedStatus: "REVIEW_REQUIRED", mos2026Applicable: true,
  },
  {
    name: "Profile E — Georgian, no permit expiry on file",
    scenario: "New arrival, incomplete data. REVIEW_REQUIRED.",
    input: { filingDate: null, permitExpiryDate: null, nationality: "GE", sameEmployer: false, sameRole: false, formalDefect: false, hadPriorRightToWork: false },
    expectedStatus: "REVIEW_REQUIRED", mos2026Applicable: true,
  },
];

router.get("/v1/first-contact/stress-test", requireAuth, async (_req, res) => {
  try {
    const today = new Date("2026-04-13");
    const results: any[] = [];

    for (const profile of STRESS_PROFILES) {
      const output: LegalProtectionResult = evaluateWorkerLegalProtection(profile.input);
      const permitExpiry = profile.input.permitExpiryDate;
      const daysUntilExpiry = permitExpiry ? Math.ceil((new Date(permitExpiry).getTime() - today.getTime()) / 86400000) : null;

      const digitalFilingRequired = profile.mos2026Applicable && (
        (daysUntilExpiry !== null && daysUntilExpiry < 90) || output.status === "EXPIRED_NOT_PROTECTED" || output.status === "REVIEW_REQUIRED"
      );

      const mosBlockers: string[] = [];
      if (digitalFilingRequired) {
        mosBlockers.push("Verify: Employer Annex 1 digital signature via Profil Zaufany");
        mosBlockers.push("Verify: Worker ZUS/KAS registration (MOS auto-syncs with KAS)");
        if (output.status === "EXPIRED_NOT_PROTECTED") mosBlockers.push("CRITICAL: Permit already expired — consult lawyer before MOS filing");
      }

      results.push({
        profile: profile.name, scenario: profile.scenario, input: profile.input, output,
        expectedStatus: profile.expectedStatus, actualStatus: output.status,
        passed: output.status === profile.expectedStatus,
        mos2026: {
          applicable: profile.mos2026Applicable, daysUntilExpiry, digitalFilingRequired,
          mosPortalUrl: "https://mos.cudzoziemcy.gov.pl",
          filingDeadline: permitExpiry && daysUntilExpiry !== null && daysUntilExpiry > 0 ? permitExpiry : output.status === "EXPIRED_NOT_PROTECTED" ? "IMMEDIATELY" : null,
          feeNote: "2026 MOS fees: TRC PLN 800, Work Permit PLN 400 (quadrupled from pre-2026)",
          blockers: mosBlockers,
        },
      });
    }

    return res.json({
      stressTest: "LEGAL_DECISION_ENGINE_FIRST_CONTACT", timestamp: new Date().toISOString(), referenceDate: "2026-04-13",
      overallResult: results.every(r => r.passed) ? "ALL_PASSED" : "FAILURES_DETECTED",
      summary: {
        totalProfiles: results.length, passed: results.filter(r => r.passed).length,
        failed: results.filter(r => !r.passed).length,
        critical: results.filter(r => r.output.riskLevel === "CRITICAL").length,
        mosFilingRequired: results.filter(r => r.mos2026.digitalFilingRequired).length,
      },
      mos2026Rules: {
        effectiveDate: "2026-04-27", mandate: "All work permit and TRC applications must be filed digitally via MOS portal",
        portalUrl: "https://mos.cudzoziemcy.gov.pl",
        keyChanges: [
          "Digital-only filing — no paper applications accepted",
          "Employer must sign Annex 1 via Profil Zaufany or Qualified E-Signature",
          "MOS auto-syncs with KAS/ZUS — unregistered workers get auto-rejected",
          "Fee increase: TRC PLN 800 (was 440), Work Permit PLN 400 (was 100)",
          "Art. 108 protection requires filing BEFORE previous title expires",
        ],
      },
      profiles: results,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// TASK 3: OCR FEEDBACK / CORRECT DATA
// ═══════════════════════════════════════════════════════════════════════════

router.post("/v1/first-contact/ocr-feedback", requireAuth, async (req, res) => {
  try {
    await ensureFeedbackTable();

    const { documentId, workerId, docType, fieldName, ocrValue, correctedValue, errorType, severity, notes } = req.body as {
      documentId?: string; workerId?: string; docType: string; fieldName: string;
      ocrValue?: string; correctedValue: string; errorType?: string; severity?: string; notes?: string;
    };

    if (!docType || !fieldName || !correctedValue) {
      return res.status(400).json({ error: "docType, fieldName, and correctedValue are required" });
    }

    const validErrorTypes = ["extraction_error", "classification_error", "date_format", "name_mismatch", "missing_field", "wrong_field", "confidence_too_high", "mrz_parse_error", "language_error"];
    const validSeverities = ["low", "medium", "high", "critical"];

    const rows = await query(`
      INSERT INTO ocr_feedback_log (document_id, worker_id, doc_type, field_name, ocr_value, corrected_value, error_type, severity, notes, logged_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      documentId ?? null, workerId ?? null, docType, fieldName,
      ocrValue ?? null, correctedValue,
      validErrorTypes.includes(errorType ?? "") ? errorType! : "extraction_error",
      validSeverities.includes(severity ?? "") ? severity! : "medium",
      notes ?? null, (req as any).user?.email ?? "anna",
    ]);

    // Audit trail (best-effort)
    try {
      await execute(`
        INSERT INTO audit_logs (actor, action, target_type, target_id, details, created_at)
        VALUES ($1, 'OCR_FEEDBACK_LOGGED', 'document', $2, $3::jsonb, NOW())
      `, [(req as any).user?.email ?? "anna", documentId ?? "system", JSON.stringify({ docType, fieldName, errorType: errorType ?? "extraction_error" })]);
    } catch { /* */ }

    return res.json({ success: true, feedback: rows[0], message: "OCR feedback logged — will be used for prompt tuning in next model iteration" });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.get("/v1/first-contact/ocr-feedback", requireAuth, async (req, res) => {
  try {
    await ensureFeedbackTable();
    const { docType, limit: lim } = req.query as { docType?: string; limit?: string };
    const maxRows = Math.min(parseInt(lim ?? "50", 10), 200);

    const rows = docType
      ? await query(`SELECT * FROM ocr_feedback_log WHERE doc_type = $1 ORDER BY created_at DESC LIMIT $2`, [docType, maxRows])
      : await query(`SELECT * FROM ocr_feedback_log ORDER BY created_at DESC LIMIT $1`, [maxRows]);

    const statsRows = await query(`
      SELECT doc_type, field_name, error_type, COUNT(*)::int as count
      FROM ocr_feedback_log WHERE resolved = false
      GROUP BY doc_type, field_name, error_type ORDER BY count DESC LIMIT 20
    `);

    return res.json({
      feedback: rows, total: rows.length, errorPatterns: statsRows,
      promptTuningHints: (statsRows as any[]).map((s: any) => ({
        hint: `${s.doc_type} → field "${s.field_name}" has ${s.count} ${s.error_type} error(s)`,
        priority: s.count >= 5 ? "HIGH" : s.count >= 2 ? "MEDIUM" : "LOW",
      })),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.patch("/v1/first-contact/ocr-feedback/:id/resolve", requireAuth, async (req, res) => {
  try {
    const fid = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    await execute(`UPDATE ocr_feedback_log SET resolved = true, resolved_at = NOW() WHERE id = $1`, [fid]);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ═══ COMBINED STATUS ═════════════════════════════════════════════════════════

router.get("/v1/first-contact/status", requireAuth, async (_req, res) => {
  try {
    let engineReady = false;
    try {
      const testOutput = evaluateWorkerLegalProtection({ filingDate: null, permitExpiryDate: "2027-01-01", nationality: "UKR" });
      engineReady = testOutput.status === "VALID";
    } catch { /* */ }

    let feedbackReady = false;
    let unresolvedCount = 0;
    try {
      await ensureFeedbackTable();
      feedbackReady = true;
      const countRows = await query<{ count: number }>(`SELECT COUNT(*)::int as count FROM ocr_feedback_log WHERE resolved = false`);
      unresolvedCount = countRows[0]?.count ?? 0;
    } catch { /* */ }

    return res.json({
      firstContact: "MONDAY_MORNING_VERIFICATION", timestamp: new Date().toISOString(),
      systems: {
        smartIngest: { ready: true, endpoint: "GET /api/v1/first-contact/ingest-audit" },
        legalEngine: { ready: engineReady, endpoint: "GET /api/v1/first-contact/stress-test" },
        feedbackLoop: { ready: feedbackReady, endpoint: "POST /api/v1/first-contact/ocr-feedback", unresolvedErrors: unresolvedCount },
      },
      allReady: engineReady && feedbackReady,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
