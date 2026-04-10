/**
 * Legal Intelligence Routes — Block 3 unified API surface.
 *
 * Groups:
 *   /api/v1/legal/research-workspace/* — research memos
 *   /api/v1/legal/appeal-assistant/*   — appeal workspace
 *   /api/v1/legal/poa/*               — power of attorney
 *   /api/v1/legal/authority-draft/*    — authority response drafting
 *   /api/v1/legal/reasoning/*          — legal reasoning panel / timeline
 */

import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";

// Services
import {
  createResearchMemo, listMemos, getMemoById, getMemosByWorker,
  updateMemoStatus, getMemoTypes, type MemoType,
} from "../services/legal-research-workspace.service.js";

import {
  runAppealAssistant, getAppealOutputsByWorker, getAppealOutputById,
} from "../services/appeal-assistant.service.js";

import {
  generatePoa, getPoasByWorker, getPoaById,
  updatePoaContent, updatePoaStatus, getPoaTypes,
} from "../services/poa-generator.service.js";

import {
  generateAuthorityDraft, getDraftsByWorker, getDraftById,
  updateDraftStatus, getDraftTypes,
} from "../services/authority-drafting.service.js";

import {
  getLegalReasoningPanel,
} from "../services/legal-reasoning-panel.service.js";

import {
  getWorkerEvidence, analyzeEvidenceGaps, RECOMMENDED_EVIDENCE,
  getWorkerDocumentSummary,
} from "../services/legal-output-linker.service.js";

import {
  approveEntity, type ApprovableEntity,
} from "../services/legal-approval.service.js";

import {
  getWorkerIntelligence, getFleetSignals,
} from "../services/next-action-engine.service.js";

import {
  generateLegalBrief, getBriefsByWorker, getBriefById,
} from "../services/legal-brief-pipeline.service.js";

import {
  runIntelligenceScan, getSnapshots, getLatestSnapshot,
  acknowledgeAction, getAcknowledgments,
  checkReleaseReadiness,
} from "../services/intelligence-scan.service.js";

import {
  getTrcCaseView, updateTask, getCaseGuidance, getFullCaseIntelligence,
} from "../services/trc-workspace.service.js";

const router = Router();
const LEGAL_ROLES = ["Admin", "Executive", "LegalHead"];
const EXTENDED_ROLES = [...LEGAL_ROLES, "Coordinator"];

// Helper: extract param safely (Express 5 returns string | string[])
const p = (v: string | string[] | undefined): string => Array.isArray(v) ? v[0] : v ?? "";

// ═══════════════════════════════════════════════════════════════════════════
// RESEARCH WORKSPACE
// ═══════════════════════════════════════════════════════════════════════════

router.get("/v1/legal/research-workspace/types", requireAuth, (_req, res) => {
  res.json({ types: getMemoTypes() });
});

