import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { generatePipInspectionReport, getReport, getReportsBySite } from "../services/pip-inspection-report.service.js";

const router = Router();
const LEGAL_ROLES = ["Admin", "Executive", "LegalHead"];

// POST /api/v1/legal/pip-report/generate — create a new inspection report
router.post("/v1/legal/pip-report/generate", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const { siteId, companyId, includeOnlyActiveWorkers } = req.body as {
      siteId?: string; companyId?: string; includeOnlyActiveWorkers?: boolean;
    };
    const report = await generatePipInspectionReport({
      tenantId: req.tenantId!,
      siteId, companyId,
      includeOnlyActiveWorkers: includeOnlyActiveWorkers !== false,
    });
    res.status(201).json(report);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to generate report" });
  }
});

// GET /api/v1/legal/pip-report/:id — get a stored report
router.get("/v1/legal/pip-report/:id", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const report = await getReport(req.params.id as string, req.tenantId!);
    if (!report) return res.status(404).json({ error: "Report not found" });
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch report" });
  }
});

// GET /api/v1/legal/pip-report/site/:siteId — reports for a site
router.get("/v1/legal/pip-report/site/:siteId", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const reports = await getReportsBySite(req.params.siteId as string, req.tenantId!);
    res.json({ reports, count: reports.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch reports" });
  }
});

export default router;
