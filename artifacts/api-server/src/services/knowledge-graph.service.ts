/**
 * Knowledge Graph Service — JSONB-backed relational graph for legal pattern memory.
 *
 * Nodes: WORKER, DOCUMENT, LEGAL_STATUTE, DECISION, URZAD, EMPLOYER, CASE
 * Edges: HAS, TRIGGERS, BASED_ON, FILED_AT, RESULTED_IN, APPLIES_TO, SIMILAR_TO
 *
 * Enables: "find similar cases" by matching node properties.
 * Auto-populated on case status changes.
 * Cross-tenant anonymized pattern search for SaaS advantage.
 */

import { query, queryOne, execute } from "../lib/db.js";

// ═══ TYPES ══════════════════════════════════════════════════════════════════

export type NodeType = "WORKER" | "DOCUMENT" | "LEGAL_STATUTE" | "DECISION" | "URZAD" | "EMPLOYER" | "CASE";
export type EdgeType = "HAS" | "TRIGGERS" | "BASED_ON" | "FILED_AT" | "RESULTED_IN" | "APPLIES_TO" | "SIMILAR_TO" | "EMPLOYS";

export interface KGNode {
  id: string;
  tenant_id: string;
  node_type: NodeType;
  label: string;
  properties: Record<string, any>;
  created_at: string;
}

export interface KGEdge {
  id: string;
  tenant_id: string;
  source_id: string;
  target_id: string;
  edge_type: EdgeType;
  weight: number;
  properties: Record<string, any>;
  created_at: string;
}

export interface PatternMatch {
  caseNodeId: string;
  label: string;
  similarity: number;
  properties: Record<string, any>;
  outcome: string | null;
  voivodeship: string | null;
  daysToDecision: number | null;
}

// ═══ NODE OPERATIONS ════════════════════════════════════════════════════════