router.post("/v1/legal/research-workspace/create", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const { title, memoType, prompt, linkedWorkerId, linkedCaseId, linkedEmployer, linkedCity } = req.body;
    if (!title || !prompt) { res.status(400).json({ error: "title and prompt required" }); return; }

    const user = (req as any).user;
    const memo = await createResearchMemo({
      tenantId: user.tenant_id ?? "default",
      title,
      memoType: (memoType ?? "custom") as MemoType,
      prompt,
      owner: user.name ?? user.email ?? "unknown",
      linkedWorkerId, linkedCaseId, linkedEmployer, linkedCity,
    });
    res.json({ memo });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/v1/legal/research-workspace", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const user = (req as any).user;
    const memos = await listMemos(user.tenant_id ?? "default", 30);
    res.json({ memos });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/v1/legal/research-workspace/:id", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const user = (req as any).user;
    const memo = await getMemoById(p(req.params.id), user.tenant_id ?? "default");
    if (!memo) { res.status(404).json({ error: "Memo not found" }); return; }
    res.json({ memo });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/v1/legal/research-workspace/worker/:workerId", requireAuth, requireRole(...EXTENDED_ROLES), async (req, res) => {
  try {
    const user = (req as any).user;
    const memos = await getMemosByWorker(p(req.params.workerId), user.tenant_id ?? "default");
    res.json({ memos });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/v1/legal/research-workspace/:id/status", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const user = (req as any).user;
    const { status } = req.body;
    if (!["draft", "in_review", "approved", "archived"].includes(status)) {
      res.status(400).json({ error: "Invalid status" }); return;
    }
    await updateMemoStatus(p(req.params.id), user.tenant_id ?? "default", status);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// APPEAL ASSISTANT
// ═══════════════════════════════════════════════════════════════════════════

router.post("/v1/legal/appeal-assistant/run", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const user = (req as any).user;
    const { workerId, caseId, rejectionText, additionalEvidence } = req.body;
    if (!workerId) { res.status(400).json({ error: "workerId required" }); return; }

    const output = await runAppealAssistant({
      workerId, caseId, rejectionText, additionalEvidence,
      tenantId: user.tenant_id ?? "default",
      generatedBy: user.name ?? user.email ?? "unknown",
    });
    res.json({ output });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/v1/legal/appeal-assistant/worker/:workerId", requireAuth, requireRole(...EXTENDED_ROLES), async (req, res) => {
  try {
    const user = (req as any).user;
    const outputs = await getAppealOutputsByWorker(p(req.params.workerId), user.tenant_id ?? "default");
    res.json({ outputs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/v1/legal/appeal-assistant/:id", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const user = (req as any).user;
    const output = await getAppealOutputById(p(req.params.id), user.tenant_id ?? "default");
    if (!output) { res.status(404).json({ error: "Appeal output not found" }); return; }
    res.json({ output });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// POWER OF ATTORNEY
// ═══════════════════════════════════════════════════════════════════════════

router.get("/v1/legal/poa/types", requireAuth, (_req, res) => {
  res.json({ types: getPoaTypes() });
});

router.post("/v1/legal/poa/generate", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const user = (req as any).user;
    const { workerId, caseId, poaType, representativeName, representativeAddress, representativeBarNumber, scope } = req.body;
    if (!workerId || !representativeName) { res.status(400).json({ error: "workerId and representativeName required" }); return; }

    const poa = await generatePoa({
      tenantId: user.tenant_id ?? "default",
      workerId, caseId,
      poaType: poaType ?? "GENERAL",
      representativeName, representativeAddress, representativeBarNumber, scope,
      generatedBy: user.name ?? user.email ?? "unknown",
    });
    res.json({ poa });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/v1/legal/poa/worker/:workerId", requireAuth, requireRole(...EXTENDED_ROLES), async (req, res) => {
  try {
    const user = (req as any).user;
    const poas = await getPoasByWorker(p(req.params.workerId), user.tenant_id ?? "default");
    res.json({ poas });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/v1/legal/poa/:id", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const user = (req as any).user;
    const poa = await getPoaById(p(req.params.id), user.tenant_id ?? "default");
    if (!poa) { res.status(404).json({ error: "POA not found" }); return; }
    res.json({ poa });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/v1/legal/poa/:id/content", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const user = (req as any).user;
    const { content } = req.body;
    if (!content) { res.status(400).json({ error: "content required" }); return; }
    await updatePoaContent(p(req.params.id), user.tenant_id ?? "default", content);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/v1/legal/poa/:id/status", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const user = (req as any).user;
    const { status } = req.body;
    if (!["draft", "reviewed", "signed"].includes(status)) { res.status(400).json({ error: "Invalid status" }); return; }
    await updatePoaStatus(p(req.params.id), user.tenant_id ?? "default", status);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// AUTHORITY RESPONSE DRAFTING
// ═══════════════════════════════════════════════════════════════════════════

router.get("/v1/legal/authority-draft/types", requireAuth, (_req, res) => {
  res.json({ types: getDraftTypes() });
});

router.post("/v1/legal/authority-draft/generate", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const user = (req as any).user;
    const { workerId, caseId, draftType, authorityName, caseReference, specificIssue, additionalContext } = req.body;
    if (!workerId || !specificIssue) { res.status(400).json({ error: "workerId and specificIssue required" }); return; }

    const draft = await generateAuthorityDraft({
      tenantId: user.tenant_id ?? "default",
      workerId, caseId, draftType: draftType ?? "CLARIFICATION_LETTER",
      authorityName, caseReference, specificIssue, additionalContext,
      generatedBy: user.name ?? user.email ?? "unknown",
    });
    res.json({ draft });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/v1/legal/authority-draft/worker/:workerId", requireAuth, requireRole(...EXTENDED_ROLES), async (req, res) => {
  try {
    const user = (req as any).user;
    const drafts = await getDraftsByWorker(p(req.params.workerId), user.tenant_id ?? "default");
    res.json({ drafts });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/v1/legal/authority-draft/:id", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const user = (req as any).user;
    const draft = await getDraftById(p(req.params.id), user.tenant_id ?? "default");
    if (!draft) { res.status(404).json({ error: "Draft not found" }); return; }
    res.json({ draft });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/v1/legal/authority-draft/:id/status", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const user = (req as any).user;
    const { status } = req.body;
    if (!["draft", "reviewed", "approved", "sent"].includes(status)) { res.status(400).json({ error: "Invalid status" }); return; }
    await updateDraftStatus(p(req.params.id), user.tenant_id ?? "default", status);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// LEGAL REASONING PANEL / TIMELINE
// ═══════════════════════════════════════════════════════════════════════════

router.get("/v1/legal/reasoning/:workerId", requireAuth, requireRole(...EXTENDED_ROLES), async (req, res) => {
  try {
    const user = (req as any).user;
    const panel = await getLegalReasoningPanel(p(req.params.workerId), user.tenant_id ?? "default");
    res.json({ panel });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// EVIDENCE & DOCUMENT QUERIES
// ═══════════════════════════════════════════════════════════════════════════

router.get("/v1/legal/evidence/:workerId", requireAuth, requireRole(...EXTENDED_ROLES), async (req, res) => {
  try {
    const user = (req as any).user;
    const evidence = await getWorkerEvidence(p(req.params.workerId), user.tenant_id ?? "default");
    const gaps = analyzeEvidenceGaps(evidence);
    res.json({ evidence, gaps, recommendedTypes: RECOMMENDED_EVIDENCE });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/v1/legal/documents-summary/:workerId", requireAuth, requireRole(...EXTENDED_ROLES), async (req, res) => {
  try {
    const user = (req as any).user;
    const docs = await getWorkerDocumentSummary(p(req.params.workerId), user.tenant_id ?? "default");
    res.json({ documents: docs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// UNIFIED APPROVAL
// ═══════════════════════════════════════════════════════════════════════════

router.post("/v1/legal/approve", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const user = (req as any).user;
    const { entityType, entityId } = req.body;
    const validTypes: ApprovableEntity[] = ["appeal_output", "poa_document", "authority_draft", "research_memo", "authority_pack", "rejection_analysis"];
    if (!validTypes.includes(entityType)) { res.status(400).json({ error: `Invalid entityType. Must be one of: ${validTypes.join(", ")}` }); return; }
    if (!entityId) { res.status(400).json({ error: "entityId required" }); return; }

    const result = await approveEntity(entityType, entityId, user.name ?? user.email ?? "unknown", user.tenant_id ?? "default");
    res.json({ result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// LEGAL BRIEF PIPELINE INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════

router.post("/v1/legal/intelligence/brief/generate", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const user = (req as any).user;
    const { workerId, rejectionText, caseId } = req.body;
    if (!workerId) { res.status(400).json({ error: "workerId required" }); return; }

    const brief = await generateLegalBrief(
      workerId,
      user.tenant_id ?? "default",
      user.name ?? user.email ?? "unknown",
      caseId,
      rejectionText,
    );
    res.json({ brief });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/v1/legal/intelligence/briefs/:workerId", requireAuth, requireRole(...EXTENDED_ROLES), async (req, res) => {
  try {
    const user = (req as any).user;
    const briefs = await getBriefsByWorker(p(req.params.workerId), user.tenant_id ?? "default");
    res.json({ briefs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/v1/legal/intelligence/brief/:id", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const user = (req as any).user;
    const brief = await getBriefById(p(req.params.id), user.tenant_id ?? "default");
    if (!brief) { res.status(404).json({ error: "Brief not found" }); return; }
    res.json({ brief });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// NEXT ACTION ENGINE
// ═══════════════════════════════════════════════════════════════════════════

router.get("/v1/legal/intelligence/worker/:workerId", requireAuth, requireRole(...EXTENDED_ROLES), async (req, res) => {
  try {
    const user = (req as any).user;
    const intel = await getWorkerIntelligence(p(req.params.workerId), user.tenant_id ?? "default");
    res.json({ intelligence: intel });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/v1/legal/intelligence/fleet-signals", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const user = (req as any).user;
    const signals = await getFleetSignals(user.tenant_id ?? "default");
    res.json({ signals });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// INTELLIGENCE SCAN + SNAPSHOTS
// ═══════════════════════════════════════════════════════════════════════════

router.post("/v1/legal/intelligence/scan", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const user = (req as any).user;
    const result = await runIntelligenceScan(user.tenant_id ?? "default");
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/v1/legal/intelligence/snapshots", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const user = (req as any).user;
    const snapshots = await getSnapshots(user.tenant_id ?? "default", 30);
    res.json({ snapshots });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/v1/legal/intelligence/latest-snapshot", requireAuth, requireRole(...EXTENDED_ROLES), async (req, res) => {
  try {
    const user = (req as any).user;
    const snapshot = await getLatestSnapshot(user.tenant_id ?? "default");
    res.json({ snapshot });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ALERT ACKNOWLEDGMENT
// ═══════════════════════════════════════════════════════════════════════════

router.post("/v1/legal/intelligence/acknowledge", requireAuth, requireRole(...EXTENDED_ROLES), async (req, res) => {
  try {
    const user = (req as any).user;
    const { workerId, actionText, caseId, notes } = req.body;
    if (!workerId || !actionText) { res.status(400).json({ error: "workerId and actionText required" }); return; }
    const ack = await acknowledgeAction(
      user.tenant_id ?? "default", workerId, actionText,
      user.name ?? user.email ?? "unknown", caseId, notes,
    );
    res.json({ acknowledgment: ack });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/v1/legal/intelligence/acknowledgments", requireAuth, requireRole(...EXTENDED_ROLES), async (req, res) => {
  try {
    const user = (req as any).user;
    const workerId = req.query.workerId as string | undefined;
    const acks = await getAcknowledgments(user.tenant_id ?? "default", workerId);
    res.json({ acknowledgments: acks });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// RELEASE READINESS
// ═══════════════════════════════════════════════════════════════════════════

router.get("/v1/legal/intelligence/release-check", requireAuth, requireRole("Admin"), async (_req, res) => {
  try {
    const checks = await checkReleaseReadiness();
    const allPass = checks.every(c => c.status !== "fail");
    res.json({ ready: allPass, checks });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// MANAGER READINESS VIEW
// ═══════════════════════════════════════════════════════════════════════════

router.get("/v1/legal/intelligence/manager-view", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const user = (req as any).user;
    const tid = user.tenant_id ?? "default";
    const [signals, snapshot] = await Promise.all([
      getFleetSignals(tid),
      getLatestSnapshot(tid),
    ]);
    res.json({
      signals,
      latestScan: snapshot ?? null,
      topActions: snapshot?.top_actions ?? [],
      riskDistribution: snapshot ? {
        critical: snapshot.critical_risk_count,
        high: snapshot.high_risk_count,
        medium: snapshot.medium_risk_count,
        low: snapshot.low_risk_count,
      } : null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// TRC CASE WORKSPACE
// ═══════════════════════════════════════════════════════════════════════════

router.get("/v1/legal/trc-workspace/:caseId", requireAuth, requireRole(...EXTENDED_ROLES), async (req, res) => {
  try {
    const user = (req as any).user;
    const view = await getTrcCaseView(p(req.params.caseId), user.tenant_id ?? "default");
    res.json({ caseView: view });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/v1/legal/trc-workspace/task/:taskId", requireAuth, requireRole(...EXTENDED_ROLES), async (req, res) => {
  try {
    const user = (req as any).user;
    const { status, notes, linkedDocumentId } = req.body;
    const task = await updateTask(p(req.params.taskId), user.tenant_id ?? "default", { status, notes, linkedDocumentId });
    if (!task) { res.status(404).json({ error: "Task not found" }); return; }
    res.json({ task });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/v1/legal/trc-workspace/:caseId/guidance", requireAuth, requireRole(...EXTENDED_ROLES), async (req, res) => {
  try {
    const user = (req as any).user;
    const { prompt } = req.body;
    if (!prompt) { res.status(400).json({ error: "prompt required" }); return; }
    const result = await getCaseGuidance(p(req.params.caseId), user.tenant_id ?? "default", prompt);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/v1/legal/trc-workspace/:caseId/full-intelligence", requireAuth, requireRole(...EXTENDED_ROLES), async (req, res) => {
  try {
    const user = (req as any).user;
    const result = await getFullCaseIntelligence(p(req.params.caseId), user.tenant_id ?? "default");
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
