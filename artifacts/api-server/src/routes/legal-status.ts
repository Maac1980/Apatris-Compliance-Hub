import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { query, queryOne, execute } from "../lib/db.js";
import { getWorkerLegalSnapshot, refreshWorkerLegalSnapshot, evaluateDeployability } from "../services/legal-status.service.js";

const router = Router();

// ═══ LEGAL STATUS ═══════════════════════════════════════════════════════════

// GET /api/workers/:id/legal-status — get current legal snapshot
router.get("/workers/:id/legal-status", requireAuth, async (req, res) => {
  try {
    const snapshot = await getWorkerLegalSnapshot(req.params.id as string, req.tenantId!);
    const deploy = evaluateDeployability({
      legalStatus: snapshot.legalStatus,
      legalBasis: snapshot.legalBasis,
      riskLevel: snapshot.riskLevel,
    });
    res.json({ ...snapshot, ...deploy });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to get legal status" });
  }
});

// POST /api/workers/:id/legal-status/refresh — recalculate and persist
router.post("/workers/:id/legal-status/refresh", requireAuth, requireRole("Admin", "Executive", "LegalHead"), async (req, res) => {
  try {
    const snapshot = await refreshWorkerLegalSnapshot(req.params.id as string, req.tenantId!);
    const deploy = evaluateDeployability({
      legalStatus: snapshot.legalStatus,
      legalBasis: snapshot.legalBasis,
      riskLevel: snapshot.riskLevel,
    });
    res.json({ ...snapshot, ...deploy, refreshed: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to refresh legal status" });
  }
});

// ═══ LEGAL EVIDENCE ═════════════════════════════════════════════════════════

const VALID_SOURCE_TYPES = ["UPO", "MOS", "TRC_FILING", "IMMIGRATION_RECEIPT"] as const;

// POST /api/workers/:id/legal-evidence — upload filing evidence and trigger legal re-evaluation
router.post("/workers/:id/legal-evidence", requireAuth, async (req, res) => {
  try {
    const workerId = req.params.id as string;
    const tenantId = req.tenantId!;
    const { sourceType, fileName, fileUrl, filingDate, notes } = req.body as {
      sourceType?: string;
      fileName?: string;
      fileUrl?: string;
      filingDate?: string;
      notes?: string;
    };

    if (!sourceType || !VALID_SOURCE_TYPES.includes(sourceType as any)) {
      return res.status(400).json({ error: `sourceType must be one of: ${VALID_SOURCE_TYPES.join(", ")}` });
    }

    // Verify worker exists
    const worker = await queryOne<any>(
      "SELECT id, full_name FROM workers WHERE id = $1 AND tenant_id = $2",
      [workerId, tenantId]
    );
    if (!worker) return res.status(404).json({ error: "Worker not found" });

    // Resolve filing date: explicit > simulated extraction (today)
    const resolvedFilingDate = filingDate ?? new Date().toISOString().slice(0, 10);

    // Simulated extraction metadata (structured for future OCR replacement)
    const extractedData = {
      sourceType,
      resolvedFilingDate,
      extractionMethod: "manual_upload_v1",
      extractedAt: new Date().toISOString(),
      ocrReady: false,
    };

    // 1. Persist the evidence record
    const evidence = await queryOne<any>(
      `INSERT INTO legal_evidence (worker_id, tenant_id, source_type, file_name, file_url, filing_date, extracted_data, notes, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [workerId, tenantId, sourceType, fileName ?? null, fileUrl ?? null, resolvedFilingDate,
       JSON.stringify(extractedData), notes ?? null, (req as any).adminEmail ?? "system"]
    );

    // 2. Update filingDate in the source data so the legal engine sees it
    //    Prefer trc_cases if one exists; otherwise update immigration_permits
    const trcCase = await queryOne<any>(
      "SELECT id, status FROM trc_cases WHERE worker_id = $1::text AND tenant_id = $2::text ORDER BY created_at DESC LIMIT 1",
      [workerId, tenantId]
    );

    if (trcCase) {
      // Update TRC case: if it was in intake, move to submitted; set filing date context
      const newStatus = trcCase.status === "intake" ? "submitted" : trcCase.status;
      await execute(
        `UPDATE trc_cases SET status = $1, start_date = COALESCE(start_date, $2), updated_at = NOW()
         WHERE id = $3 AND tenant_id = $4`,
        [newStatus, resolvedFilingDate, trcCase.id, tenantId]
      );
    } else {
      // Update immigration_permits: mark trc_application_submitted
      const permit = await queryOne<any>(
        "SELECT id FROM immigration_permits WHERE worker_id = $1 AND tenant_id = $2 ORDER BY expiry_date DESC NULLS LAST LIMIT 1",
        [workerId, tenantId]
      );
      if (permit) {
        await execute(
          "UPDATE immigration_permits SET trc_application_submitted = true, updated_at = NOW() WHERE id = $1",
          [permit.id]
        );
      }
    }

    // 3. Trigger legal re-evaluation (refresh snapshot)
    const snapshot = await refreshWorkerLegalSnapshot(workerId, tenantId);
    const deploy = evaluateDeployability({
      legalStatus: snapshot.legalStatus,
      legalBasis: snapshot.legalBasis,
      riskLevel: snapshot.riskLevel,
    });

    res.status(201).json({
      evidence,
      legalSnapshot: { ...snapshot, ...deploy },
      filingDateUsed: resolvedFilingDate,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to upload legal evidence" });
  }
});

// GET /api/workers/:id/legal-evidence — list evidence for a worker
router.get("/workers/:id/legal-evidence", requireAuth, async (req, res) => {
  try {
    const rows = await query(
      "SELECT * FROM legal_evidence WHERE worker_id = $1 AND tenant_id = $2 ORDER BY created_at DESC",
      [req.params.id, req.tenantId!]
    );
    res.json({ evidence: rows, count: rows.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch legal evidence" });
  }
});

export default router;
