/**
 * Legal Knowledge Graph — interactive force-directed graph visualization.
 * Nodes colored by type. Click to see connections. Filter by type.
 */

import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { authHeaders, BASE } from "@/lib/api";
import {
  Network, ArrowLeft, Filter, Loader2, ZoomIn, ZoomOut,
  Users, FileText, Scale, Gavel, Building2, Briefcase, Shield,
  ChevronRight, X,
} from "lucide-react";

// ═══ TYPES ══════════════════════════════════════════════════════════════════

interface GNode {
  id: string;
  node_type: string;
  label: string;
  properties: Record<string, any>;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface GEdge {
  id: string;
  source_id: string;
  target_id: string;
  edge_type: string;
  weight: number;
  target_label: string;
  target_type: string;
}

const NODE_STYLE: Record<string, { color: string; fill: string; icon: React.ElementType; label: string }> = {
  WORKER:        { color: "#3B82F6", fill: "#3B82F620", icon: Users,     label: "Worker" },
  DOCUMENT:      { color: "#10B981", fill: "#10B98120", icon: FileText,  label: "Document" },
  CASE:          { color: "#F97316", fill: "#F9731620", icon: Scale,     label: "Case" },
  LEGAL_STATUTE: { color: "#8B5CF6", fill: "#8B5CF620", icon: Shield,    label: "Statute" },
  DECISION:      { color: "#EF4444", fill: "#EF444420", icon: Gavel,     label: "Decision" },
  URZAD:         { color: "#F59E0B", fill: "#F59E0B20", icon: Building2, label: "Urząd" },
  EMPLOYER:      { color: "#06B6D4", fill: "#06B6D420", icon: Briefcase, label: "Employer" },
};

const EDGE_COLORS: Record<string, string> = {
  HAS: "#ffffff15", TRIGGERS: "#EF444430", BASED_ON: "#8B5CF630",
  FILED_AT: "#F59E0B30", RESULTED_IN: "#10B98130", APPLIES_TO: "#3B82F630",
  SIMILAR_TO: "#06B6D430", EMPLOYS: "#F9731630",
};

// ═══ FORCE SIMULATION (simple spring model) ════════════════════════════════

function simulate(nodes: GNode[], edges: { source: string; target: string }[], iterations: number = 80): void {
  const k = 120; // ideal distance
  for (let iter = 0; iter < iterations; iter++) {
    const cooling = 1 - iter / iterations;
    // Repulsion between all nodes
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[j].x - nodes[i].x;
        const dy = nodes[j].y - nodes[i].y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const force = (k * k) / dist * cooling * 0.5;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        nodes[i].x -= fx; nodes[i].y -= fy;
        nodes[j].x += fx; nodes[j].y += fy;
      }
    }
    // Attraction along edges
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    for (const e of edges) {
      const s = nodeMap.get(e.source);
      const t = nodeMap.get(e.target);
      if (!s || !t) continue;
      const dx = t.x - s.x;
      const dy = t.y - s.y;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const force = (dist - k) * 0.05 * cooling;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      s.x += fx; s.y += fy;
      t.x -= fx; t.y -= fy;
    }
  }
}

// ═══ COMPONENT ══════════════════════════════════════════════════════════════

