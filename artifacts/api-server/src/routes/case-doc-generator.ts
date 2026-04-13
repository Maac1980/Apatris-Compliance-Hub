import { Router } from "express";
import PDFDocument from "pdfkit";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import {
  generateDocumentForStage, getDraftDocuments, getAllGeneratedDocs, getDocsByCaseId,
  approveDocument, rejectDocument, updateDocumentContent, markDocumentSent, getReviewQueueStats,
} from "../services/case-doc-generator.service.js";
import { queryOne } from "../lib/db.js";

const router = Router();
const LEGAL_ROLES = ["Admin", "Executive", "LegalHead"];

// GET /api/v1/vault/docs/queue — pending drafts for review
router.get("/v1/vault/docs/queue", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const docs = await getDraftDocuments(req.tenantId!);
    res.json({ docs, count: docs.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/v1/vault/docs/stats — review queue stats
router.get("/v1/vault/docs/stats", requireAuth, async (req, res) => {
  try {
    const stats = await getReviewQueueStats(req.tenantId!);
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/v1/vault/docs — all generated docs
router.get("/v1/vault/docs", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const docs = await getAllGeneratedDocs(req.tenantId!, limit);
    res.json({ docs, count: docs.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/v1/vault/docs/case/:caseId — docs for a specific case
router.get("/v1/vault/docs/case/:caseId", requireAuth, async (req, res) => {
  try {
    const docs = await getDocsByCaseId(req.params.caseId as string, req.tenantId!);
    res.json({ docs, count: docs.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// POST /api/v1/vault/docs/generate — manually trigger document generation
router.post("/v1/vault/docs/generate", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const { caseId, stage } = req.body as { caseId?: string; stage?: string };
    if (!caseId || !stage) return res.status(400).json({ error: "caseId and stage required" });
    const doc = await generateDocumentForStage(caseId, req.tenantId!, stage);
    if (!doc) return res.status(404).json({ error: "No document template for this stage" });
    res.status(201).json({ doc });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// POST /api/v1/vault/docs/:id/approve
router.post("/v1/vault/docs/:id/approve", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const { notes } = req.body as { notes?: string };
    const doc = await approveDocument(req.params.id as string, req.tenantId!, (req as any).user?.email || "unknown", notes);
    res.json({ doc });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// POST /api/v1/vault/docs/:id/reject
router.post("/v1/vault/docs/:id/reject", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const { notes } = req.body as { notes?: string };
    if (!notes) return res.status(400).json({ error: "rejection notes required" });
    const doc = await rejectDocument(req.params.id as string, req.tenantId!, (req as any).user?.email || "unknown", notes);
    res.json({ doc });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// PATCH /api/v1/vault/docs/:id — edit document content
router.patch("/v1/vault/docs/:id", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const { contentPl, contentEn } = req.body as { contentPl?: string; contentEn?: string };
    if (!contentPl || !contentEn) return res.status(400).json({ error: "contentPl and contentEn required" });
    const doc = await updateDocumentContent(req.params.id as string, req.tenantId!, contentPl, contentEn);
    res.json({ doc });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// POST /api/v1/vault/docs/:id/send — mark as sent
router.post("/v1/vault/docs/:id/send", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const { sentTo } = req.body as { sentTo?: string };
    if (!sentTo) return res.status(400).json({ error: "sentTo required" });
    const doc = await markDocumentSent(req.params.id as string, req.tenantId!, sentTo);
    res.json({ doc });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/v1/vault/docs/:id/pdf — download as PDF
router.get("/v1/vault/docs/:id/pdf", requireAuth, async (req, res) => {
  try {
    const lang = (req.query.lang as string) === "en" ? "en" : "pl";
    const doc = await queryOne<any>(
      "SELECT d.*, w.first_name, w.last_name FROM case_generated_docs d JOIN workers w ON d.worker_id = w.id WHERE d.id = $1 AND d.tenant_id = $2",
      [req.params.id, req.tenantId!]
    );
    if (!doc) return res.status(404).json({ error: "Document not found" });

    const content = lang === "pl" ? doc.content_pl : doc.content_en;
    const pdf = new PDFDocument({ size: "A4", margin: 50 });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${doc.doc_type}_${doc.first_name}_${doc.last_name}.pdf"`);
    pdf.pipe(res);

    // Header
    pdf.fontSize(10).fillColor("#C41E18").text("APATRIS COMPLIANCE HUB", { align: "right" });
    pdf.moveDown(0.5);
    pdf.fontSize(8).fillColor("#666").text(`Generated: ${new Date(doc.created_at).toLocaleDateString("en-GB")} | ${doc.ai_model ?? "template"} | ${doc.status}`, { align: "right" });
    pdf.moveDown(1);

    // Title
    pdf.fontSize(16).fillColor("#111").text(doc.title, { align: "left" });
    pdf.moveDown(0.3);
    pdf.fontSize(9).fillColor("#666").text(`Worker: ${doc.first_name} ${doc.last_name} | Case: ${doc.case_id.slice(0, 8)} | Stage: ${doc.stage_trigger}`);
    pdf.moveDown(0.5);

    // Legal basis
    if (doc.legal_basis?.length > 0) {
      pdf.fontSize(8).fillColor("#8B5CF6").text(`Legal Basis: ${doc.legal_basis.join(" · ")}`);
      pdf.moveDown(0.5);
    }

    // Divider
    pdf.moveTo(50, pdf.y).lineTo(545, pdf.y).strokeColor("#ddd").stroke();
    pdf.moveDown(0.5);

    // Content
    pdf.fontSize(10).fillColor("#222").text(content, { lineGap: 4, align: "left" });

    pdf.end();
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// POST /api/v1/vault/docs/:id/email — send approved doc via email
router.post("/v1/vault/docs/:id/email", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const { to, lang } = req.body as { to?: string; lang?: string };
    if (!to) return res.status(400).json({ error: "to (email address) required" });

    const doc = await queryOne<any>(
      "SELECT d.*, w.first_name, w.last_name FROM case_generated_docs d JOIN workers w ON d.worker_id = w.id WHERE d.id = $1 AND d.tenant_id = $2",
      [req.params.id, req.tenantId!]
    );
    if (!doc) return res.status(404).json({ error: "Document not found" });
    if (doc.status !== "APPROVED") return res.status(422).json({ error: "Document must be APPROVED before sending" });

    const content = (lang === "en" ? doc.content_en : doc.content_pl) || doc.content_pl;
    const { sendAlertEmail } = await import("../lib/mailer.js");
    await sendAlertEmail({
      to,
      workerName: `${doc.first_name} ${doc.last_name}`,
      subject: `[Apatris] ${doc.title}`,
      status: "info",
      details: content.slice(0, 200) + "...",
    });

    await markDocumentSent(doc.id, req.tenantId!, to);
    res.json({ sent: true, to });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

export default router;
