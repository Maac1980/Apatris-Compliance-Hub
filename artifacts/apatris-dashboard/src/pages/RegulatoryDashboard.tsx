/**
 * Regulatory Dashboard — Stage 2: classified, extracted, bilingual updates.
 */

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { authHeaders, BASE } from "@/lib/api";
import {
  Shield, RefreshCw, Loader2, ChevronDown, ChevronUp, ExternalLink,
  AlertTriangle, Scale, Clock, Brain, X,
} from "lucide-react";

const SEVERITY_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  CRITICAL: { label: "Critical", color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
  HIGH:     { label: "High",     color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20" },
  MEDIUM:   { label: "Medium",   color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
  LOW:      { label: "Low",      color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
  NO_IMPACT:{ label: "No Impact",color: "text-slate-500", bg: "bg-slate-800 border-slate-700" },
  critical: { label: "Critical", color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
  warning:  { label: "Warning",  color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
  info:     { label: "Info",     color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
};

const STATUS_STYLE: Record<string, string> = {
  NEW: "bg-blue-500/20 text-blue-400", INGESTED: "bg-emerald-500/20 text-emerald-400",
  DUPLICATE: "bg-slate-600 text-slate-400", ARCHIVED: "bg-slate-700 text-slate-500",
};

const TYPE_LABELS: Record<string, string> = {
  NEW_LAW: "New Law", AMENDMENT: "Amendment", GUIDANCE: "Guidance", COURT_DECISION: "Court Decision",
  ADMINISTRATIVE_CHANGE: "Admin Change", PROCESS_CHANGE: "Process Change", DOCUMENTATION_CHANGE: "Doc Change",
  CONSULTATION: "Consultation", DEADLINE_UPDATE: "Deadline",
};

export default function RegulatoryDashboard() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [showPL, setShowPL] = useState(true);

  const { data, isLoading } = useQuery({
    queryKey: ["reg-updates", statusFilter],
    queryFn: async () => {
      const params = statusFilter ? `?status=${statusFilter}` : "";
      const res = await fetch(`${BASE}api/v1/regulatory/updates${params}`, { headers: authHeaders() });
      if (!res.ok) return { updates: [] };
      return res.json();
    },
  });

  const scanMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}api/v1/regulatory/scan`, { method: "POST", headers: authHeaders() });
      if (!res.ok) throw new Error("Scan failed");
      return res.json();
    },
    onSuccess: (d) => { toast({ description: `Scan: ${d.totalIngested} new, ${d.totalDuplicates} duplicates` }); qc.invalidateQueries({ queryKey: ["reg-updates"] }); },
    onError: (err) => toast({ description: (err as Error).message, variant: "destructive" }),
  });

  const classifyMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${BASE}api/v1/regulatory/updates/${id}/classify`, { method: "POST", headers: authHeaders() });
      if (!res.ok) throw new Error("Classify failed");
      return res.json();
    },
    onSuccess: () => { toast({ description: "Classified + extracted" }); qc.invalidateQueries({ queryKey: ["reg-updates"] }); },
    onError: (err) => toast({ description: (err as Error).message, variant: "destructive" }),
  });

  const updates = data?.updates ?? [];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 overflow-y-auto pb-20">
      <div className="border-b border-slate-800 bg-slate-900/50 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-700/50 border border-slate-600 flex items-center justify-center">
              <Shield className="w-5 h-5 text-slate-300" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">Regulatory Intelligence</h1>
              <p className="text-xs text-slate-500 font-mono uppercase tracking-widest mt-1">Classified · Extracted · Bilingual</p>
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex gap-1">
              <button onClick={() => setShowPL(true)} className={`text-[10px] px-2 py-1 rounded font-bold ${showPL ? "bg-blue-600 text-white" : "bg-slate-700 text-slate-400"}`}>PL</button>
              <button onClick={() => setShowPL(false)} className={`text-[10px] px-2 py-1 rounded font-bold ${!showPL ? "bg-blue-600 text-white" : "bg-slate-700 text-slate-400"}`}>EN</button>
            </div>
            <button onClick={() => scanMutation.mutate()} disabled={scanMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold">
              {scanMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {scanMutation.isPending ? "Scanning..." : "Run Scan"}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-4">
        <div className="flex gap-2">
          {["", "NEW", "INGESTED", "DUPLICATE", "ARCHIVED"].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`text-xs px-3 py-1 rounded font-bold ${statusFilter === s ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"}`}>
              {s || "All"}
            </button>
          ))}
        </div>

        {isLoading ? <div className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin text-slate-500 mx-auto" /></div>
        : updates.length === 0 ? <div className="text-center py-12 text-slate-600"><Shield className="w-10 h-10 mx-auto mb-2 opacity-30" /><p>No updates. Click "Run Scan" to fetch.</p></div>
        : updates.map((u: any) => {
          const sev = SEVERITY_STYLE[u.severity] ?? SEVERITY_STYLE.info;
          const isExpanded = expandedId === u.id;
          const topics: string[] = u.relevant_topics ?? [];
          const confidence = u.confidence_score ?? 0;

          return (
            <div key={u.id} className={`rounded-xl border p-4 ${sev.bg}`}>
              <div className="flex items-start justify-between cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : u.id)}>
                <div className="flex-1 min-w-0">
                  {/* Title + badges */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-white">{u.title || "Untitled"}</span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${STATUS_STYLE[u.status] ?? ""}`}>{u.status}</span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${sev.bg} ${sev.color}`}>{sev.label}</span>
                    {u.update_type && <span className="text-[9px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded font-bold">{TYPE_LABELS[u.update_type] ?? u.update_type}</span>}
                    {u.requires_human_review && <span className="text-[9px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-bold">Review</span>}
                  </div>

                  {/* Meta row */}
                  <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-500">
                    <span>{u.source_name || u.source || "—"}</span>
                    <span>{u.jurisdiction || "PL"}</span>
                    <span>{u.detected_at ? new Date(u.detected_at).toLocaleDateString("pl-PL") : u.fetched_at ? new Date(u.fetched_at).toLocaleDateString("pl-PL") : "—"}</span>
                    {confidence > 0 && <span className={`font-mono ${confidence >= 60 ? "text-emerald-400" : confidence >= 30 ? "text-amber-400" : "text-red-400"}`}>{confidence}%</span>}
                    {u.canonical_url && <a href={u.canonical_url} target="_blank" rel="noopener" onClick={e => e.stopPropagation()} className="text-blue-400 hover:text-blue-300 flex items-center gap-0.5"><ExternalLink className="w-3 h-3" /></a>}
                  </div>

                  {/* Relevance tags */}
                  {topics.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {topics.map((t: string, i: number) => (
                        <span key={i} className="text-[8px] bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded">{t}</span>
                      ))}
                    </div>
                  )}

                  {/* Summary preview */}
                  {(u.summary_pl || u.summary_en || u.summary) && (
                    <p className="text-xs text-slate-400 mt-1.5 line-clamp-2">{showPL ? (u.summary_pl || u.summary || "") : (u.summary_en || u.summary_pl || u.summary || "")}</p>
                  )}
                </div>
                {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-500 flex-shrink-0 ml-2" /> : <ChevronDown className="w-4 h-4 text-slate-500 flex-shrink-0 ml-2" />}
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="mt-3 space-y-3 border-t border-slate-700/30 pt-3">
                  {/* Summary PL/EN */}
                  {(u.summary_pl || u.summary_en) && (
                    <div className="bg-slate-950/50 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-[10px] font-bold text-slate-500 uppercase">Summary ({showPL ? "PL" : "EN"})</p>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">{showPL ? (u.summary_pl || "—") : (u.summary_en || "English not available")}</p>
                    </div>
                  )}

                  {/* Extracted data grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[10px]">
                    {u.authority_name && <div className="bg-slate-900/60 rounded px-2 py-1"><span className="text-slate-500">Authority: </span><span className="text-slate-300">{u.authority_name}</span></div>}
                    {u.publication_date && <div className="bg-slate-900/60 rounded px-2 py-1"><span className="text-slate-500">Published: </span><span className="text-slate-300">{u.publication_date}</span></div>}
                    {u.effective_date && <div className="bg-slate-900/60 rounded px-2 py-1"><span className="text-slate-500">Effective: </span><span className="text-slate-300">{u.effective_date}</span></div>}
                    {u.deadline_date && <div className="bg-red-500/10 rounded px-2 py-1"><span className="text-red-400 font-bold">Deadline: </span><span className="text-red-300">{u.deadline_date}</span></div>}
                    {u.relevance_score > 0 && <div className="bg-slate-900/60 rounded px-2 py-1"><span className="text-slate-500">Relevance: </span><span className="text-slate-300">{u.relevance_score}/100</span></div>}
                  </div>

                  {/* Cited articles */}
                  {u.cited_articles?.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-purple-400 uppercase mb-1">Cited Articles</p>
                      <div className="flex flex-wrap gap-1">{u.cited_articles.map((a: string, i: number) => <span key={i} className="text-[9px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded">{a}</span>)}</div>
                    </div>
                  )}

                  {/* Affected types */}
                  {(u.affected_worker_types?.length > 0 || u.affected_document_types?.length > 0 || u.affected_regions?.length > 0) && (
                    <div className="grid grid-cols-3 gap-2">
                      {u.affected_worker_types?.length > 0 && <div><p className="text-[9px] text-slate-500 mb-0.5">Workers</p>{u.affected_worker_types.map((t: string, i: number) => <span key={i} className="text-[8px] bg-slate-700 text-slate-300 px-1 py-0.5 rounded mr-1">{t}</span>)}</div>}
                      {u.affected_document_types?.length > 0 && <div><p className="text-[9px] text-slate-500 mb-0.5">Documents</p>{u.affected_document_types.map((t: string, i: number) => <span key={i} className="text-[8px] bg-slate-700 text-slate-300 px-1 py-0.5 rounded mr-1">{t}</span>)}</div>}
                      {u.affected_regions?.length > 0 && <div><p className="text-[9px] text-slate-500 mb-0.5">Regions</p>{u.affected_regions.map((t: string, i: number) => <span key={i} className="text-[8px] bg-slate-700 text-slate-300 px-1 py-0.5 rounded mr-1">{t}</span>)}</div>}
                    </div>
                  )}

                  {/* Raw text */}
                  {u.raw_text && (
                    <details className="text-[10px]">
                      <summary className="text-slate-500 cursor-pointer">Raw text</summary>
                      <pre className="mt-1 text-xs text-slate-400 whitespace-pre-wrap font-sans bg-slate-950/50 rounded-lg p-3 max-h-[200px] overflow-y-auto">{u.raw_text.slice(0, 2000)}</pre>
                    </details>
                  )}

                  {/* Reclassify button */}
                  {u.status === "NEW" && (
                    <button onClick={() => classifyMutation.mutate(u.id)} disabled={classifyMutation.isPending}
                      className="flex items-center gap-2 text-xs px-3 py-1.5 rounded bg-purple-600/20 text-purple-400 border border-purple-500/30 hover:bg-purple-600/30 font-bold disabled:opacity-50">
                      {classifyMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Brain className="w-3 h-3" />} Classify & Extract
                    </button>
                  )}

                  {/* Stage 3: Impact + Simulation */}
                  {u.status === "INGESTED" && <ImpactSimPanel updateId={u.id} />}

                  <div className="text-[9px] text-slate-600">Hash: {u.content_hash?.slice(0, 16) ?? "—"} · ID: {u.id?.slice(0, 8)}</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══ IMPACT + SIMULATION PANEL ══════════════════════════════════════════════

const IMPACT_SEV: Record<string, string> = {
  CRITICAL: "bg-red-500/20 text-red-400", HIGH: "bg-orange-500/20 text-orange-400",
  MEDIUM: "bg-amber-500/20 text-amber-400", LOW: "bg-blue-500/20 text-blue-400",
};

const RISK_COLOR: Record<string, string> = {
  CRITICAL: "text-red-400", HIGH: "text-orange-400", MEDIUM: "text-amber-400", LOW: "text-emerald-400",
};

function ImpactSimPanel({ updateId }: { updateId: string }) {
  const [tab, setTab] = useState<"impact" | "simulation">("impact");

  const { data: impactsData } = useQuery({
    queryKey: ["reg-impacts", updateId],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/v1/regulatory/updates/${updateId}/impacts`, { headers: authHeaders() });
      if (!res.ok) return { impacts: [] };
      return res.json();
    },
  });

  const { data: simData } = useQuery({
    queryKey: ["reg-sim", updateId],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/v1/regulatory/updates/${updateId}/simulation`, { headers: authHeaders() });
      if (!res.ok) return null;
      return res.json();
    },
  });

  const impacts = impactsData?.impacts ?? [];
  const sim = simData;

  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        <button onClick={() => setTab("impact")} className={`text-[10px] px-2 py-0.5 rounded font-bold ${tab === "impact" ? "bg-purple-600 text-white" : "bg-slate-700 text-slate-400"}`}>Impact ({impacts.length})</button>
        <button onClick={() => setTab("simulation")} className={`text-[10px] px-2 py-0.5 rounded font-bold ${tab === "simulation" ? "bg-blue-600 text-white" : "bg-slate-700 text-slate-400"}`}>Simulation</button>
      </div>

      {tab === "impact" && (
        <div className="space-y-1.5">
          {impacts.length === 0 ? <p className="text-[10px] text-slate-500">No impact data. Run simulation to generate.</p>
          : impacts.map((imp: any, i: number) => (
            <div key={i} className="bg-slate-900/60 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-bold text-white">{imp.impacted_module?.replace(/_/g, " ")}</span>
                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${IMPACT_SEV[imp.impact_severity] ?? IMPACT_SEV.LOW}`}>{imp.impact_severity}</span>
                <span className="text-[8px] bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded">{imp.impact_type?.replace(/_/g, " ")}</span>
              </div>
              {imp.recommended_change && <p className="text-[10px] text-slate-300 mt-1">{imp.recommended_change}</p>}
              {imp.reasoning && <p className="text-[9px] text-slate-500 mt-0.5">{imp.reasoning}</p>}
            </div>
          ))}
        </div>
      )}

      {tab === "simulation" && sim && (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-slate-900/60 rounded-lg px-3 py-2 text-center">
              <p className="text-[9px] text-slate-500">Workers</p>
              <p className="text-lg font-black text-white">{sim.affected_workers_count ?? 0}</p>
            </div>
            <div className="bg-slate-900/60 rounded-lg px-3 py-2 text-center">
              <p className="text-[9px] text-slate-500">Cases</p>
              <p className="text-lg font-black text-white">{sim.affected_cases_count ?? 0}</p>
            </div>
            <div className="bg-slate-900/60 rounded-lg px-3 py-2 text-center">
              <p className="text-[9px] text-slate-500">Employers</p>
              <p className="text-lg font-black text-white">{sim.affected_employers_count ?? 0}</p>
            </div>
          </div>
          <div className="flex gap-3 text-[10px]">
            <span>Legal Risk: <span className={`font-bold ${RISK_COLOR[sim.legal_risk_level] ?? ""}`}>{sim.legal_risk_level}</span></span>
            <span>Ops Risk: <span className={`font-bold ${RISK_COLOR[sim.operational_risk_level] ?? ""}`}>{sim.operational_risk_level}</span></span>
            <span>Workload: <span className="font-bold text-slate-300">{sim.estimated_workload}</span></span>
          </div>
          {sim.reasoning && <p className="text-[10px] text-slate-400">{sim.reasoning}</p>}
        </div>
      )}

      {tab === "simulation" && !sim && <p className="text-[10px] text-slate-500">No simulation data available.</p>}
    </div>
  );
}
