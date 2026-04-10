/**
 * Legal Execution Dashboard — prioritized queue for internal legal team.
 * Reads from existing legal_cases, snapshots, and authority_response_packs.
 */

import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { authHeaders, BASE } from "@/lib/api";
import {
  Scale, AlertTriangle, Clock, CheckCircle2, Shield, FileText,
  Filter, ChevronRight, ThumbsUp, Loader2, X, Flame, BookOpen,
} from "lucide-react";

// ═══ TYPES ══════════════════════════════════════════════════════════════════

interface QueueItem {
  worker_id: string;
  worker_name: string;
  case_id: string;
  case_type: string;
  case_status: string;
  legal_status: string | null;
  legal_basis: string | null;
  risk_level: string | null;
  appeal_deadline: string | null;
  days_until_deadline: number | null;
  urgency: "overdue" | "urgent" | "warning" | "normal";
  next_action: string | null;
  authority_pack_status: string | null;
  authority_pack_id: string | null;
  last_updated_at: string;
  priority_score: number;
}

interface QueueResponse {
  items: QueueItem[];
  total: number;
  byUrgency: Record<string, number>;
  byRisk: Record<string, number>;
}

// ═══ DISPLAY HELPERS ════════════════════════════════════════════════════════

const URGENCY_STYLE: Record<string, { bg: string; text: string; border: string; label: string }> = {
  overdue: { bg: "bg-red-500/15", text: "text-red-400", border: "border-red-500/30", label: "OVERDUE" },
  urgent:  { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/20", label: "URGENT" },
  warning: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20", label: "WARNING" },
  normal:  { bg: "bg-slate-800", text: "text-slate-400", border: "border-slate-700", label: "" },
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
  const [filterPack, setFilterPack] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["legal-queue"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/legal/queue`, { headers: authHeaders() });
      if (!res.ok) return { items: [], total: 0, byUrgency: {}, byRisk: {} } as QueueResponse;
      return res.json() as Promise<QueueResponse>;
    },
    refetchInterval: 30_000,
  });

  // Optional sidebar: latest research articles
  const { data: researchData } = useQuery({
    queryKey: ["legal-research-sidebar"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/legal/research/articles`, { headers: authHeaders() });
      if (!res.ok) return { articles: [] };
      return res.json() as Promise<{ articles: Array<{ id: string; title: string; summary: string; created_at: string }> }>;
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (packId: string) => {
      const res = await fetch(`${BASE}/api/v1/legal/authority-pack/${packId}/approve`, {
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
  const articles = (researchData?.articles ?? []).slice(0, 3);

  const filtered = useMemo(() => {
    return items.filter(i => {
      if (filterRisk && i.risk_level !== filterRisk) return false;
      if (filterCase && i.case_type !== filterCase) return false;
      if (filterPack && i.authority_pack_status !== filterPack) return false;
      return true;
    });
  }, [items, filterRisk, filterCase, filterPack]);

  const hasFilters = filterRisk || filterCase || filterPack;

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Scale className="w-7 h-7 text-[#C41E18]" />
          <h1 className="text-3xl font-bold text-white">Legal Execution Queue</h1>
        </div>
        <p className="text-gray-400">Prioritized cases, deadlines, and authority-pack actions</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
        <SummaryCard label="Total" value={data?.total ?? 0} color="text-white" bg="bg-slate-800" />
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
            <select value={filterPack} onChange={e => setFilterPack(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white">
              <option value="">All Packs</option>
              {["DRAFT","REVIEW_REQUIRED","APPROVED"].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            {hasFilters && (
              <button onClick={() => { setFilterRisk(""); setFilterCase(""); setFilterPack(""); }}
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
                      <th className="text-left px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Legal</th>
                      <th className="text-left px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Risk</th>
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
                      const rowBg = item.urgency === "overdue" || item.urgency === "urgent"
                        ? "bg-red-500/5 hover:bg-red-500/10"
                        : item.urgency === "warning"
                          ? "bg-amber-500/5 hover:bg-amber-500/10"
                          : "hover:bg-slate-800/60";
                      return (
                        <tr key={item.case_id} className={`border-b border-slate-800 transition-colors ${rowBg}`}>
                          <td className="px-3 py-2.5 font-medium text-white">{item.worker_name}</td>
                          <td className="px-3 py-2.5">
                            <span className="px-1.5 py-0.5 bg-slate-700/50 rounded text-[10px] font-mono font-bold text-white">{item.case_type}</span>
                            <span className="ml-1.5 text-slate-500">{item.case_status}</span>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="text-slate-300">{item.legal_status ?? "—"}</span>
                            {item.legal_basis && (
                              <span className="ml-1 text-slate-500 text-[10px]">({BASIS_LABELS[item.legal_basis] ?? item.legal_basis})</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            {item.risk_level ? (
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${r.bg} ${r.text}`}>{item.risk_level}</span>
                            ) : <span className="text-slate-600">—</span>}
                          </td>
                          <td className="px-3 py-2.5">
                            {item.appeal_deadline ? (
                              <div className="flex items-center gap-1">
                                {(item.urgency === "overdue" || item.urgency === "urgent") && <Flame className="w-3 h-3 text-red-400" />}
                                <span className={`font-mono font-bold ${u.text}`}>
                                  {item.days_until_deadline !== null
                                    ? item.days_until_deadline < 0
                                      ? `${Math.abs(item.days_until_deadline)}d over`
                                      : `${item.days_until_deadline}d`
                                    : "—"}
                                </span>
                                {item.urgency !== "normal" && (
                                  <span className={`ml-1 text-[9px] font-bold ${u.text}`}>{u.label}</span>
                                )}
                              </div>
                            ) : <span className="text-slate-600">—</span>}
                          </td>
                          <td className="px-3 py-2.5 text-slate-300 max-w-[180px] truncate">{item.next_action ?? "—"}</td>
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
          {/* Packs needing review */}
          {(() => {
            const needsReview = items.filter(i => i.authority_pack_status === "DRAFT" || i.authority_pack_status === "REVIEW_REQUIRED");
            if (needsReview.length === 0) return null;
            return (
              <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="w-4 h-4 text-orange-400" />
                  <span className="text-xs font-bold text-orange-400 uppercase tracking-wider">Packs Need Review</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400">{needsReview.length}</span>
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
                          <ThumbsUp className="w-2.5 h-2.5" />
                          Approve
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

function SummaryCard({ label, value, color, bg }: { label: string; value: number; color: string; bg: string }) {
  return (
    <div className={`rounded-xl p-3 ${bg}`}>
      <p className="text-[10px] text-gray-400 font-mono uppercase mb-0.5">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