export default function LegalGraph() {
  const [filterType, setFilterType] = useState("");
  const [selectedNode, setSelectedNode] = useState<GNode | null>(null);
  const [zoom, setZoom] = useState(1);
  const svgRef = useRef<SVGSVGElement>(null);

  // Fetch all nodes
  const { data: allNodesData, isLoading } = useQuery({
    queryKey: ["graph-all-nodes"],
    queryFn: async () => {
      const types = ["WORKER", "DOCUMENT", "CASE", "LEGAL_STATUTE", "DECISION", "URZAD", "EMPLOYER"];
      const results: any[] = [];
      for (const t of types) {
        try {
          const r = await fetch(`${BASE}api/v1/kg/nodes?type=${t}`, { headers: authHeaders() });
          if (r.ok) { const d = await r.json(); results.push(...(d.nodes ?? [])); }
        } catch { /* skip */ }
      }
      return results;
    },
  });

  // Fetch edges for selected node
  const { data: edgesData } = useQuery({
    queryKey: ["graph-edges", selectedNode?.id],
    queryFn: async () => {
      if (!selectedNode) return { edges: [] };
      const r = await fetch(`${BASE}api/v1/kg/nodes/${selectedNode.id}/edges`, { headers: authHeaders() });
      if (!r.ok) return { edges: [] };
      return r.json();
    },
    enabled: !!selectedNode,
  });

  // Build graph layout
  const { nodes, edgeLines } = useMemo(() => {
    const raw = allNodesData ?? [];
    const filtered = filterType ? raw.filter((n: any) => n.node_type === filterType) : raw;

    const gNodes: GNode[] = filtered.map((n: any, i: number) => ({
      ...n,
      x: 400 + Math.cos(i * 2.4) * (150 + Math.random() * 100),
      y: 300 + Math.sin(i * 2.4) * (150 + Math.random() * 100),
      vx: 0, vy: 0,
    }));

    // Collect edges from selected node edges
    const edges = (edgesData?.edges ?? []).map((e: any) => ({
      source: selectedNode?.id ?? "", target: e.target_id ?? e.id,
    }));

    if (gNodes.length > 1) simulate(gNodes, edges, Math.min(gNodes.length * 3, 100));

    return { nodes: gNodes, edgeLines: edges };
  }, [allNodesData, filterType, edgesData, selectedNode]);

  const selectedEdges = edgesData?.edges ?? [];
  const nodeMap = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);

  const typeCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const n of allNodesData ?? []) c[n.node_type] = (c[n.node_type] ?? 0) + 1;
    return c;
  }, [allNodesData]);

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <a href="/legal-immigration?tab=vault" className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white hover:border-slate-600 transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </a>
        <Network className="w-7 h-7 text-cyan-400" />
        <div>
          <h1 className="text-2xl font-bold text-white">Legal Knowledge Graph</h1>
          <p className="text-sm text-slate-400">{(allNodesData ?? []).length} nodes — click any node to explore connections</p>
        </div>
      </div>

      {/* Filter + legend */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Filter className="w-4 h-4 text-slate-500" />
        {Object.entries(NODE_STYLE).map(([type, cfg]) => (
          <button key={type} onClick={() => setFilterType(filterType === type ? "" : type)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all ${
              filterType === type ? "border-current" : "border-slate-700 hover:border-slate-600"
            }`} style={{ color: cfg.color }}>
            <span className="w-2 h-2 rounded-full" style={{ background: cfg.color }} />
            {cfg.label} ({typeCounts[type] ?? 0})
          </button>
        ))}
        {filterType && (
          <button onClick={() => setFilterType("")} className="text-[10px] text-slate-400 hover:text-white underline">Clear</button>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => setZoom(z => Math.max(0.3, z - 0.2))} className="p-1 bg-slate-800 rounded border border-slate-700 text-slate-400 hover:text-white">
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="text-[10px] text-slate-500 w-8 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(z => Math.min(3, z + 0.2))} className="p-1 bg-slate-800 rounded border border-slate-700 text-slate-400 hover:text-white">
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Graph canvas */}
        <div className="lg:col-span-3 bg-slate-900 border border-slate-700 rounded-xl overflow-hidden" style={{ minHeight: 500 }}>
          {isLoading ? (
            <div className="flex items-center justify-center h-[500px]">
              <Loader2 className="w-8 h-8 animate-spin text-[#C41E18]" />
            </div>
          ) : nodes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[500px] text-slate-500">
              <Network className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-sm font-semibold">No graph nodes yet</p>
              <p className="text-xs mt-1">Upload documents and create cases to build the graph</p>
            </div>
          ) : (
            <svg ref={svgRef} viewBox="0 0 800 600" className="w-full h-[500px]"
              style={{ transform: `scale(${zoom})`, transformOrigin: "center" }}>
              {/* Edges */}
              {selectedNode && selectedEdges.map((e: any, i: number) => {
                const target = nodeMap.get(e.target_id ?? e.id);
                if (!target || !selectedNode) return null;
                return (
                  <line key={i}
                    x1={selectedNode.x} y1={selectedNode.y}
                    x2={target.x} y2={target.y}
                    stroke={EDGE_COLORS[e.edge_type] ?? "#ffffff10"} strokeWidth={1.5}
                  />
                );
              })}

              {/* Nodes */}
              {nodes.map(n => {
                const style = NODE_STYLE[n.node_type] ?? NODE_STYLE.WORKER;
                const isSelected = selectedNode?.id === n.id;
                const r = isSelected ? 18 : 12;
                return (
                  <g key={n.id} onClick={() => setSelectedNode(isSelected ? null : n)} className="cursor-pointer">
                    <circle cx={n.x} cy={n.y} r={r + 4} fill={isSelected ? style.color + "30" : "transparent"} />
                    <circle cx={n.x} cy={n.y} r={r} fill={style.fill} stroke={style.color}
                      strokeWidth={isSelected ? 2.5 : 1} />
                    <text x={n.x} y={n.y + r + 12} textAnchor="middle"
                      fill={isSelected ? "#fff" : "#94a3b8"} fontSize={isSelected ? 10 : 8} fontWeight={isSelected ? 700 : 400}>
                      {n.label.length > 20 ? n.label.slice(0, 18) + "…" : n.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          )}
        </div>

        {/* Node detail panel */}
        <div>
          {selectedNode ? (
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ background: NODE_STYLE[selectedNode.node_type]?.color ?? "#fff" }} />
                  <span className="text-[10px] font-bold text-slate-400 uppercase">{selectedNode.node_type}</span>
                </div>
                <button onClick={() => setSelectedNode(null)} className="p-1 text-slate-500 hover:text-white"><X className="w-3.5 h-3.5" /></button>
              </div>
              <h3 className="text-sm font-bold text-white mb-2">{selectedNode.label}</h3>

              {/* Properties */}
              <div className="space-y-1 mb-4">
                {Object.entries(selectedNode.properties ?? {}).filter(([k]) => !k.startsWith("_")).slice(0, 10).map(([key, val]) => (
                  <div key={key} className="flex items-center justify-between text-[10px]">
                    <span className="text-slate-500">{key}</span>
                    <span className="text-slate-300 font-mono truncate max-w-[120px]">{String(val)}</span>
                  </div>
                ))}
              </div>

              {/* Connections */}
              <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                Connections ({selectedEdges.length})
              </p>
              <div className="space-y-1 max-h-[300px] overflow-y-auto">
                {selectedEdges.map((e: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-[10px] p-1.5 rounded bg-slate-800/50">
                    <span className="text-slate-500 font-mono">{e.edge_type}</span>
                    <ChevronRight className="w-2.5 h-2.5 text-slate-600" />
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: NODE_STYLE[e.target_type]?.color ?? "#fff" }} />
                    <span className="text-slate-300 truncate">{e.target_label}</span>
                  </div>
                ))}
                {selectedEdges.length === 0 && (
                  <p className="text-[10px] text-slate-600">No outgoing connections</p>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 text-center">
              <Network className="w-8 h-8 mx-auto mb-2 text-slate-600" />
              <p className="text-xs text-slate-500">Click a node to explore</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
