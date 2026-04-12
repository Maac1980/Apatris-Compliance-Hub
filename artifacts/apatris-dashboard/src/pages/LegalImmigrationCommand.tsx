/**
 * Legal Immigration Command — unified operator cockpit for all immigration
 * and worker legality tasks. Aggregates existing modules via their APIs.
 */

import React, { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { authHeaders, BASE } from "@/lib/api";
import { DecisionExplanationCard } from "@/components/DecisionExplanationCard";
import { DocumentStructuredIntake } from "@/components/DocumentStructuredIntake";
import {
  Shield, Users, FileText, Gavel, Scale, Brain, Building2, Search,
  AlertTriangle, CheckCircle2, XOctagon, Clock, Loader2, ChevronRight,
  Zap, Stamp, FileCheck, X, Briefcase, ArrowRight,
} from "lucide-react";

// ─── CONSTANTS ──────────────────────────────────────────────────────────────

const TABS = [
  { key: "overview", label: "Overview", icon: Zap },
  { key: "trc", label: "TRC Cases", icon: Stamp },
  { key: "workers-legal", label: "Workers Legal", icon: Users },
  { key: "appeals", label: "Appeals & Rejections", icon: Gavel },
  { key: "documents", label: "Documents", icon: FileText },
  { key: "authority", label: "Authority Drafts", icon: Shield },
  { key: "queue", label: "Legal Queue", icon: Scale },
  { key: "research", label: "Research", icon: Brain },
  { key: "client-view", label: "Client View", icon: Building2 },
] as const;

type TabKey = typeof TABS[number]["key"];

const SEV_BADGE: Record<string, string> = {
  CRITICAL: "bg-red-500/20 text-red-400 border-red-500/30",
  HIGH: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  MEDIUM: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  LOW: "bg-slate-700 text-slate-400 border-slate-600",
};

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-slate-700 text-slate-300",
  submitted: "bg-blue-500/20 text-blue-400",
  under_review: "bg-purple-500/20 text-purple-400",
  approved: "bg-emerald-500/20 text-emerald-400",
  rejected: "bg-red-500/20 text-red-400",
  NEW: "bg-blue-500/20 text-blue-400",
  PENDING: "bg-amber-500/20 text-amber-400",
  REJECTED: "bg-red-500/20 text-red-400",
  APPROVED: "bg-emerald-500/20 text-emerald-400",
  DRAFT: "bg-slate-700 text-slate-300",
  REVIEW_REQUIRED: "bg-purple-500/20 text-purple-400",
};

// ─── HELPERS ────────────────────────────────────────────────────────────────

function daysUntil(d: string | null): number | null {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
}

