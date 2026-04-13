/**
 * Legal Execution Dashboard — 8-stage case pipeline with blockers + SLA tracking.
 * Reads from legal_cases (8 stages), snapshots, and authority_response_packs.
 */

import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { authHeaders, BASE } from "@/lib/api";
import {
  Scale, AlertTriangle, Clock, CheckCircle2, Shield, FileText,
  Filter, ChevronRight, ThumbsUp, Loader2, X, Flame, BookOpen,
  Ban, AlertOctagon, ArrowRight, Timer,
} from "lucide-react";

// ═══ TYPES ══════════════════════════════════════════════════════════════════

const PIPELINE_STAGES = [
  "NEW", "DOCS_PENDING", "READY_TO_FILE", "FILED",
  "UNDER_REVIEW", "DEFECT_NOTICE", "DECISION_RECEIVED",
  "APPROVED", "REJECTED",
] as const;

type CaseStatus = (typeof PIPELINE_STAGES)[number];

interface QueueItem {
  worker_id: string;
  worker_name: string;
  case_id: string;
  case_type: string;
  case_status: CaseStatus;
  legal_status: string | null;
  legal_basis: string | null;
  risk_level: string | null;
  appeal_deadline: string | null;
  days_until_deadline: number | null;
  urgency: "overdue" | "urgent" | "warning" | "normal";
  next_action: string | null;
  authority_pack_status: string | null;
  authority_pack_id: string | null;
  blocker_type: "HARD" | "SOFT" | "NONE";
  blocker_reason: string | null;
  days_in_stage: number;
  sla_breached: boolean;
  sla_deadline: string | null;
  last_updated_at: string;
  priority_score: number;
}

interface QueueResponse {
  items: QueueItem[];
  total: number;
  byUrgency: Record<string, number>;
  byRisk: Record<string, number>;
}

interface PipelineCounts {
  pipeline: Record<CaseStatus, number>;
}

// ═══ DISPLAY HELPERS ════════════════════════════════════════════════════════

const STAGE_CONFIG: Record<CaseStatus, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  NEW:               { label: "New",         color: "text-slate-300", bg: "bg-slate-700",       icon: FileText },
  DOCS_PENDING:      { label: "Docs",        color: "text-amber-400", bg: "bg-amber-500/15",    icon: Clock },
  READY_TO_FILE:     { label: "Ready",       color: "text-blue-400",  bg: "bg-blue-500/15",     icon: CheckCircle2 },
  FILED:             { label: "Filed",       color: "text-cyan-400",  bg: "bg-cyan-500/15",     icon: Shield },
  UNDER_REVIEW:      { label: "Review",      color: "text-violet-400",bg: "bg-violet-500/15",   icon: Scale },
  DEFECT_NOTICE:     { label: "Defect",      color: "text-red-400",   bg: "bg-red-500/15",      icon: AlertOctagon },
  DECISION_RECEIVED: { label: "Decision",    color: "text-orange-400",bg: "bg-orange-500/15",   icon: FileText },
  APPROVED:          { label: "Approved",    color: "text-emerald-400",bg: "bg-emerald-500/15", icon: CheckCircle2 },
  REJECTED:          { label: "Rejected",    color: "text-red-400",   bg: "bg-red-500/15",      icon: Ban },
};

const URGENCY_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  overdue: { bg: "bg-red-500/15", text: "text-red-400", label: "OVERDUE" },
  urgent:  { bg: "bg-red-500/10", text: "text-red-400", label: "URGENT" },
  warning: { bg: "bg-amber-500/10", text: "text-amber-400", label: "WARNING" },
  normal:  { bg: "bg-slate-800", text: "text-slate-400", label: "" },
};

const RISK_STYLE: Record<string, { text: string; bg: string }> = {
  CRITICAL: { text: "text-red-400", bg: "bg-red-500/10" },
  HIGH:     { text: "text-orange-400", bg: "bg-orange-500/10" },
  MEDIUM:   { text: "text-amber-400", bg: "bg-amber-500/10" },
  LOW:      { text: "text-emerald-400", bg: "bg-emerald-500/10" },
};

