/**
 * Document Intelligence Routes — structured document extraction + approval.
 * Extraction creates a document_intake row in PENDING_REVIEW.
 * Approval confirms it via the existing confirmIntake() pipeline.
 */

import { Router } from "express";
import multer from "multer";
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
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const ALLOWED_MIME = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

// POST /api/v1/document-intelligence/extract
// Accepts real file upload (multipart) or JSON-only (backward compat).
// Creates a document_intake row for later confirmation.
router.post("/v1/document-intelligence/extract", requireAuth, requireRole(...VIEW), upload.single("file"), async (req, res) => {
  try {
    // Support both multipart (form fields) and JSON body
    const documentType = (req.body.documentType ?? "") as DocumentType;
    const workerId = req.body.workerId as string | undefined;
    const caseId = req.body.caseId as string | undefined;
    const file = req.file;

    // Determine filename: from uploaded file or from body field
    const fileName = file?.originalname ?? req.body.fileName;
    if (!fileName) return res.status(400).json({ error: "fileName or file upload is required" });

    // Validate file type if real file was uploaded
    if (file && !ALLOWED_MIME.includes(file.mimetype)) {
      return res.status(400).json({ error: `Unsupported file type: ${file.mimetype}. Allowed: PDF, JPEG, PNG, WebP` });
    }

    // Run extraction — uses Claude Vision when file is available
    const result = await extractStructuredDocumentData({
      fileName,
      documentType: documentType || undefined,
      rawContent: file ? file.buffer.toString("base64") : undefined,
      mimeType: file?.mimetype,
    });

    // Create document_intake row with real file metadata
    const row = await queryOne<any>(
      `INSERT INTO document_intake (
        tenant_id, uploaded_by, file_name, mime_type, file_size,
        ai_classification, ai_extracted_json, ai_confidence,
        matched_worker_id, linked_case_id, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'PENDING_REVIEW')
      RETURNING id, created_at`,
      [
        req.tenantId!,
        (req as any).user?.email ?? (req as any).user?.name ?? "unknown",
        fileName,
        file?.mimetype ?? null,
        file?.size ?? null,
        result.document_type,
        JSON.stringify(result.extracted_fields),
        result.overall_confidence,
        workerId ?? null,
        caseId ?? null,
      ]
    );

    res.json({
      ...result,
      intake_id: row.id,
      intake_created_at: row.created_at,
      file_name: fileName,
      file_size: file?.size ?? null,
      mime_type: file?.mimetype ?? null,
    });
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

    // Load full intake row — check status + get existing linkage
    const intake = await queryOne<any>(
      "SELECT status, matched_worker_id, linked_case_id, ai_classification FROM document_intake WHERE id = $1 AND tenant_id = $2",
      [intakeId, req.tenantId!]
    );
    if (!intake) return res.status(404).json({ error: "Intake record not found" });
    if (intake.status !== "PENDING_REVIEW") {
      return res.status(409).json({ error: `Intake already ${intake.status}`, status: intake.status });
    }

    // Resolve linkage: prefer explicit params, fall back to intake's existing values
    const resolvedWorkerId = workerId || intake.matched_worker_id || null;
    const resolvedCaseId = caseId || intake.linked_case_id || null;
    const resolvedDocType = (docType || intake.ai_classification || "").toUpperCase();

    // Update linkage on the intake row if new context was provided
    if (caseId || workerId) {
      try {
        const sets: string[] = [];
        const vals: any[] = [];
        let idx = 1;
        if (workerId && workerId !== intake.matched_worker_id) { sets.push(`matched_worker_id = $${idx++}`); vals.push(workerId); }
        if (caseId && caseId !== intake.linked_case_id) { sets.push(`linked_case_id = $${idx++}`); vals.push(caseId); }
        if (sets.length > 0) {
          vals.push(intakeId, req.tenantId!);
          await execute(`UPDATE document_intake SET ${sets.join(", ")} WHERE id = $${idx} AND tenant_id = $${idx + 1}`, vals);
        }
      } catch { /* linkage columns may not exist on older schemas */ }
    }

    // Build confirmed_fields with metadata preserved
    const confirmedWithMeta: Record<string, any> = {};
    for (const [key, value] of Object.entries(approvedFields)) {
      confirmedWithMeta[key] = typeof value === "object" && value !== null
        ? value
        : { value, confidence: 1.0, source: "manual" };
    }

    // Flatten to plain values for confirmIntake action mapping
    const mapped: Record<string, any> = {};
    for (const [key, val] of Object.entries(approvedFields)) {
      const v = typeof val === "object" && val !== null ? (val as any).value : val;
      if (v) mapped[key] = v;
    }

    // Action mapping — only runs with a valid worker AND matching document type
    const applyActions: string[] = [];
    if (resolvedWorkerId) {
      const EXPIRY_MAP: Record<string, Record<string, string>> = {
        TRC:            { expiry_date: "trcExpiry" },
        WORK_PERMIT:    { expiry_date: "workPermitExpiry" },
        PASSPORT:       { expiry_date: "passportExpiry" },
        BHP:            { expiry_date: "bhpExpiry" },
        CONTRACT:       { end_date: "contractEndDate" },
        MEDICAL_CERT:   { expiry_date: "medicalExamExpiry" },
        UDT_CERT:       { expiry_date: "udtCertExpiry" },
      };
      const typeMap = EXPIRY_MAP[resolvedDocType] ?? {};

      // Map expiry fields with date validation
      for (const [extractedKey, camelKey] of Object.entries(typeMap)) {
        const val = mapped[extractedKey];
        if (val && !isNaN(new Date(val).getTime())) {
          mapped[camelKey] = val;
        }
      }

      // Identity fields (universal) with basic validation
      if (mapped.passport_number && typeof mapped.passport_number === "string") mapped.passportNumber = mapped.passport_number;
      if (mapped.nationality && typeof mapped.nationality === "string") mapped.nationality = mapped.nationality;
      if (mapped.date_of_birth && !isNaN(new Date(mapped.date_of_birth).getTime())) mapped.dateOfBirth = mapped.date_of_birth;

      const hasUpdatable = Object.values(typeMap).some(camel => mapped[camel]) ||
        mapped.passportNumber || mapped.nationality || mapped.dateOfBirth;

      if (hasUpdatable) applyActions.push("UPDATE_EXPIRY_FIELD");
    }

    const result = await confirmIntake(
      intakeId,
      req.tenantId!,
      userName,
      resolvedWorkerId ?? "",
      mapped,
      applyActions,
    );

    // Overwrite confirmed_fields_json with metadata-enriched version
    try {
      await execute(
        "UPDATE document_intake SET confirmed_fields_json = $1, confirmed_worker_id = $2 WHERE id = $3",
        [JSON.stringify(confirmedWithMeta), resolvedWorkerId, intakeId]
      );
    } catch { /* non-critical */ }

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