function expiryZone(d: string | null): string {
  const days = daysUntil(d);
  if (days === null) return "text-slate-500";
  if (days < 0) return "text-red-400 font-bold";
  if (days < 30) return "text-red-400";
  if (days <= 60) return "text-amber-400";
  return "text-emerald-400";
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function Badge({ label, style }: { label: string; style?: string }) {
  return <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${style ?? "bg-slate-700 text-slate-400 border-slate-600"}`}>{label}</span>;
}

function MetricCard({ label, value, color, onClick }: { label: string; value: number; color: string; onClick?: () => void }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag onClick={onClick} className={`bg-slate-900 border border-slate-800 rounded-xl p-3 text-center ${onClick ? "hover:bg-slate-800 cursor-pointer transition-colors" : ""}`}>
      <p className={`text-2xl font-black ${color}`}>{value}</p>
      <p className="text-[9px] text-slate-500 uppercase font-bold tracking-wider mt-0.5">{label}</p>
    </Tag>
  );
}

function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">{title}</h3>
      {count !== undefined && <span className="text-[10px] text-slate-600 font-mono">{count} items</span>}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <div className="text-center py-12 text-slate-600 text-sm">{message}</div>;
}

function Spinner() {
  return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-slate-500" /></div>;
}

// ─── MAIN COMPONENT ─────────────────────────────────────────────────────────

export default function LegalImmigrationCommand() {
  const [tab, setTab] = useState<TabKey>("overview");
  const [search, setSearch] = useState("");
  const [workerFilter, setWorkerFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [urgencyFilter, setUrgencyFilter] = useState("");

  // ── Overview data (aggregator) ──
  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ["lic-overview"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/v1/legal-immigration/overview`, { headers: authHeaders() });
      if (!r.ok) return null;
      return r.json();
    },
    refetchInterval: 60000,
  });

  // ── TRC Cases ──
  const { data: trcData, isLoading: trcLoading } = useQuery({
    queryKey: ["lic-trc"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/trc/cases`, { headers: authHeaders() });
      if (!r.ok) return { cases: [] };
      return r.json();
    },
    enabled: tab === "trc" || tab === "overview",
  });

  // ── Workers Legal ──
  const { data: workersData, isLoading: workersLoading } = useQuery({
    queryKey: ["lic-workers"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/v1/legal-immigration/workers`, { headers: authHeaders() });
      if (!r.ok) return { workers: [] };
      return r.json();
    },
    enabled: tab === "workers-legal" || tab === "overview",
  });

  // ── Legal Cases (appeals/rejections) ──
  const { data: casesData, isLoading: casesLoading } = useQuery({
    queryKey: ["lic-legal-cases"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/v1/legal/cases`, { headers: authHeaders() });
      if (!r.ok) return { cases: [] };
      return r.json();
    },
    enabled: tab === "appeals" || tab === "overview",
  });

  // ── Legal Queue ──
  const { data: queueData, isLoading: queueLoading } = useQuery({
    queryKey: ["lic-queue"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/v1/legal/queue`, { headers: authHeaders() });
      if (!r.ok) return { items: [] };
      return r.json();
    },
    enabled: tab === "queue",
  });

  // ── Authority Packs ──
  const { data: authorityData, isLoading: authorityLoading } = useQuery({
    queryKey: ["lic-authority"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/v1/legal/authority-pack/all`, { headers: authHeaders() });
      if (!r.ok) return [];
      const j = await r.json();
      return j.packs ?? j ?? [];
    },
    enabled: tab === "authority",
  });

  // ── Legal Briefs ──
  const { data: briefsData, isLoading: briefsLoading } = useQuery({
    queryKey: ["lic-briefs"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/v1/legal/briefs`, { headers: authHeaders() });
      if (!r.ok) return [];
      const j = await r.json();
      return j.briefs ?? j ?? [];
    },
    enabled: tab === "research",
  });

  // ── Research Articles ──
  const { data: articlesData, isLoading: articlesLoading } = useQuery({
    queryKey: ["lic-articles"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/v1/legal/research/articles`, { headers: authHeaders() });
      if (!r.ok) return { articles: [] };
      return r.json();
    },
    enabled: tab === "research",
  });

  // ── Client View ──
  const { data: clientData, isLoading: clientLoading } = useQuery({
    queryKey: ["lic-clients"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/v1/legal-immigration/client-view`, { headers: authHeaders() });
      if (!r.ok) return { clients: [] };
      return r.json();
    },
    enabled: tab === "client-view",
  });

  // ── Documents ──
  const { data: docsData, isLoading: docsLoading } = useQuery({
    queryKey: ["lic-documents"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/documents`, { headers: authHeaders() });
      if (!r.ok) return { documents: [] };
      return r.json();
    },
    enabled: tab === "documents",
  });

  // ── Decision Explanation for overview ──
  const { data: overviewExplanation } = useQuery({
    queryKey: ["lic-overview-explanation", overview?.computedAt],
    queryFn: async () => {
      const m = overview!.metrics;
      const r = await fetch(`${BASE}api/v1/decision-explanations/readiness`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({
          workforce: { total: m.totalWorkers, blocked: m.blockedWorkers, deployable: m.totalWorkers - m.blockedWorkers, expiringPermits: m.expiringTRC, expiredPermits: m.expiredTRC, expiringPassports: m.expiringPassports },
          cases: { active: m.activeCases, needingAction: m.rejectedCases, rejected: m.rejectedCases, overdueDeadline: m.overdueDeadlines, approachingDeadline: m.approachingDeadlines, pendingAppeals: m.pendingAppeals },
          bottlenecks: overview!.bottlenecks,
          topActions: overview!.topActions,
        }),
      });
      if (!r.ok) return null;
      return r.json();
    },
    enabled: !!overview && (overview.metrics.blockedWorkers > 0 || overview.metrics.overdueDeadlines > 0 || overview.bottlenecks.length > 0),
  });

  // ── Filter helpers ──
  const q = search.toLowerCase();
  const filterRow = (name: string, status?: string, _urgency?: string) => {
    if (q && !name.toLowerCase().includes(q)) return false;
    if (statusFilter && status !== statusFilter) return false;
    return true;
  };

  const resetFilters = () => { setSearch(""); setWorkerFilter(""); setStatusFilter(""); setUrgencyFilter(""); };

  // ─── RENDER ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 overflow-y-auto pb-20">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-900/50 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#C41E18]/10 border border-[#C41E18]/30 flex items-center justify-center">
            <Shield className="w-5 h-5 text-[#C41E18]" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Legal Immigration Command</h1>
            <p className="text-xs text-slate-500 font-mono uppercase tracking-widest mt-0.5">Unified Operations Workspace</p>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="border-b border-slate-800 bg-slate-900/30 px-6 py-3">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input type="text" placeholder="Search workers, cases..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C41E18]/50" />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="text-xs bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-300">
            <option value="">All Statuses</option>
            <option value="NEW">New</option>
            <option value="PENDING">Pending</option>
            <option value="REJECTED">Rejected</option>
            <option value="APPROVED">Approved</option>
            <option value="draft">Draft</option>
            <option value="submitted">Submitted</option>
          </select>
          {(search || statusFilter || urgencyFilter) && (
            <button onClick={resetFilters} className="flex items-center gap-1 text-xs text-slate-400 hover:text-white px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-700">
              <X className="w-3 h-3" /> Reset
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-800 bg-slate-900/20 px-6">
        <div className="max-w-7xl mx-auto flex overflow-x-auto no-scrollbar">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-[11px] font-bold whitespace-nowrap border-b-2 transition-colors ${
                  tab === t.key ? "border-[#C41E18] text-white" : "border-transparent text-slate-500 hover:text-slate-300"
                }`}>
                <Icon className="w-3.5 h-3.5" /> {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {tab === "overview" && <OverviewTab overview={overview} loading={overviewLoading} explanation={overviewExplanation?.explanation} onTabSwitch={setTab} />}
        {tab === "trc" && <TRCTab cases={trcData?.cases ?? []} loading={trcLoading} filter={filterRow} />}
        {tab === "workers-legal" && <WorkersLegalTab workers={workersData?.workers ?? []} loading={workersLoading} search={q} />}
        {tab === "appeals" && <AppealsTab cases={casesData?.cases ?? []} loading={casesLoading} filter={filterRow} />}
        {tab === "documents" && <DocumentsTab documents={docsData?.documents ?? []} loading={docsLoading} search={q} workers={workersData?.workers ?? []} />}
        {tab === "authority" && <AuthorityTab packs={authorityData ?? []} loading={authorityLoading} search={q} />}
        {tab === "queue" && <QueueTab data={queueData} loading={queueLoading} search={q} />}
        {tab === "research" && <ResearchTab briefs={briefsData ?? []} articles={articlesData?.articles ?? []} loading={briefsLoading || articlesLoading} />}
        {tab === "client-view" && <ClientViewTab clients={clientData?.clients ?? []} loading={clientLoading} />}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 1 — OVERVIEW
// ═══════════════════════════════════════════════════════════════════════════════

function OverviewTab({ overview, loading, explanation, onTabSwitch }: {
  overview: any; loading: boolean; explanation?: any; onTabSwitch: (t: TabKey) => void;
}) {
  if (loading || !overview) return <Spinner />;
  const m = overview.metrics;

  return (
    <div className="space-y-6">
      {/* Decision Explanation */}
      {explanation && explanation.decision !== "PROCEED" && (
        <DecisionExplanationCard explanation={explanation} compact />
      )}

      {/* Metric cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        <MetricCard label="Total Workers" value={m.totalWorkers} color="text-white" />
        <MetricCard label="Blocked" value={m.blockedWorkers} color={m.blockedWorkers > 0 ? "text-red-400" : "text-emerald-400"} onClick={() => onTabSwitch("workers-legal")} />
        <MetricCard label="Expiring TRC" value={m.expiringTRC} color={m.expiringTRC > 0 ? "text-amber-400" : "text-emerald-400"} onClick={() => onTabSwitch("trc")} />
        <MetricCard label="Active Cases" value={m.activeCases} color="text-blue-400" onClick={() => onTabSwitch("appeals")} />
        <MetricCard label="Pending Appeals" value={m.pendingAppeals} color={m.pendingAppeals > 0 ? "text-purple-400" : "text-slate-400"} onClick={() => onTabSwitch("appeals")} />
        <MetricCard label="Overdue Deadlines" value={m.overdueDeadlines} color={m.overdueDeadlines > 0 ? "text-red-400" : "text-emerald-400"} onClick={() => onTabSwitch("appeals")} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard label="Expired TRC" value={m.expiredTRC} color={m.expiredTRC > 0 ? "text-red-400" : "text-slate-400"} />
        <MetricCard label="Expiring Passports" value={m.expiringPassports} color={m.expiringPassports > 0 ? "text-orange-400" : "text-slate-400"} />
        <MetricCard label="Rejected Cases" value={m.rejectedCases} color={m.rejectedCases > 0 ? "text-red-400" : "text-slate-400"} onClick={() => onTabSwitch("appeals")} />
        <MetricCard label="Pending Reviews" value={m.pendingReviews} color={m.pendingReviews > 0 ? "text-blue-400" : "text-slate-400"} onClick={() => onTabSwitch("queue")} />
      </div>

      {/* TRC Summary */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <SectionHeader title="TRC Pipeline" />
        <div className="grid grid-cols-4 gap-3">
          <MetricCard label="Total" value={m.trc.total} color="text-white" onClick={() => onTabSwitch("trc")} />
          <MetricCard label="Draft" value={m.trc.draft} color="text-slate-400" onClick={() => onTabSwitch("trc")} />
          <MetricCard label="Submitted" value={m.trc.submitted} color="text-blue-400" onClick={() => onTabSwitch("trc")} />
          <MetricCard label="Rejected" value={m.trc.rejected} color={m.trc.rejected > 0 ? "text-red-400" : "text-slate-400"} onClick={() => onTabSwitch("trc")} />
        </div>
      </div>

      {/* Bottlenecks + Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {overview.bottlenecks.length > 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <SectionHeader title="Bottlenecks" count={overview.bottlenecks.length} />
            <div className="space-y-2">
              {overview.bottlenecks.map((b: any, i: number) => (
                <button key={i} onClick={() => { const t = b.link?.replace("#", ""); if (t) onTabSwitch(t as TabKey); }}
                  className="w-full flex items-center justify-between py-2 px-3 rounded-lg bg-slate-950/50 hover:bg-slate-800 transition-colors text-left">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className={`w-3.5 h-3.5 ${b.severity === "CRITICAL" ? "text-red-400" : b.severity === "HIGH" ? "text-orange-400" : "text-amber-400"}`} />
                    <span className="text-xs text-slate-300">{b.issue}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white">{b.count}</span>
                    <ChevronRight className="w-3 h-3 text-slate-600" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
        {overview.topActions.length > 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <SectionHeader title="Priority Actions" count={overview.topActions.length} />
            <div className="space-y-2">
              {overview.topActions.map((a: any, i: number) => (
                <button key={i} onClick={() => { if (a.tab) onTabSwitch(a.tab as TabKey); }}
                  className="w-full flex items-center justify-between py-2 px-3 rounded-lg bg-slate-950/50 hover:bg-slate-800 transition-colors text-left">
                  <div className="flex items-center gap-2">
                    <Badge label={a.urgency} style={SEV_BADGE[a.urgency]} />
                    <span className="text-xs text-slate-300">{a.action}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white">{a.count}</span>
                    <ArrowRight className="w-3 h-3 text-slate-600" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 2 — TRC CASES
// ═══════════════════════════════════════════════════════════════════════════════

function TRCTab({ cases, loading, filter }: { cases: any[]; loading: boolean; filter: (n: string, s?: string) => boolean }) {
  if (loading) return <Spinner />;
  const filtered = cases.filter((c: any) => filter(c.worker_name ?? "", c.status));

  return (
    <div className="space-y-3">
      <SectionHeader title="TRC Cases" count={filtered.length} />
      {filtered.length === 0 ? <EmptyState message="No TRC cases found" /> : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-slate-700 bg-slate-800/50">
              <th className="text-left px-3 py-2 text-slate-500 uppercase font-bold">Worker</th>
              <th className="text-left px-3 py-2 text-slate-500 uppercase font-bold">Type</th>
              <th className="text-left px-3 py-2 text-slate-500 uppercase font-bold">Status</th>
              <th className="text-left px-3 py-2 text-slate-500 uppercase font-bold">Voivodeship</th>
              <th className="text-left px-3 py-2 text-slate-500 uppercase font-bold">Employer</th>
              <th className="text-left px-3 py-2 text-slate-500 uppercase font-bold">Expiry</th>
            </tr></thead>
            <tbody>
              {filtered.map((c: any) => (
                <tr key={c.id} className="border-b border-slate-800 hover:bg-slate-800/40">
                  <td className="px-3 py-2.5 text-white font-bold">{c.worker_name ?? "—"}</td>
                  <td className="px-3 py-2.5 text-slate-300">{c.case_type ?? "TRC"}</td>
                  <td className="px-3 py-2.5"><Badge label={(c.status ?? "draft").toUpperCase()} style={STATUS_BADGE[c.status] ?? STATUS_BADGE.draft} /></td>
                  <td className="px-3 py-2.5 text-slate-400">{c.voivodeship ?? "—"}</td>
                  <td className="px-3 py-2.5 text-slate-400">{c.employer_name ?? "—"}</td>
                  <td className={`px-3 py-2.5 font-mono ${expiryZone(c.expiry_date)}`}>{fmtDate(c.expiry_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 3 — WORKERS LEGAL STATUS
// ═══════════════════════════════════════════════════════════════════════════════

function WorkersLegalTab({ workers, loading, search }: { workers: any[]; loading: boolean; search: string }) {
  if (loading) return <Spinner />;
  const filtered = search ? workers.filter((w: any) => (w.full_name ?? "").toLowerCase().includes(search)) : workers;

  return (
    <div className="space-y-3">
      <SectionHeader title="Workers Legal Status" count={filtered.length} />
      {filtered.length === 0 ? <EmptyState message="No workers found" /> : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-slate-700 bg-slate-800/50">
              <th className="text-left px-3 py-2 text-slate-500 uppercase font-bold">Worker</th>
              <th className="text-left px-3 py-2 text-slate-500 uppercase font-bold">Nationality</th>
              <th className="text-left px-3 py-2 text-slate-500 uppercase font-bold">TRC Expiry</th>
              <th className="text-left px-3 py-2 text-slate-500 uppercase font-bold">Passport</th>
              <th className="text-left px-3 py-2 text-slate-500 uppercase font-bold">Work Permit</th>
              <th className="text-left px-3 py-2 text-slate-500 uppercase font-bold">Contract</th>
              <th className="text-left px-3 py-2 text-slate-500 uppercase font-bold">Cases</th>
              <th className="text-left px-3 py-2 text-slate-500 uppercase font-bold">Status</th>
            </tr></thead>
            <tbody>
              {filtered.map((w: any) => {
                const trcDays = daysUntil(w.trc_expiry);
                const blocked = (trcDays !== null && trcDays < 0) || (daysUntil(w.work_permit_expiry) !== null && daysUntil(w.work_permit_expiry)! < 0);
                return (
                  <tr key={w.id} className={`border-b border-slate-800 hover:bg-slate-800/40 ${blocked ? "bg-red-500/5" : ""}`}>
                    <td className="px-3 py-2.5">
                      <p className="text-white font-bold">{w.full_name}</p>
                      <p className="text-slate-500 text-[10px]">{w.specialization ?? ""}{w.assigned_site ? ` · ${w.assigned_site}` : ""}</p>
                    </td>
                    <td className="px-3 py-2.5 text-slate-400">{w.nationality ?? "—"}</td>
                    <td className={`px-3 py-2.5 font-mono ${expiryZone(w.trc_expiry)}`}>{fmtDate(w.trc_expiry)}</td>
                    <td className={`px-3 py-2.5 font-mono ${expiryZone(w.passport_expiry)}`}>{fmtDate(w.passport_expiry)}</td>
                    <td className={`px-3 py-2.5 font-mono ${expiryZone(w.work_permit_expiry)}`}>{fmtDate(w.work_permit_expiry)}</td>
                    <td className={`px-3 py-2.5 font-mono ${expiryZone(w.contract_end_date)}`}>{fmtDate(w.contract_end_date)}</td>
                    <td className="px-3 py-2.5">
                      {(w.active_cases > 0 || w.rejected_cases > 0) ? (
                        <div className="flex gap-1">
                          {w.active_cases > 0 && <Badge label={`${w.active_cases} active`} style="bg-blue-500/20 text-blue-400 border-blue-500/30" />}
                          {w.rejected_cases > 0 && <Badge label={`${w.rejected_cases} rejected`} style="bg-red-500/20 text-red-400 border-red-500/30" />}
                        </div>
                      ) : <span className="text-slate-600">—</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      {blocked
                        ? <Badge label="BLOCKED" style="bg-red-500/20 text-red-400 border-red-500/30" />
                        : trcDays !== null && trcDays <= 30
                          ? <Badge label="EXPIRING" style="bg-amber-500/20 text-amber-400 border-amber-500/30" />
                          : <Badge label="OK" style="bg-emerald-500/20 text-emerald-400 border-emerald-500/30" />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 4 — APPEALS & REJECTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function AppealsTab({ cases, loading, filter }: { cases: any[]; loading: boolean; filter: (n: string, s?: string) => boolean }) {
  if (loading) return <Spinner />;
  const filtered = cases.filter((c: any) => filter(c.worker_name ?? c.full_name ?? "", c.status));

  const rejected = filtered.filter((c: any) => c.status === "REJECTED");
  const appeals = filtered.filter((c: any) => c.case_type === "APPEAL");
  const other = filtered.filter((c: any) => c.status !== "REJECTED" && c.case_type !== "APPEAL");

  return (
    <div className="space-y-6">
      {rejected.length > 0 && (
        <div>
          <SectionHeader title="Rejected Cases" count={rejected.length} />
          <CaseTable rows={rejected} />
        </div>
      )}
      {appeals.length > 0 && (
        <div>
          <SectionHeader title="Pending Appeals" count={appeals.length} />
          <CaseTable rows={appeals} />
        </div>
      )}
      {other.length > 0 && (
        <div>
          <SectionHeader title="Other Active Cases" count={other.length} />
          <CaseTable rows={other} />
        </div>
      )}
      {filtered.length === 0 && <EmptyState message="No legal cases found" />}
    </div>
  );
}

function CaseTable({ rows }: { rows: any[] }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      <table className="w-full text-xs">
        <thead><tr className="border-b border-slate-700 bg-slate-800/50">
          <th className="text-left px-3 py-2 text-slate-500 uppercase font-bold">Worker</th>
          <th className="text-left px-3 py-2 text-slate-500 uppercase font-bold">Type</th>
          <th className="text-left px-3 py-2 text-slate-500 uppercase font-bold">Status</th>
          <th className="text-left px-3 py-2 text-slate-500 uppercase font-bold">Deadline</th>
          <th className="text-left px-3 py-2 text-slate-500 uppercase font-bold">Created</th>
        </tr></thead>
        <tbody>
          {rows.map((c: any) => {
            const deadlineDays = daysUntil(c.appeal_deadline);
            return (
              <tr key={c.id} className="border-b border-slate-800 hover:bg-slate-800/40">
                <td className="px-3 py-2.5 text-white font-bold">{c.worker_name ?? c.full_name ?? "—"}</td>
                <td className="px-3 py-2.5"><Badge label={c.case_type ?? "—"} /></td>
                <td className="px-3 py-2.5"><Badge label={c.status ?? "—"} style={STATUS_BADGE[c.status]} /></td>
                <td className="px-3 py-2.5">
                  {c.appeal_deadline ? (
                    <span className={`font-mono ${deadlineDays !== null && deadlineDays <= 0 ? "text-red-400 font-bold" : deadlineDays !== null && deadlineDays <= 7 ? "text-orange-400" : "text-slate-400"}`}>
                      {fmtDate(c.appeal_deadline)}
                      {deadlineDays !== null && <span className="text-[10px] ml-1">({deadlineDays <= 0 ? `${Math.abs(deadlineDays)}d overdue` : `${deadlineDays}d`})</span>}
                    </span>
                  ) : <span className="text-slate-600">—</span>}
                </td>
                <td className="px-3 py-2.5 text-slate-500 font-mono">{fmtDate(c.created_at)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 5 — DOCUMENTS & EVIDENCE
// ═══════════════════════════════════════════════════════════════════════════════

function DocumentsTab({ documents, loading, search, workers }: { documents: any[]; loading: boolean; search: string; workers: any[] }) {
  const [extraction, setExtraction] = useState<any>(null);
  const [intakeId, setIntakeId] = useState<string | null>(null);
  const [selectedWorkerId, setSelectedWorkerId] = useState("");
  const [extractError, setExtractError] = useState<string | null>(null);
  const [approveResult, setApproveResult] = useState<any>(null);
  const [approveError, setApproveError] = useState<string | null>(null);

  const extractMutation = useMutation({
    mutationFn: async ({ file, fileName, documentType }: { file: File | null; fileName: string; documentType: string }) => {
      // Build multipart FormData for real file upload
      const formData = new FormData();
      if (file) formData.append("file", file);
      else formData.append("fileName", fileName);
      formData.append("documentType", documentType);
      if (selectedWorkerId) formData.append("workerId", selectedWorkerId);

      // Use auth headers WITHOUT Content-Type — browser sets multipart boundary
      const token = localStorage.getItem("apatris_jwt");
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`${BASE}api/v1/document-intelligence/extract`, {
        method: "POST", headers, body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Extraction failed");
      return data;
    },
    onSuccess: (data) => {
      setExtraction(data);
      setIntakeId(data.intake_id ?? null);
      // Auto-select suggested worker if confidence is high enough
      if (data.suggested_worker?.workerId && data.suggested_worker.confidence >= 0.6 && !selectedWorkerId) {
        setSelectedWorkerId(data.suggested_worker.workerId);
      }
      setExtractError(null);
      setApproveResult(null);
      setApproveError(null);
    },
    onError: (err: any) => { setExtractError(err.message); setExtraction(null); setIntakeId(null); },
  });

  const approveMutation = useMutation({
    mutationFn: async (approvedFields: Record<string, string>) => {
      if (!intakeId) throw new Error("No intake record — extract a document first");
      const res = await fetch(`${BASE}api/v1/document-intelligence/approve`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({
          intakeId,
          approvedFields,
          documentType: extraction?.document_type,
          workerId: selectedWorkerId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Approval failed");
      return data;
    },
    onSuccess: (data) => { setApproveResult(data); setApproveError(null); },
    onError: (err: any) => { setApproveError(err.message); },
  });

  const handleExtract = (file: File | null, fileName: string, documentType: string) => {
    extractMutation.mutate({ file, fileName, documentType });
  };

  const handleApprove = (data: Record<string, string>) => {
    approveMutation.mutate(data);
  };

  const filtered = search ? documents.filter((d: any) => ((d.workerName ?? d.worker_name ?? "").toLowerCase().includes(search) || (d.documentType ?? d.document_type ?? "").toLowerCase().includes(search))) : documents;
  const expired = filtered.filter((d: any) => d.status === "EXPIRED" || d.status === "expired");
  const critical = filtered.filter((d: any) => d.status === "RED" || d.status === "critical");

  return (
    <div className="space-y-4">
      {/* Worker context selector + auto-match suggestion */}
      <div className="flex items-center gap-2 flex-wrap">
        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Link to Worker</label>
        <select value={selectedWorkerId} onChange={e => setSelectedWorkerId(e.target.value)}
          className="text-xs bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-300 max-w-xs">
          <option value="">— No worker selected —</option>
          {workers.map((w: any) => <option key={w.id} value={w.id}>{w.full_name}</option>)}
        </select>
        {selectedWorkerId && <span className="text-[9px] text-emerald-400 font-bold">Linked</span>}
        {extraction?.suggested_worker && !selectedWorkerId && (
          <button onClick={() => setSelectedWorkerId(extraction.suggested_worker.workerId)}
            className="text-[10px] text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded px-2 py-0.5 hover:bg-blue-500/20 transition-colors">
            Suggested: {extraction.suggested_worker.displayName} ({Math.round(extraction.suggested_worker.confidence * 100)}%)
          </button>
        )}
        {extraction?.suggested_worker && selectedWorkerId === extraction.suggested_worker.workerId && (
          <span className="text-[9px] text-blue-400 font-bold">Auto-matched</span>
        )}
      </div>

      {/* Structured Document Intake */}
      <DocumentStructuredIntake
        extraction={extraction}
        onExtract={handleExtract}
        onApprove={handleApprove}
        loading={extractMutation.isPending}
        approving={approveMutation.isPending}
        approved={!!approveResult}
      />

      {extractError && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
          <p className="text-xs text-red-400">Extraction failed: {extractError}</p>
        </div>
      )}

      {approveError && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
          <p className="text-xs text-red-400">Approval failed: {approveError}</p>
        </div>
      )}

      {approveResult && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <p className="text-xs text-emerald-400 font-bold">Data confirmed and saved</p>
          </div>
          <p className="text-[10px] text-emerald-400/70 mt-1">
            {approveResult.fieldCount} fields confirmed by {approveResult.confirmedBy} · {approveResult.appliedActions?.length ?? 0} action(s) applied
          </p>
        </div>
      )}

      {/* Existing document list */}
      <SectionHeader title="Documents & Evidence" count={filtered.length} />

      {(expired.length > 0 || critical.length > 0) && (
        <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4">
          <p className="text-xs font-bold text-red-400 uppercase tracking-wider mb-2">
            {expired.length} expired · {critical.length} critical
          </p>
          <p className="text-[11px] text-slate-400">These documents are blocking or at risk of blocking worker legality.</p>
        </div>
      )}

      {loading ? <Spinner /> : filtered.length === 0 ? <EmptyState message="No documents found" /> : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-slate-700 bg-slate-800/50">
              <th className="text-left px-3 py-2 text-slate-500 uppercase font-bold">Worker</th>
              <th className="text-left px-3 py-2 text-slate-500 uppercase font-bold">Document</th>
              <th className="text-left px-3 py-2 text-slate-500 uppercase font-bold">Expiry</th>
              <th className="text-left px-3 py-2 text-slate-500 uppercase font-bold">Status</th>
            </tr></thead>
            <tbody>
              {filtered.slice(0, 100).map((d: any) => (
                <tr key={d.id} className="border-b border-slate-800 hover:bg-slate-800/40">
                  <td className="px-3 py-2.5 text-white">{d.workerName ?? d.worker_name ?? "—"}</td>
                  <td className="px-3 py-2.5 text-slate-300">{d.documentType ?? d.document_type ?? "—"}</td>
                  <td className={`px-3 py-2.5 font-mono ${expiryZone(d.expiryDate ?? d.expiry_date)}`}>{fmtDate(d.expiryDate ?? d.expiry_date)}</td>
                  <td className="px-3 py-2.5"><Badge label={(d.status ?? "—").toUpperCase()} style={STATUS_BADGE[d.status] ?? STATUS_BADGE.draft} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 6 — AUTHORITY DRAFTS
// ═══════════════════════════════════════════════════════════════════════════════

function AuthorityTab({ packs, loading, search }: { packs: any[]; loading: boolean; search: string }) {
  if (loading) return <Spinner />;
  const filtered = search ? packs.filter((p: any) => (p.worker_name ?? "").toLowerCase().includes(search)) : packs;

  return (
    <div className="space-y-3">
      <SectionHeader title="Authority Response Packs" count={filtered.length} />
      {filtered.length === 0 ? <EmptyState message="No authority packs. Generate one from the Legal Intelligence page." /> : (
        <div className="space-y-2">
          {filtered.map((p: any) => (
            <div key={p.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                <Shield className="w-4 h-4 text-slate-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-white">{p.worker_name ?? "Unknown Worker"}</span>
                  <Badge label={p.status ?? "DRAFT"} style={STATUS_BADGE[p.status ?? "DRAFT"]} />
                  {p.is_approved && <Badge label="APPROVED" style="bg-emerald-500/20 text-emerald-400 border-emerald-500/30" />}
                </div>
                <p className="text-[10px] text-slate-500 mt-0.5">{p.legal_basis ?? "—"} · {fmtDate(p.created_at)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 7 — LEGAL QUEUE
// ═══════════════════════════════════════════════════════════════════════════════

function QueueTab({ data, loading, search }: { data: any; loading: boolean; search: string }) {
  if (loading) return <Spinner />;

  // Queue data may come in different shapes depending on the service
  const items: any[] = data?.items ?? data?.queue ?? data?.tasks ?? [];
  const filtered = search ? items.filter((it: any) => JSON.stringify(it).toLowerCase().includes(search)) : items;

  return (
    <div className="space-y-3">
      <SectionHeader title="Legal Review Queue" count={filtered.length} />
      {filtered.length === 0 ? <EmptyState message="No items in the legal queue" /> : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-slate-700 bg-slate-800/50">
              <th className="text-left px-3 py-2 text-slate-500 uppercase font-bold">Item</th>
              <th className="text-left px-3 py-2 text-slate-500 uppercase font-bold">Type</th>
              <th className="text-left px-3 py-2 text-slate-500 uppercase font-bold">Status</th>
              <th className="text-left px-3 py-2 text-slate-500 uppercase font-bold">Due</th>
              <th className="text-left px-3 py-2 text-slate-500 uppercase font-bold">Urgency</th>
            </tr></thead>
            <tbody>
              {filtered.map((it: any, i: number) => (
                <tr key={it.id ?? i} className="border-b border-slate-800 hover:bg-slate-800/40">
                  <td className="px-3 py-2.5 text-white">{it.title ?? it.worker_name ?? it.description ?? `Item ${i + 1}`}</td>
                  <td className="px-3 py-2.5"><Badge label={it.review_type ?? it.type ?? "—"} /></td>
                  <td className="px-3 py-2.5"><Badge label={it.task_status ?? it.status ?? "—"} style={STATUS_BADGE[it.task_status ?? it.status]} /></td>
                  <td className={`px-3 py-2.5 font-mono ${expiryZone(it.due_date)}`}>{fmtDate(it.due_date)}</td>
                  <td className="px-3 py-2.5"><Badge label={it.urgency ?? it.severity ?? "—"} style={SEV_BADGE[it.urgency ?? it.severity]} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 8 — RESEARCH & BRIEFING
// ═══════════════════════════════════════════════════════════════════════════════

function ResearchTab({ briefs, articles, loading }: { briefs: any[]; articles: any[]; loading: boolean }) {
  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      {/* Legal Briefs */}
      <div>
        <SectionHeader title="Legal Briefs" count={briefs.length} />
        {briefs.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-center">
            <Brain className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-sm text-slate-500">No legal briefs generated yet.</p>
            <p className="text-xs text-slate-600 mt-1">Use the Legal Brief Generator to create case analysis briefs.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {briefs.slice(0, 20).map((b: any) => (
              <div key={b.id} className={`bg-slate-900 border rounded-xl p-4 ${b.status === "HALTED" ? "border-red-500/20" : b.status === "COMPLETE" ? "border-emerald-500/20" : "border-slate-800"}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-bold text-white">{b.worker_name ?? b.workerName ?? "—"}</span>
                  <Badge label={b.status ?? "—"} style={b.status === "HALTED" ? "bg-red-500/20 text-red-400 border-red-500/30" : b.status === "COMPLETE" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : STATUS_BADGE.PENDING} />
                  {b.overall_confidence != null && <span className="text-[10px] text-slate-500 font-mono">{Math.round((b.overall_confidence ?? 0) * 100)}%</span>}
                </div>
                <p className="text-[10px] text-slate-500">{b.halt_reason ?? ""} {fmtDate(b.created_at)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Research Articles */}
      <div>
        <SectionHeader title="Research Articles" count={articles.length} />
        {articles.length === 0 ? (
          <EmptyState message="No research articles. Use Legal Intelligence to run searches." />
        ) : (
          <div className="space-y-2">
            {articles.slice(0, 20).map((a: any) => (
              <div key={a.id} className="bg-slate-900 border border-slate-800 rounded-xl p-3">
                <p className="text-xs font-bold text-white">{a.title ?? a.article ?? "Research"}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">{a.summary ?? a.explanation ?? ""}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 9 — CLIENT SERVICE VIEW
// ═══════════════════════════════════════════════════════════════════════════════

function ClientViewTab({ clients, loading }: { clients: any[]; loading: boolean }) {
  if (loading) return <Spinner />;

  return (
    <div className="space-y-3">
      <SectionHeader title="Client / Employer Service View" count={clients.length} />
      <p className="text-[11px] text-slate-500 -mt-2 mb-3">Internal view grouped by employer/site. Shows worker legality status per client.</p>

      {clients.length === 0 ? <EmptyState message="No employer data available" /> : (
        <div className="space-y-3">
          {clients.map((c: any, i: number) => {
            const total = c.total_workers ?? 0;
            const blocked = c.blocked ?? 0;
            const expiring = c.expiring ?? 0;
            const ok = c.ok ?? 0;
            const blockedPct = total > 0 ? Math.round((blocked / total) * 100) : 0;

            return (
              <div key={i} className={`bg-slate-900 border rounded-xl p-4 ${blocked > 0 ? "border-red-500/20" : "border-slate-800"}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-slate-400" />
                    <span className="text-sm font-bold text-white">{c.employer}</span>
                  </div>
                  <span className="text-xs text-slate-500">{total} workers</span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-lg p-2 text-center">
                    <p className="text-lg font-black text-emerald-400">{ok}</p>
                    <p className="text-[9px] text-emerald-400/60 uppercase font-bold">OK</p>
                  </div>
                  <div className="bg-amber-500/5 border border-amber-500/10 rounded-lg p-2 text-center">
                    <p className="text-lg font-black text-amber-400">{expiring}</p>
                    <p className="text-[9px] text-amber-400/60 uppercase font-bold">Expiring</p>
                  </div>
                  <div className="bg-red-500/5 border border-red-500/10 rounded-lg p-2 text-center">
                    <p className="text-lg font-black text-red-400">{blocked}</p>
                    <p className="text-[9px] text-red-400/60 uppercase font-bold">Blocked</p>
                  </div>
                </div>

                {/* Status bar */}
                {total > 0 && (
                  <div className="mt-2 h-1.5 w-full bg-slate-800 rounded-full overflow-hidden flex">
                    {ok > 0 && <div className="h-full bg-emerald-500" style={{ width: `${(ok / total) * 100}%` }} />}
                    {expiring > 0 && <div className="h-full bg-amber-500" style={{ width: `${(expiring / total) * 100}%` }} />}
                    {blocked > 0 && <div className="h-full bg-red-500" style={{ width: `${blockedPct}%` }} />}
                  </div>
                )}

                {blocked > 0 && (
                  <p className="text-[10px] text-red-400 mt-2">
                    {blocked} worker(s) blocked — expired permits need immediate attention
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
