import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import {
  getGraphStats, getNodesByType, getEdgesFrom, findSimilarCases,
  createNode, createEdge, type NodeType, type EdgeType,
} from "../services/knowledge-graph.service.js";

const router = Router();

const LEGAL_ROLES = ["Admin", "Executive", "LegalHead"];
const VALID_NODE_TYPES: NodeType[] = ["WORKER", "DOCUMENT", "LEGAL_STATUTE", "DECISION", "URZAD", "EMPLOYER", "CASE"];
const VALID_EDGE_TYPES: EdgeType[] = ["HAS", "TRIGGERS", "BASED_ON", "FILED_AT", "RESULTED_IN", "APPLIES_TO", "SIMILAR_TO", "EMPLOYS"];

// GET /api/v1/kg/stats — graph overview
router.get("/v1/kg/stats", requireAuth, async (req, res) => {
  try {
    const stats = await getGraphStats(req.tenantId!);
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/v1/kg/nodes?type=CASE — list nodes by type
router.get("/v1/kg/nodes", requireAuth, async (req, res) => {
  try {
    const nodeType = (req.query.type as string)?.toUpperCase() as NodeType;
    if (!nodeType || !VALID_NODE_TYPES.includes(nodeType)) {
      return res.status(400).json({ error: `type must be one of: ${VALID_NODE_TYPES.join(", ")}` });
    }
    const nodes = await getNodesByType(req.tenantId!, nodeType);
    res.json({ nodes, count: nodes.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/v1/kg/nodes/:id/edges — edges from a node
router.get("/v1/kg/nodes/:id/edges", requireAuth, async (req, res) => {
  try {
    const edges = await getEdgesFrom(req.tenantId!, req.params.id as string);
    res.json({ edges, count: edges.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/v1/kg/patterns/similar — find similar cases (cross-tenant anonymized)
router.get("/v1/kg/patterns/similar", requireAuth, async (req, res) => {
  try {
    const { caseType, nationality, voivodeship } = req.query as Record<string, string>;
    if (!caseType) return res.status(400).json({ error: "caseType required" });
    const matches = await findSimilarCases(
      req.tenantId!,
      caseType,
      nationality || undefined,
      voivodeship || undefined,
    );
    res.json({ matches, count: matches.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// POST /api/v1/kg/nodes — create a node
router.post("/v1/kg/nodes", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const { nodeType, label, properties } = req.body as { nodeType?: string; label?: string; properties?: any };
    if (!nodeType || !VALID_NODE_TYPES.includes(nodeType as NodeType)) {
      return res.status(400).json({ error: `nodeType must be one of: ${VALID_NODE_TYPES.join(", ")}` });
    }
    if (!label) return res.status(400).json({ error: "label required" });
    const node = await createNode(req.tenantId!, nodeType as NodeType, label, properties || {});
    res.status(201).json({ node });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// POST /api/v1/kg/edges — create an edge
router.post("/v1/kg/edges", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const { sourceId, targetId, edgeType, weight, properties } = req.body as {
      sourceId?: string; targetId?: string; edgeType?: string; weight?: number; properties?: any;
    };
    if (!sourceId || !targetId) return res.status(400).json({ error: "sourceId and targetId required" });
    if (!edgeType || !VALID_EDGE_TYPES.includes(edgeType as EdgeType)) {
      return res.status(400).json({ error: `edgeType must be one of: ${VALID_EDGE_TYPES.join(", ")}` });
    }
    const edge = await createEdge(req.tenantId!, sourceId, targetId, edgeType as EdgeType, weight ?? 1.0, properties || {});
    res.status(201).json({ edge });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

export default router;
