/**
 * Document Intelligence Routes — structured document extraction + approval.
 * Extraction creates a document_intake row in PENDING_REVIEW.
 * Approval confirms it via the existing confirmIntake() pipeline.
 */

import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { execute, queryOne } from "../lib/db.js";
import { appendAuditLog } from "../lib/audit-log.js";
import {
  extractStructuredDocumentData,
  getFieldDefinitions,
  type DocumentType,
} from "../services/document-intelligence.service.js";
import { confirmIntake } from "../services/document-intake.service.js";

const router = Router();
const VIEW = ["Admin", "Executive", "LegalHead", "TechOps", "Coordinator"];

// POST /api/v1/document-intelligence/extract
// Extracts structured fields AND creates a document_intake row for later confirmation.
router.post("/v1/document-intelligence/extract", requireAuth, requireRole(...VIEW), async (req, res) => {
  try {
    const { fileName, documentType, workerId, caseId } = req.body as {
      fileName?: string; documentType?: DocumentType; workerId?: string; caseId?: string;
    };
    if (!fileName) return res.status(400).json({ error: "fileName is required" });

    const result = extractStructuredDocumentData({ fileName, documentType });

    // Create document_intake row — bridges into existing confirmation pipeline
    const row = await queryOne<any>(
      `INSERT INTO document_intake (
        tenant_id, uploaded_by, file_name, ai_classification,
        ai_extracted_json, ai_confidence, matched_worker_id, linked_case_id, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PENDING_REVIEW')
      RETURNING id, created_at`,
      [
        req.tenantId!,
        (req as any).user?.email ?? (req as any).user?.name ?? "unknown",
        fileName,
        result.document_type,
        JSON.stringify(result.extracted_fields),
        result.overall_confidence,
        workerId ?? null,
        caseId ?? null,
      ]
    );

    res.json({ ...result, intake_id: row.id, intake_created_at: row.created_at });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Extraction failed" });
  }
});

// POST /api/v1/document-intelligence/approve
// Confirms an intake row using the existing confirmIntake() pipeline.
router.post("/v1/document-intelligence/approve", requireAuth, requireRole(...VIEW), async (req, res) => {
  try {
    const { intakeId, workerId, caseId, approvedFields } = req.body as {
      intakeId?: string; workerId?: string; caseId?: string;
      approvedFields?: Record<string, any>;
    };

    if (!intakeId) return res.status(400).json({ error: "intakeId is required" });
    if (!approvedFields || typeof approvedFields !== "object") {
      return res.status(400).json({ error: "approvedFields is required" });
    }

    const userName = (req as any).user?.name ?? (req as any).user?.email ?? "unknown";
    const docType = (req.body.documentType ?? "").toUpperCase();

    // Pre-check intake status to return 409 on double approval instead of 500
    const existing = await queryOne<any>(
      "SELECT status FROM document_intake WHERE id = $1 AND tenant_id = $2",
      [intakeId, req.tenantId!]
    );
    if (!existing) return res.status(404).json({ error: "Intake record not found" });
    if (existing.status !== "PENDING_REVIEW") {
      return res.status(409).json({ error: `Intake already ${existing.status}`, status: existing.status });
    }

    // Update case linkage if provided and column exists
    if (caseId) {
      try {
        await execute(
          "UPDATE document_intake SET linked_case_id = $1 WHERE id = $2 AND tenant_id = $3",
          [caseId, intakeId, req.tenantId!]
        );
      } catch { /* linked_case_id column may not exist on older schemas */ }
    }

    // Build confirmed_fields with metadata preserved
    const confirmedWithMeta: Record<string, any> = {};
    for (const [key, value] of Object.entries(approvedFields)) {
      confirmedWithMeta[key] = typeof value === "object" && value !== null
        ? value  // already has {value, confidence, source}
        : { value, confidence: 1.0, source: "manual" };
    }

    // Map extracted field names to confirmIntake's camelCase keys — DOCUMENT-TYPE-AWARE
    const mapped: Record<string, any> = {};
    for (const [key, val] of Object.entries(approvedFields)) {
      const v = typeof val === "object" && val !== null ? (val as any).value : val;
      if (v) mapped[key] = v;
    }

    const applyActions: string[] = [];
    if (workerId) {
      // Expiry field mapping depends on document type
      const EXPIRY_MAP: Record<string, Record<string, string>> = {
        TRC:            { expiry_date: "trcExpiry", filing_date: "trcExpiry" },
        WORK_PERMIT:    { expiry_date: "workPermitExpiry" },
        PASSPORT:       { expiry_date: "passportExpiry" },
        BHP:            { expiry_date: "bhpExpiry" },
        CONTRACT:       { end_date: "contractEndDate" },
        MEDICAL_CERT:   { expiry_date: "medicalExamExpiry" },
        UDT_CERT:       { expiry_date: "udtCertExpiry" },
      };
      const typeMap = EXPIRY_MAP[docType] ?? {};

      for (const [extractedKey, camelKey] of Object.entries(typeMap)) {
        if (mapped[extractedKey]) mapped[camelKey] = mapped[extractedKey];
      }

      // Identity fields (universal across document types)
      if (mapped.passport_number) mapped.passportNumber = mapped.passport_number;
      if (mapped.nationality) mapped.nationality = mapped.nationality;
      if (mapped.date_of_birth) mapped.dateOfBirth = mapped.date_of_birth;

      const hasUpdatable = Object.keys(typeMap).some(k => mapped[k]) ||
        mapped.passportNumber || mapped.nationality || mapped.dateOfBirth;

      if (hasUpdatable) applyActions.push("UPDATE_EXPIRY_FIELD");
    }

    const result = await confirmIntake(
      intakeId,
      req.tenantId!,
      userName,
      workerId ?? "",
      mapped,
      applyActions,
    );

    // Also persist the metadata-enriched version
    try {
      await execute(
        "UPDATE document_intake SET confirmed_fields_json = $1 WHERE id = $2",
        [JSON.stringify(confirmedWithMeta), intakeId]
      );
    } catch { /* non-critical — flat fields already saved by confirmIntake */ }

    // Audit log
    appendAuditLog({
      timestamp: new Date().toISOString(),
      actor: userName,
      actorEmail: (req as any).user?.email ?? "",
      action: "DOCUMENT_UPDATE",
      workerId: workerId ?? intakeId,
      workerName: approvedFields.full_name ?? "—",
      note: `Structured intake confirmed: ${Object.keys(approvedFields).length} fields, actions: ${result.appliedActions.join(", ") || "none"}`,
    });

    res.json({
      success: true,
      intakeId,
      appliedActions: result.appliedActions,
      confirmedAt: new Date().toISOString(),
      confirmedBy: userName,
      fieldCount: Object.keys(approvedFields).length,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Approval failed" });
  }
});

// GET /api/v1/document-intelligence/fields/:type
router.get("/v1/document-intelligence/fields/:type", requireAuth, async (req, res) => {
  const docType = (req.params.type ?? "UNKNOWN").toUpperCase() as DocumentType;
  const fields = getFieldDefinitions(docType);
  res.json({ document_type: docType, fields });
});

export default router;
