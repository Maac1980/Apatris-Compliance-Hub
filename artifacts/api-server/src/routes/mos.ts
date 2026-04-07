import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import {
  validateMOSReadiness, updateMOSStatus, getMOSDocumentChecklist,
  checkPermanentResidenceEligibility, getCitizenshipRoadmap,
  type MOSStatus, type SignatureMethod,
} from "../services/mos-engine.service.js";

const router = Router();
const LEGAL_ROLES = ["Admin", "Executive", "LegalHead"];

const VALID_MOS: MOSStatus[] = ["draft", "docs_ready", "login_gov_pl", "form_filled", "signature_pending", "submitted", "mos_pending", "correction_needed", "approved", "rejected"];
const VALID_SIG: SignatureMethod[] = ["qualified", "trusted_profile", "personal_signature"];

// POST /api/v1/legal/mos/validate — check if case is ready for MOS submission
router.post("/v1/legal/mos/validate", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const { caseId } = req.body as { caseId?: string };
    if (!caseId) return res.status(400).json({ error: "caseId required" });
    const result = await validateMOSReadiness(caseId, req.tenantId!);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Validation failed" });
  }
});

// POST /api/v1/legal/mos/status — update MOS filing status
router.post("/v1/legal/mos/status", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const { caseId, status, receiptUrl, signatureMethod, submissionDate } = req.body as {
      caseId?: string; status?: string; receiptUrl?: string; signatureMethod?: string; submissionDate?: string;
    };
    if (!caseId) return res.status(400).json({ error: "caseId required" });
    if (!status || !VALID_MOS.includes(status as MOSStatus)) {
      return res.status(400).json({ error: `status must be: ${VALID_MOS.join(", ")}` });
    }
    if (signatureMethod && !VALID_SIG.includes(signatureMethod as SignatureMethod)) {
      return res.status(400).json({ error: `signatureMethod must be: ${VALID_SIG.join(", ")}` });
    }

    const result = await updateMOSStatus(caseId, req.tenantId!, status as MOSStatus, {
      receiptUrl, signatureMethod: signatureMethod as SignatureMethod, submissionDate,
    });
    res.json({ case: result });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Status update failed" });
  }
});

// GET /api/v1/legal/mos/checklist/:caseId — get document checklist
router.get("/v1/legal/mos/checklist/:caseId", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const { queryOne } = await import("../lib/db.js");
    const legalCase = await queryOne("SELECT * FROM legal_cases WHERE id = $1 AND tenant_id = $2", [req.params.caseId, req.tenantId!]);
    if (!legalCase) return res.status(404).json({ error: "Case not found" });
    const checklist = getMOSDocumentChecklist(legalCase);
    res.json({ checklist, ready: checklist.filter(c => c.required && !c.present).length === 0 });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// POST /api/v1/legal/permanent-residence/check — check PR eligibility
router.post("/v1/legal/permanent-residence/check", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const { workerId } = req.body as { workerId?: string };
    if (!workerId) return res.status(400).json({ error: "workerId required" });
    const result = await checkPermanentResidenceEligibility(workerId, req.tenantId!);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/v1/legal/citizenship-roadmap/:workerId — get citizenship timeline
router.get("/v1/legal/citizenship-roadmap/:workerId", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const roadmap = await getCitizenshipRoadmap(req.params.workerId as string, req.tenantId!);
    res.json(roadmap);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

export default router;