export async function createNode(
  tenantId: string,
  nodeType: NodeType,
  label: string,
  properties: Record<string, any> = {},
): Promise<KGNode> {
  const row = await queryOne<KGNode>(
    `INSERT INTO kg_nodes (tenant_id, node_type, label, properties)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [tenantId, nodeType, label, JSON.stringify(properties)]
  );
  if (!row) throw new Error("Failed to create KG node");
  return row;
}

export async function findNodeByRef(
  tenantId: string,
  nodeType: NodeType,
  refKey: string,
  refValue: string,
): Promise<KGNode | null> {
  return queryOne<KGNode>(
    `SELECT * FROM kg_nodes WHERE tenant_id = $1 AND node_type = $2 AND properties->>$3 = $4`,
    [tenantId, nodeType, refKey, refValue]
  );
}

export async function getNodesByType(tenantId: string, nodeType: NodeType): Promise<KGNode[]> {
  return query<KGNode>(
    "SELECT * FROM kg_nodes WHERE tenant_id = $1 AND node_type = $2 ORDER BY created_at DESC",
    [tenantId, nodeType]
  );
}

// ═══ EDGE OPERATIONS ════════════════════════════════════════════════════════

export async function createEdge(
  tenantId: string,
  sourceId: string,
  targetId: string,
  edgeType: EdgeType,
  weight: number = 1.0,
  properties: Record<string, any> = {},
): Promise<KGEdge> {
  // Upsert: if edge already exists, update weight and properties
  const row = await queryOne<KGEdge>(
    `INSERT INTO kg_edges (tenant_id, source_id, target_id, edge_type, weight, properties)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (tenant_id, source_id, target_id, edge_type)
     DO UPDATE SET weight = $5, properties = $6, created_at = NOW()
     RETURNING *`,
    [tenantId, sourceId, targetId, edgeType, weight, JSON.stringify(properties)]
  );
  if (!row) throw new Error("Failed to create KG edge");
  return row;
}

export async function getEdgesFrom(tenantId: string, nodeId: string): Promise<(KGEdge & { target_label: string; target_type: NodeType })[]> {
  return query(
    `SELECT e.*, n.label AS target_label, n.node_type AS target_type
     FROM kg_edges e JOIN kg_nodes n ON e.target_id = n.id
     WHERE e.tenant_id = $1 AND e.source_id = $2
     ORDER BY e.weight DESC`,
    [tenantId, nodeId]
  );
}

export async function getEdgesTo(tenantId: string, nodeId: string): Promise<(KGEdge & { source_label: string; source_type: NodeType })[]> {
  return query(
    `SELECT e.*, n.label AS source_label, n.node_type AS source_type
     FROM kg_edges e JOIN kg_nodes n ON e.source_id = n.id
     WHERE e.tenant_id = $1 AND e.target_id = $2
     ORDER BY e.weight DESC`,
    [tenantId, nodeId]
  );
}

// ═══ PATTERN SEARCH — "Find similar cases" ══════════════════════════════

export async function findSimilarCases(
  tenantId: string,
  caseType: string,
  nationality?: string,
  voivodeship?: string,
  limit: number = 10,
): Promise<PatternMatch[]> {
  // Search CASE nodes with matching properties
  let sql = `
    SELECT n.id AS "caseNodeId", n.label, n.properties,
      COALESCE(
        (SELECT e.properties->>'outcome' FROM kg_edges e
         WHERE e.source_id = n.id AND e.edge_type = 'RESULTED_IN' LIMIT 1),
        n.properties->>'outcome'
      ) AS outcome,
      n.properties->>'voivodeship' AS voivodeship,
      (n.properties->>'days_to_decision')::int AS "daysToDecision"
    FROM kg_nodes n
    WHERE n.node_type = 'CASE'
      AND n.properties->>'case_type' = $1
  `;
  const params: any[] = [caseType];
  let idx = 2;

  if (nationality) {
    params.push(nationality);
    sql += ` AND n.properties->>'nationality' = $${idx++}`;
  }
  if (voivodeship) {
    params.push(voivodeship);
    sql += ` AND n.properties->>'voivodeship' = $${idx++}`;
  }

  // Cross-tenant anonymized: search ALL tenants but strip worker PII
  sql += ` ORDER BY n.created_at DESC LIMIT $${idx}`;
  params.push(limit);

  const rows = await query<any>(sql, params);

  return rows.map(r => {
    // Strip PII for cross-tenant results
    const props = { ...r.properties };
    if (props.tenant_id !== tenantId) {
      delete props.worker_name;
      delete props.worker_id;
      props.anonymized = true;
    }
    // Compute rough similarity score
    let similarity = 50;
    if (nationality && props.nationality === nationality) similarity += 20;
    if (voivodeship && props.voivodeship === voivodeship) similarity += 20;
    if (r.outcome) similarity += 10;

    return {
      caseNodeId: r.caseNodeId,
      label: r.label,
      similarity: Math.min(100, similarity),
      properties: props,
      outcome: r.outcome,
      voivodeship: r.voivodeship,
      daysToDecision: r.daysToDecision,
    };
  });
}

// ═══ AUTO-POPULATE ON CASE STATUS CHANGE ════════════════════════════════

export async function recordCaseInGraph(
  tenantId: string,
  caseId: string,
  workerId: string,
  caseType: string,
  status: string,
  extra: Record<string, any> = {},
): Promise<void> {
  // Find or create CASE node
  let caseNode = await findNodeByRef(tenantId, "CASE", "case_id", caseId);
  if (!caseNode) {
    caseNode = await createNode(tenantId, "CASE", `${caseType} Case`, {
      case_id: caseId,
      worker_id: workerId,
      case_type: caseType,
      status,
      ...extra,
    });
  } else {
    // Update properties
    await execute(
      `UPDATE kg_nodes SET properties = properties || $1::jsonb WHERE id = $2`,
      [JSON.stringify({ status, ...extra }), caseNode.id]
    );
  }

  // Find or create WORKER node
  let workerNode = await findNodeByRef(tenantId, "WORKER", "worker_id", workerId);
  if (!workerNode) {
    workerNode = await createNode(tenantId, "WORKER", `Worker ${workerId.slice(0, 8)}`, {
      worker_id: workerId,
    });
  }

  // WORKER → HAS → CASE
  await createEdge(tenantId, workerNode.id, caseNode.id, "HAS", 1.0, { relationship: "has_case" });

  // On terminal status, record outcome edge
  if (status === "APPROVED" || status === "REJECTED") {
    const decisionNode = await createNode(tenantId, "DECISION", `${status} — ${caseType}`, {
      outcome: status,
      decided_at: new Date().toISOString(),
      ...extra,
    });
    await createEdge(tenantId, caseNode.id, decisionNode.id, "RESULTED_IN", 1.0, { outcome: status });

    // Update case node with outcome and days to decision
    const caseProps = caseNode.properties ?? {};
    const createdAt = caseProps.created_at ? new Date(caseProps.created_at) : new Date();
    const daysToDecision = Math.round((Date.now() - createdAt.getTime()) / 86_400_000);
    await execute(
      `UPDATE kg_nodes SET properties = properties || $1::jsonb WHERE id = $2`,
      [JSON.stringify({ outcome: status, days_to_decision: daysToDecision }), caseNode.id]
    );
  }
}

// ═══ GRAPH STATS ════════════════════════════════════════════════════════

export async function getGraphStats(tenantId: string): Promise<{
  totalNodes: number;
  totalEdges: number;
  byNodeType: Record<string, number>;
  byEdgeType: Record<string, number>;
}> {
  const nodeCount = await queryOne<{ count: string }>("SELECT COUNT(*) AS count FROM kg_nodes WHERE tenant_id = $1", [tenantId]);
  const edgeCount = await queryOne<{ count: string }>("SELECT COUNT(*) AS count FROM kg_edges WHERE tenant_id = $1", [tenantId]);
  const nodeTypes = await query<{ node_type: string; count: string }>(
    "SELECT node_type, COUNT(*) AS count FROM kg_nodes WHERE tenant_id = $1 GROUP BY node_type", [tenantId]);
  const edgeTypes = await query<{ edge_type: string; count: string }>(
    "SELECT edge_type, COUNT(*) AS count FROM kg_edges WHERE tenant_id = $1 GROUP BY edge_type", [tenantId]);

  const byNodeType: Record<string, number> = {};
  for (const r of nodeTypes) byNodeType[r.node_type] = Number(r.count);
  const byEdgeType: Record<string, number> = {};
  for (const r of edgeTypes) byEdgeType[r.edge_type] = Number(r.count);

  return {
    totalNodes: Number(nodeCount?.count ?? 0),
    totalEdges: Number(edgeCount?.count ?? 0),
    byNodeType,
    byEdgeType,
  };
}