const PACK_STYLE: Record<string, { text: string; bg: string }> = {
  DRAFT:           { text: "text-slate-300", bg: "bg-slate-700/50" },
  REVIEW_REQUIRED: { text: "text-orange-400", bg: "bg-orange-500/10" },
  APPROVED:        { text: "text-emerald-400", bg: "bg-emerald-500/10" },
  ARCHIVED:        { text: "text-slate-500", bg: "bg-slate-800" },
};

const BASIS_LABELS: Record<string, string> = {
  PERMIT_VALID: "Permit", ART_108: "Art.108", SPECUSTAWA_UKR: "CUKR",
  REVIEW_REQUIRED: "Review", NO_LEGAL_BASIS: "None",
};

// ═══ COMPONENT ══════════════════════════════════════════════════════════════

export default function LegalQueue() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filterRisk, setFilterRisk] = useState("");
  const [filterCase, setFilterCase] = useState("");
  const [filterStage, setFilterStage] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["legal-queue"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/v1/legal/queue`, { headers: authHeaders() });
      if (!res.ok) return { items: [], total: 0, byUrgency: {}, byRisk: {} } as QueueResponse;
      return res.json() as Promise<QueueResponse>;
    },
    refetchInterval: 30_000,
  });

  const { data: pipelineData } = useQuery({
    queryKey: ["legal-pipeline"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/v1/legal/cases/pipeline`, { headers: authHeaders() });
      if (!res.ok) return { pipeline: {} } as PipelineCounts;
      return res.json() as Promise<PipelineCounts>;
    },
    refetchInterval: 30_000,
  });

  const { data: researchData } = useQuery({
    queryKey: ["legal-research-sidebar"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/v1/legal/research/articles`, { headers: authHeaders() });
      if (!res.ok) return { articles: [] };
      return res.json() as Promise<{ articles: Array<{ id: string; title: string; summary: string; created_at: string }> }>;
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (packId: string) => {
      const res = await fetch(`${BASE}api/v1/legal/authority-pack/${packId}/approve`, {
        method: "POST", headers: authHeaders(),
      });
      if (!res.ok) throw new Error("Approval failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["legal-queue"] });
      toast({ description: "Pack approved" });
    },
    onError: (err) => toast({ description: (err as Error).message, variant: "destructive" }),
  });

  const items = data?.items ?? [];
  const byUrgency = data?.byUrgency ?? {};
  const byRisk = data?.byRisk ?? {};
  const pipeline = pipelineData?.pipeline ?? {};
  const articles = (researchData?.articles ?? []).slice(0, 3);

  const filtered = useMemo(() => {
    return items.filter(i => {
      if (filterRisk && i.risk_level !== filterRisk) return false;
      if (filterCase && i.case_type !== filterCase) return false;
      if (filterStage && i.case_status !== filterStage) return false;
      return true;
    });
  }, [items, filterRisk, filterCase, filterStage]);

  const hasFilters = filterRisk || filterCase || filterStage;
  const hardBlocked = items.filter(i => i.blocker_type === "HARD").length;
  const slaBreached = items.filter(i => i.sla_breached).length;

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Scale className="w-7 h-7 text-[#C41E18]" />
          <h1 className="text-3xl font-bold text-white">Legal Execution Queue</h1>
        </div>
        <p className="text-gray-400">8-stage case pipeline with blockers, SLA tracking, and urgency priority</p>
      </div>

      {/* ── Pipeline visualization ──────────────────────────────────── */}
      <div className="mb-6 bg-slate-900 border border-slate-700 rounded-xl p-4">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3">Case Pipeline</p>
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {PIPELINE_STAGES.filter(s => s !== "APPROVED" && s !== "REJECTED").map((stage, idx) => {
            const cfg = STAGE_CONFIG[stage];
            const count = pipeline[stage] ?? 0;
            return (
              <React.Fragment key={stage}>
                {idx > 0 && <ArrowRight className="w-3 h-3 text-slate-600 flex-shrink-0" />}
                <button
                  onClick={() => setFilterStage(filterStage === stage ? "" : stage)}
                  className={`flex-shrink-0 px-3 py-2 rounded-lg border text-center transition-all ${
                    filterStage === stage
                      ? `${cfg.bg} border-current ${cfg.color}`
                      : "border-slate-700 hover:border-slate-600"
                  }`}
                >
                  <p className={`text-lg font-bold ${count > 0 ? cfg.color : "text-slate-600"}`}>{count}</p>
                  <p className="text-[9px] text-slate-400 font-mono uppercase">{cfg.label}</p>
                </button>
              </React.Fragment>
            );
          })}
          <div className="flex-shrink-0 ml-2 flex gap-1">
            {(["APPROVED", "REJECTED"] as const).map(stage => {
              const cfg = STAGE_CONFIG[stage];
              const count = pipeline[stage] ?? 0;
              return (
                <button key={stage}
                  onClick={() => setFilterStage(filterStage === stage ? "" : stage)}
                  className={`px-3 py-2 rounded-lg border text-center transition-all ${
                    filterStage === stage ? `${cfg.bg} border-current ${cfg.color}` : "border-slate-700 hover:border-slate-600"
                  }`}
                >
                  <p className={`text-lg font-bold ${count > 0 ? cfg.color : "text-slate-600"}`}>{count}</p>
                  <p className="text-[9px] text-slate-400 font-mono uppercase">{cfg.label}</p>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-8 gap-3 mb-6">
        <SummaryCard label="Total" value={data?.total ?? 0} color="text-white" bg="bg-slate-800" />
        <SummaryCard label="Hard Blocked" value={hardBlocked} color="text-red-400" bg="bg-red-500/10 border border-red-500/20" icon={<Ban className="w-3 h-3" />} />
        <SummaryCard label="SLA Breached" value={slaBreached} color="text-orange-400" bg="bg-orange-500/10 border border-orange-500/20" icon={<Timer className="w-3 h-3" />} />
        <SummaryCard label="Overdue" value={byUrgency.overdue ?? 0} color="text-red-400" bg="bg-red-500/10 border border-red-500/20" />
        <SummaryCard label="Urgent (≤3d)" value={byUrgency.urgent ?? 0} color="text-red-400" bg="bg-red-500/10 border border-red-500/20" />
        <SummaryCard label="Warning (≤7d)" value={byUrgency.warning ?? 0} color="text-amber-400" bg="bg-amber-500/10 border border-amber-500/20" />
        <SummaryCard label="Critical Risk" value={byRisk.CRITICAL ?? 0} color="text-red-400" bg="bg-red-900/20 border border-red-800/30" />
        <SummaryCard label="High Risk" value={byRisk.HIGH ?? 0} color="text-orange-400" bg="bg-orange-500/10 border border-orange-500/20" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* ── Main queue table ──────────────────────────────────────── */}
        <div className="lg:col-span-3">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <Filter className="w-4 h-4 text-slate-500" />
            <select value={filterRisk} onChange={e => setFilterRisk(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white">
              <option value="">All Risk</option>
              {["CRITICAL","HIGH","MEDIUM","LOW"].map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <select value={filterCase} onChange={e => setFilterCase(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white">
              <option value="">All Types</option>
              {["TRC","APPEAL","PR","CITIZENSHIP"].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={filterStage} onChange={e => setFilterStage(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white">
              <option value="">All Stages</option>
              {PIPELINE_STAGES.map(s => <option key={s} value={s}>{STAGE_CONFIG[s].label}</option>)}
            </select>
            {hasFilters && (
              <button onClick={() => { setFilterRisk(""); setFilterCase(""); setFilterStage(""); }}
                className="text-xs text-slate-400 hover:text-white underline">Clear</button>
            )}
          </div>

          {isLoading ? (
            <div className="flex justify-center py-20">
              <div className="animate-spin w-8 h-8 border-2 border-[#C41E18] border-t-transparent rounded-full" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 text-slate-500">
              <Scale className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-lg font-semibold">No items in queue</p>
              <p className="text-sm mt-1">{hasFilters ? "Try adjusting filters" : "Create legal cases to populate the queue"}</p>
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-700 bg-slate-800/50">
                      <th className="text-left px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Worker</th>
                      <th className="text-left px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Case</th>
                      <th className="text-left px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Stage</th>
                      <th className="text-left px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Blocker</th>
                      <th className="text-left px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Risk</th>
                      <th className="text-left px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">SLA</th>
                      <th className="text-left px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Deadline</th>
                      <th className="text-left px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Next Action</th>
                      <th className="text-left px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Pack</th>
                      <th className="px-3 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(item => {
                      const u = URGENCY_STYLE[item.urgency] ?? URGENCY_STYLE.normal;
                      const r = RISK_STYLE[item.risk_level ?? ""] ?? { text: "text-slate-400", bg: "bg-slate-700/30" };
                      const p = PACK_STYLE[item.authority_pack_status ?? ""] ?? null;
                      const stg = STAGE_CONFIG[item.case_status] ?? STAGE_CONFIG.NEW;
                      const isBlocked = item.blocker_type === "HARD";
                      const rowBg = isBlocked
                        ? "bg-red-500/5 hover:bg-red-500/10"
                        : item.sla_breached
                          ? "bg-orange-500/5 hover:bg-orange-500/10"
                          : item.urgency === "overdue" || item.urgency === "urgent"
                            ? "bg-red-500/5 hover:bg-red-500/10"
                            : item.urgency === "warning"
                              ? "bg-amber-500/5 hover:bg-amber-500/10"
                              : "hover:bg-slate-800/60";
                      return (
                        <tr key={item.case_id} className={`border-b border-slate-800 transition-colors ${rowBg}`}>
                          <td className="px-3 py-2.5 font-medium text-white">{item.worker_name}</td>
                          <td className="px-3 py-2.5">
                            <span className="px-1.5 py-0.5 bg-slate-700/50 rounded text-[10px] font-mono font-bold text-white">{item.case_type}</span>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${stg.bg} ${stg.color}`}>
                              {stg.label}
                            </span>
                            <span className="ml-1 text-slate-600 text-[10px]">
                              {Math.round(item.days_in_stage ?? 0)}d
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            {item.blocker_type === "HARD" ? (
                              <span className="flex items-center gap-1 px-1.5 py-0.5 bg-red-500/15 rounded text-[10px] font-bold text-red-400">
                                <Ban className="w-2.5 h-2.5" /> BLOCKED
                              </span>
                            ) : item.blocker_type === "SOFT" ? (
                              <span className="flex items-center gap-1 px-1.5 py-0.5 bg-amber-500/10 rounded text-[10px] font-bold text-amber-400">
                                <AlertTriangle className="w-2.5 h-2.5" /> WARN
                              </span>
                            ) : (
                              <span className="text-slate-600 text-[10px]">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            {item.risk_level ? (
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${r.bg} ${r.text}`}>{item.risk_level}</span>
                            ) : <span className="text-slate-600">—</span>}
                          </td>
                          <td className="px-3 py-2.5">
                            {item.sla_breached ? (
                              <span className="flex items-center gap-1 text-[10px] font-bold text-orange-400">
                                <Timer className="w-2.5 h-2.5" /> BREACH
                              </span>
                            ) : item.sla_deadline ? (
                              <span className="text-[10px] text-slate-400">
                                {Math.max(0, Math.ceil((new Date(item.sla_deadline).getTime() - Date.now()) / 86_400_000))}d left
                              </span>
                            ) : <span className="text-slate-600 text-[10px]">—</span>}
                          </td>
                          <td className="px-3 py-2.5">
                            {item.appeal_deadline ? (
                              <div className="flex items-center gap-1">
                                {(item.urgency === "overdue" || item.urgency === "urgent") && <Flame className="w-3 h-3 text-red-400" />}
                                <span className={`font-mono font-bold text-[10px] ${u.text}`}>
                                  {item.days_until_deadline !== null
                                    ? item.days_until_deadline < 0
                                      ? `${Math.abs(item.days_until_deadline)}d over`
                                      : `${item.days_until_deadline}d`
                                    : "—"}
                                </span>
                                {item.urgency !== "normal" && (
                                  <span className={`ml-0.5 text-[9px] font-bold ${u.text}`}>{u.label}</span>
                                )}
                              </div>
                            ) : <span className="text-slate-600 text-[10px]">—</span>}
                          </td>
                          <td className="px-3 py-2.5 text-slate-300 max-w-[150px] truncate text-[10px]">{item.next_action ?? "—"}</td>
                          <td className="px-3 py-2.5">
                            {p ? (
                              <div className="flex items-center gap-1">
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${p.bg} ${p.text}`}>
                                  {item.authority_pack_status}
                                </span>
                                {(item.authority_pack_status === "DRAFT" || item.authority_pack_status === "REVIEW_REQUIRED") && item.authority_pack_id && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); approveMutation.mutate(item.authority_pack_id!); }}
                                    disabled={approveMutation.isPending}
                                    className="p-0.5 text-emerald-400 hover:text-emerald-300 disabled:opacity-50"
                                    title="Approve"
                                  >
                                    <ThumbsUp className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            ) : <span className="text-slate-600 text-[10px]">No pack</span>}
                          </td>
                          <td className="px-3 py-2.5">
                            <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* ── Sidebar ───────────────────────────────────────────────── */}
        <div className="space-y-4">
          {/* Hard blockers */}
          {(() => {
            const blocked = items.filter(i => i.blocker_type === "HARD");
            if (blocked.length === 0) return null;
            return (
              <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Ban className="w-4 h-4 text-red-400" />
                  <span className="text-xs font-bold text-red-400 uppercase tracking-wider">Deployment Blocked</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/10 text-red-400">{blocked.length}</span>
                </div>
                <div className="space-y-2">
                  {blocked.slice(0, 5).map(item => (
                    <div key={item.case_id} className="text-xs">
                      <span className="text-white font-medium">{item.worker_name}</span>
                      <span className="text-slate-500 ml-1">{item.case_type}</span>
                      <p className="text-red-400/70 text-[10px] mt-0.5">{item.blocker_reason}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* SLA breaches */}
          {(() => {
            const breached = items.filter(i => i.sla_breached);
            if (breached.length === 0) return null;
            return (
              <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Timer className="w-4 h-4 text-orange-400" />
                  <span className="text-xs font-bold text-orange-400 uppercase tracking-wider">SLA Breached</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400">{breached.length}</span>
                </div>
                <div className="space-y-2">
                  {breached.slice(0, 5).map(item => (
                    <div key={item.case_id} className="flex items-center justify-between text-xs">
                      <div>
                        <span className="text-white font-medium">{item.worker_name}</span>
                        <span className="text-slate-500 ml-1">{STAGE_CONFIG[item.case_status]?.label}</span>
                      </div>
                      <span className="text-orange-400 font-mono text-[10px]">{Math.round(item.days_in_stage)}d</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Packs needing review */}
          {(() => {
            const needsReview = items.filter(i => i.authority_pack_status === "DRAFT" || i.authority_pack_status === "REVIEW_REQUIRED");
            if (needsReview.length === 0) return null;
            return (
              <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="w-4 h-4 text-violet-400" />
                  <span className="text-xs font-bold text-violet-400 uppercase tracking-wider">Packs Need Review</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400">{needsReview.length}</span>
                </div>
                <div className="space-y-2">
                  {needsReview.slice(0, 5).map(item => (
                    <div key={item.case_id} className="flex items-center justify-between text-xs">
                      <div>
                        <span className="text-white font-medium">{item.worker_name}</span>
                        <span className="text-slate-500 ml-1">{item.case_type}</span>
                      </div>
                      {item.authority_pack_id && (
                        <button
                          onClick={() => approveMutation.mutate(item.authority_pack_id!)}
                          disabled={approveMutation.isPending}
                          className="flex items-center gap-1 px-2 py-0.5 bg-emerald-600/20 text-emerald-400 rounded text-[10px] font-bold hover:bg-emerald-600/30 disabled:opacity-50"
                        >
                          <ThumbsUp className="w-2.5 h-2.5" /> Approve
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Latest research alerts */}
          {articles.length > 0 && (
            <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
              <div className="flex items-center gap-2 mb-3">
                <BookOpen className="w-4 h-4 text-blue-400" />
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Legal Research</span>
              </div>
              <div className="space-y-2">
                {articles.map((a: any) => (
                  <div key={a.id} className="text-xs">
                    <p className="text-white font-medium leading-tight">{(a.title ?? "").slice(0, 60)}</p>
                    <p className="text-slate-500 text-[10px] mt-0.5 font-mono">
                      {new Date(a.created_at).toLocaleDateString("en-GB")}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, color, bg, icon }: { label: string; value: number; color: string; bg: string; icon?: React.ReactNode }) {
  return (
    <div className={`rounded-xl p-3 ${bg}`}>
      <div className="flex items-center gap-1 mb-0.5">
        {icon}
        <p className="text-[10px] text-gray-400 font-mono uppercase">{label}</p>
      </div>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
