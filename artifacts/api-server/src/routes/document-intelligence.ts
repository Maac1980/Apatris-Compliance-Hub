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
import { confirmIntake, matchWorkerMultiSignal } from "../services/document-intake.service.js";
import { emitIntelligenceEvent } from "../lib/intelligence-emitter.js";
import { storeFile, getFile } from "../lib/file-storage.js";

const router = Router();
const VIEW = ["Admin", "Executive", "LegalHead", "TechOps", "Coordinator"];
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const ALLOWED_MIME = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const toUuidOrNull = (v: unknown): string | null =>
  typeof v === "string" && UUID_RE.test(v) ? v : null;

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

    // Worker auto-matching from extracted identity fields
    const ef = result.extracted_fields;
    const val = (key: string) => ef[key]?.value ?? null;
    let workerMatch: { workerId: string | null; workerName: string | null; confidence: number; matchType: string; signals: any[]; suggestions: any[] } | null = null;

    if (!workerId) {
      // Only auto-match if user didn't already select a worker
      try {
        workerMatch = await matchWorkerMultiSignal({
          fullName: val("full_name"),
          passportNumber: val("passport_number"),
          pesel: val("pesel"),
          dateOfBirth: val("date_of_birth"),
          nationality: val("nationality"),
          issuingCountry: val("issuing_country"),
        }, req.tenantId!);
      } catch (err) {
        console.error("[DocIntel] Worker matching failed:", err instanceof Error ? err.message : err);
      }
    }

    // Use explicit workerId if provided, otherwise use high-confidence match
    const resolvedWorkerId = workerId ?? (workerMatch && workerMatch.confidence >= 0.6 ? workerMatch.workerId : null);

    // Sub-phase C1: persist the uploaded PDF so lawyers can retrieve the source
    // later. Fail-open — on storage error we still INSERT with file_key=null and
    // a structured error label in file_storage_error. Extraction is never blocked.
    let storedKey: string | null = null;
    let storageErrorLabel: string | null = null;
    if (file) {
      try {
        const stored = await storeFile({
          tenantId: req.tenantId!,
          category: "document-intake",
          fileName: file.originalname,
          buffer: file.buffer,
          mimeType: file.mimetype,
        });
        storedKey = stored.key;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const httpStatus = (err as any)?.$metadata?.httpStatusCode;
        if (msg.includes("BLOCKED in production")) {
          storageErrorLabel = "storage_blocked";
        } else if (typeof httpStatus === "number") {
          storageErrorLabel = `s3_error:${httpStatus}`;
        } else if (/timeout|abort|ECONNRESET|ENOTFOUND|socket hang up|network/i.test(msg)) {
          storageErrorLabel = "network_error";
        } else {
          storageErrorLabel = `unknown:${msg.slice(0, 120)}`;
        }
      }
    }

    // Create document_intake row with real file metadata + match data + file_key
    const row = await queryOne<any>(
      `INSERT INTO document_intake (
        tenant_id, uploaded_by, file_name, mime_type, file_size,
        ai_classification, ai_extracted_json, ai_confidence,
        matched_worker_id, match_confidence, match_signals_json,
        linked_case_id, status,
        file_key, file_storage_error
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
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
        resolvedWorkerId,
        workerMatch?.confidence ?? null,
        workerMatch ? JSON.stringify({ matchType: workerMatch.matchType, signals: workerMatch.signals, suggestions: workerMatch.suggestions }) : null,
        caseId ?? null,
        "PENDING_REVIEW",
        storedKey,
        storageErrorLabel,
      ]
    );

    // If storage failed, log structured warning with the REAL intake_id
    // (not a sentinel). See Concern 1 from Sub-phase C1 review.
    if (storageErrorLabel) {
      console.warn("[docintel-storage] Persist failed", {
        intakeId: row.id,
        tenantId: req.tenantId,
        fileName: file?.originalname ?? fileName,
        fileSize: file?.size ?? null,
        errorLabel: storageErrorLabel,
      });
    }

    // file_key: null → no download available for this intake
    // file_storage_error: present → why no download (structured label)
    // Both fields are always present in the response; file_storage_error
    // is undefined when storage succeeded.
    res.json({
      ...result,
      intake_id: row.id,
      intake_created_at: row.created_at,
      file_name: fileName,
      file_size: file?.size ?? null,
      mime_type: file?.mimetype ?? null,
      file_key: storedKey,
      ...(storageErrorLabel ? { file_storage_error: storageErrorLabel } : {}),
      suggested_worker: workerMatch && workerMatch.confidence >= 0.3 ? {
        workerId: workerMatch.workerId,
        displayName: workerMatch.workerName,
        confidence: workerMatch.confidence,
        matchType: workerMatch.matchType,
        signals: workerMatch.signals,
        suggestions: workerMatch.suggestions,
      } : null,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Extraction failed" });
  }
});

// GET /api/v1/document-intelligence/:id/file
// Sub-phase C1: serves the original uploaded PDF so lawyers can retrieve the
// source file later. Tenant-scoped; returns inline so the browser renders in a
// tab. Three distinct 404 cases:
//   - Intake row not found (bad id or wrong tenant)
//   - Row exists but file_key is null (pre-C1 intake or storage failed)
//   - file_key set but storage returned null (S3 object deleted/missing)
router.get("/v1/document-intelligence/:id/file", requireAuth, requireRole(...VIEW), async (req, res) => {
  try {
    const row = await queryOne<{ file_key: string | null; file_name: string; mime_type: string | null }>(
      "SELECT file_key, file_name, mime_type FROM document_intake WHERE id = $1 AND tenant_id = $2",
      [req.params.id, req.tenantId!],
    );
    if (!row) return res.status(404).json({ error: "Intake record not found" });
    if (!row.file_key) return res.status(404).json({ error: "Original file not available for this intake" });

    const buffer = await getFile(row.file_key);
    if (!buffer) return res.status(404).json({ error: "File deleted from storage" });

    // RFC 5987: provide ASCII-safe fallback AND UTF-8 variant. Polish
    // diacritics (ąćęłńóśźż) become "_" in the quoted fallback; modern
    // browsers prefer filename*=UTF-8''<percent-encoded> and render correctly.
    const safeFallback = row.file_name.replace(/[^\x20-\x7E]/g, "_");
    const utf8Encoded = encodeURIComponent(row.file_name);

    res.setHeader("Content-Type", row.mime_type || "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${safeFallback}"; filename*=UTF-8''${utf8Encoded}`,
    );
    res.send(buffer);
  } catch (err) {
    console.error("[docintel-download] Unexpected error", {
      intakeId: req.params.id,
      tenantId: req.tenantId,
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: "File retrieval failed" });
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
    // Normalize to null when empty — PostgreSQL UUID columns reject empty strings
    const resolvedWorkerId = toUuidOrNull(workerId) ?? toUuidOrNull(intake.matched_worker_id);
    const resolvedCaseId = toUuidOrNull(caseId) ?? toUuidOrNull(intake.linked_case_id);
    const resolvedDocType = (docType || intake.ai_classification || "").toUpperCase();

    // Update linkage on the intake row if new context was provided
    const safeWorkerId = toUuidOrNull(workerId);
    const safeCaseId = toUuidOrNull(caseId);
    if (safeCaseId || safeWorkerId) {
      try {
        const sets: string[] = [];
        const vals: any[] = [];
        let idx = 1;
        if (safeWorkerId && safeWorkerId !== intake.matched_worker_id) { sets.push(`matched_worker_id = $${idx++}`); vals.push(safeWorkerId); }
        if (safeCaseId && safeCaseId !== intake.linked_case_id) { sets.push(`linked_case_id = $${idx++}`); vals.push(safeCaseId); }
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
      resolvedWorkerId ?? null,
      mapped,
      applyActions,
    );

    // Overwrite confirmed_fields_json with metadata-enriched version
    try {
      await execute(
        "UPDATE document_intake SET confirmed_fields_json = $1, confirmed_worker_id = $2 WHERE id = $3",
        [JSON.stringify(confirmedWithMeta), resolvedWorkerId ?? null, intakeId]
      );
    } catch { /* non-critical */ }

    // Audit log
    appendAuditLog({
      timestamp: new Date().toISOString(),
      actor: userName,
      actorEmail: (req as any).user?.email ?? "",
      action: "DOCUMENT_UPDATE",
      workerId: resolvedWorkerId ?? intakeId,
      workerName: approvedFields.full_name ?? "—",
      note: `Structured intake confirmed: ${Object.keys(approvedFields).length} fields, actions: ${result.appliedActions.join(", ") || "none"}`,
    });

    // UPO auto-lock: if approved document is UPO and has a filing date, refresh legal snapshot to trigger Art. 108
    if (resolvedDocType === "UPO" && resolvedWorkerId && mapped.filing_date) {
      try {
        const { refreshWorkerLegalSnapshot } = await import("../services/legal-status.service.js");
        await refreshWorkerLegalSnapshot(resolvedWorkerId, req.tenantId!);
        console.log(`[DocIntel] UPO approved for worker ${resolvedWorkerId} — Art. 108 status refreshed`);
      } catch (e) { console.error("[DocIntel] Art. 108 auto-lock failed:", e instanceof Error ? e.message : e); }
    }

    emitIntelligenceEvent({
      type: "doc_verified",
      workerId: resolvedWorkerId ?? intakeId,
      workerName: approvedFields.full_name ?? "Unknown",
      message: resolvedDocType === "UPO"
        ? `UPO approved — Art. 108 status auto-refreshed`
        : `Document approved: ${Object.keys(approvedFields).length} fields confirmed`,
      timestamp: new Date().toISOString(),
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
