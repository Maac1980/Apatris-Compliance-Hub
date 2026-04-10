/**
 * Legal Intelligence API — Apatris
 *
 * POST /api/v1/legal-intel/research — case-connected research
 * GET  /api/v1/legal-intel/research — list memos
 * POST /api/v1/legal-intel/appeal — full appeal assistant
 * GET  /api/v1/legal-intel/appeal/:workerId — list appeal outputs
 * POST /api/v1/legal-intel/poa — generate power of attorney
 * GET  /api/v1/legal-intel/poa/:workerId — list POAs
 * POST /api/v1/legal-intel/authority-draft — draft letter to authority
 * GET  /api/v1/legal-intel/authority-draft/:workerId — list drafts
 * GET  /api/v1/legal-intel/reasoning/:workerId — explain legal status
 */

import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import {
  researchCase, buildAppeal, generatePOA, draftAuthorityLetter, explainLegalReasoning,
  getResearchMemos, getAppealOutputs, getPOADocuments, getAuthorityDrafts,
} from "../services/legal-intelligence.service.js";

const router = Router();
const ROLES = ["Admin", "Executive", "LegalHead"];
const TEAM_ROLES = ["Admin", "Executive", "LegalHead", "TechOps", "Coordinator"];

// ── Research ─────────────────────────────────────────────────────────────
router.post("/v1/legal-intel/research", requireAuth, requireRole(...ROLES), async (req, res) => {
  try {
    const { workerId, title, prompt, caseId } = req.body as { workerId: string; title: string; prompt: string; caseId?: string };
    if (!workerId || !title || !prompt) return res.status(400).json({ error: "workerId, title, prompt required" });
    const result = await researchCase(workerId, req.tenantId!, title, prompt, req.user?.name ?? "unknown", caseId);
    res.status(201).json(result);
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Research failed" }); }
});

router.get("/v1/legal-intel/research", requireAuth, requireRole(...TEAM_ROLES), async (req, res) => {
  try {
    const { workerId } = req.query as { workerId?: string };
    const memos = await getResearchMemos(req.tenantId!, workerId);
    res.json({ memos, count: memos.length });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// ── Appeal ───────────────────────────────────────────────────────────────
router.post("/v1/legal-intel/appeal", requireAuth, requireRole(...ROLES), async (req, res) => {
  try {
    const { workerId, rejectionText, caseId } = req.body as { workerId: string; rejectionText?: string; caseId?: string };
    if (!workerId) return res.status(400).json({ error: "workerId required" });
    const result = await buildAppeal(workerId, req.tenantId!, rejectionText, caseId);
    res.status(201).json(result);
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

router.get("/v1/legal-intel/appeal/:workerId", requireAuth, requireRole(...TEAM_ROLES), async (req, res) => {
  try {
    const outputs = await getAppealOutputs(req.tenantId!, req.params.workerId);
    res.json({ outputs, count: outputs.length });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// ── POA ──────────────────────────────────────────────────────────────────
router.post("/v1/legal-intel/poa", requireAuth, requireRole(...ROLES), async (req, res) => {
  try {
    const { workerId, representativeName, poaType, caseId } = req.body as { workerId: string; representativeName: string; poaType?: string; caseId?: string };
    if (!workerId || !representativeName) return res.status(400).json({ error: "workerId and representativeName required" });
    const result = await generatePOA(workerId, req.tenantId!, representativeName, poaType ?? "GENERAL", caseId);
    res.status(201).json(result);
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

router.get("/v1/legal-intel/poa/:workerId", requireAuth, requireRole(...TEAM_ROLES), async (req, res) => {
  try {
    const docs = await getPOADocuments(req.tenantId!, req.params.workerId);
    res.json({ documents: docs, count: docs.length });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// ── Authority Drafting ───────────────────────────────────────────────────
router.post("/v1/legal-intel/authority-draft", requireAuth, requireRole(...ROLES), async (req, res) => {
  try {
    const { workerId, draftType, specificIssue, authorityName, caseId } = req.body as { workerId: string; draftType: string; specificIssue: string; authorityName?: string; caseId?: string };
    if (!workerId || !specificIssue) return res.status(400).json({ error: "workerId and specificIssue required" });
    const result = await draftAuthorityLetter(workerId, req.tenantId!, draftType ?? "correspondence", specificIssue, authorityName, caseId);
    res.status(201).json(result);
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

router.get("/v1/legal-intel/authority-draft/:workerId", requireAuth, requireRole(...TEAM_ROLES), async (req, res) => {
  try {
    const drafts = await getAuthorityDrafts(req.tenantId!, req.params.workerId);
    res.json({ drafts, count: drafts.length });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// ── Legal Reasoning ──────────────────────────────────────────────────────
router.get("/v1/legal-intel/reasoning/:workerId", requireAuth, requireRole(...TEAM_ROLES), async (req, res) => {
  try {
    const result = await explainLegalReasoning(req.params.workerId, req.tenantId!);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

export default router;
