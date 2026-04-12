/**
 * Legal Immigration Command — unified operator cockpit for all immigration
 * and worker legality tasks. Aggregates existing modules via their APIs.
 */

import React, { useState, useMemo, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { authHeaders, BASE } from "@/lib/api";
import { DecisionExplanationCard } from "@/components/DecisionExplanationCard";
import { DocumentStructuredIntake } from "@/components/DocumentStructuredIntake";
import { useLocation } from "wouter";
import {
  Shield, Users, FileText, Gavel, Scale, Brain, Building2, Search,
  AlertTriangle, CheckCircle2, XOctagon, Clock, Loader2, ChevronRight,
  Zap, Stamp, FileCheck, X, Briefcase, ArrowRight, Bell, Send, CalendarClock,
  PanelRightOpen, PanelRightClose, ExternalLink, Globe, BookOpen, ScanSearch,
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

// ── Legal navigation panel items ────────────────────────────────────────────
// Items that are internal tabs use `tab`, items that are standalone pages use `route`
const LEGAL_NAV = [
  { id: "section-command", label: "COMMAND CENTER", section: true },
  { id: "overview",        label: "Overview",               icon: Zap,           tab: "overview" as TabKey },
  { id: "workers-legal",   label: "Workers Legal",          icon: Users,         tab: "workers-legal" as TabKey },
  { id: "trc",             label: "TRC Cases",              icon: Stamp,         tab: "trc" as TabKey },
  { id: "documents",       label: "Documents / AI Intake",  icon: FileText,      tab: "documents" as TabKey },
  { id: "appeals",         label: "Appeals & Rejections",   icon: Gavel,         tab: "appeals" as TabKey },
  { id: "authority",       label: "Authority Drafts",       icon: Shield,        tab: "authority" as TabKey },
  { id: "queue",           label: "Legal Queue",            icon: Scale,         tab: "queue" as TabKey },
  { id: "research",        label: "Research",               icon: Brain,         tab: "research" as TabKey },
  { id: "client-view",     label: "Client View",            icon: Building2,     tab: "client-view" as TabKey },

  { id: "section-tools", label: "LEGAL TOOLS", section: true },
  { id: "cmd-center",     label: "Command Center",         icon: Zap,           route: "/command-center" },
  { id: "imm-search",     label: "Immigration Search",     icon: ScanSearch,    route: "/immigration-search" },
  { id: "imm-permits",    label: "Immigration Permits",    icon: Stamp,         route: "/immigration" },

  { id: "section-modules", label: "LEGAL MODULES", section: true },
  { id: "legal-monitor",  label: "Legal Monitor",          icon: Shield,        route: "/legal" },
  { id: "legal-alerts",   label: "Legal Alerts",           icon: AlertTriangle, route: "/legal-alerts" },
  { id: "legal-docs",     label: "Legal Documents",        icon: FileText,      route: "/legal-documents" },
  { id: "legal-intel",    label: "Legal Intelligence",     icon: Brain,         route: "/legal-intelligence" },
  { id: "legal-brief",    label: "Legal Briefs",           icon: BookOpen,      route: "/legal-brief" },
  { id: "legal-kb",       label: "Knowledge Base",         icon: Globe,         route: "/legal-kb" },
] as const;

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
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<TabKey>(() => {
    const p = new URLSearchParams(window.location.search);
    const t = p.get("tab");
    return TABS.some(tb => tb.key === t) ? (t as TabKey) : "overview";
  });
  const [navOpen, setNavOpen] = useState(false);

  // Update URL when tab changes
  React.useEffect(() => {
    const url = tab === "overview" ? "/legal-immigration" : `/legal-immigration?tab=${tab}`;
    if (window.location.pathname + window.location.search !== url) window.history.replaceState(null, "", url);
  }, [tab]);
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

      {/* Content + Right Nav */}
      <div className="max-w-[1600px] mx-auto flex">
        {/* Main content */}
        <div className={`flex-1 min-w-0 px-6 py-6 transition-all ${navOpen ? "mr-0" : ""}`}>
          {tab === "overview" && <OverviewTab overview={overview} loading={overviewLoading} explanation={overviewExplanation?.explanation} onTabSwitch={setTab} />}
          {tab === "trc" && <TRCTab cases={trcData?.cases ?? []} loading={trcLoading} filter={filterRow} />}
          {tab === "workers-legal" && <WorkersLegalTab workers={workersData?.workers ?? []} loading={workersLoading} search={q} />}
          {tab === "appeals" && <AppealsTab cases={casesData?.cases ?? []} loading={casesLoading} filter={filterRow} />}
          {tab === "documents" && <DocumentsTab documents={docsData?.documents ?? []} loading={docsLoading} search={q} workers={workersData?.workers ?? []} />}
          {tab === "authority" && <AuthorityTab packs={authorityData ?? []} loading={authorityLoading} search={q} />}
          {tab === "queue" && <QueueTab data={queueData} loading={queueLoading} search={q} />}
          {tab === "research" && <ResearchTab briefs={briefsData ?? []} articles={articlesData?.articles ?? []} loading={briefsLoading || articlesLoading} />}
          {tab === "client-view" && <ClientViewTab />}
        </div>

        {/* ── Legal Navigation Panel (right side) ──────────────────────────── */}
        <div className={`flex-shrink-0 border-l border-slate-800 bg-slate-900/40 transition-all overflow-hidden ${navOpen ? "w-56" : "w-10"}`}>
          {/* Toggle button */}
          <button
            onClick={() => setNavOpen(!navOpen)}
            className="w-full flex items-center justify-center py-3 text-slate-500 hover:text-white transition-colors border-b border-slate-800"
            title={navOpen ? "Collapse legal nav" : "Expand legal nav"}
          >
            {navOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
          </button>

          {navOpen && (
            <nav className="py-2 overflow-y-auto" style={{ maxHeight: "calc(100vh - 180px)" }}>
              {LEGAL_NAV.map(item => {
                if ("section" in item && item.section) {
                  return (
                    <p key={item.id} className="px-3 pt-3 pb-1 text-[9px] font-bold text-slate-600 uppercase tracking-widest">
                      {item.label}
                    </p>
                  );
                }
                const Icon = (item as any).icon;
                const isTab = "tab" in item;
                const isActive = isTab && tab === (item as any).tab;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      if (isTab) { setTab((item as any).tab); }
                      else { navigate((item as any).route); }
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-[11px] transition-colors ${
                      isActive
                        ? "text-white bg-[#C41E18]/10 border-r-2 border-[#C41E18]"
                        : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                    }`}
                  >
                    {Icon && <Icon className="w-3.5 h-3.5 flex-shrink-0" />}
                    <span className="truncate">{item.label}</span>
                    {!isTab && <ExternalLink className="w-2.5 h-2.5 ml-auto flex-shrink-0 opacity-40" />}
                  </button>
                );
              })}
            </nav>
          )}
        </div>
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
  const [mosLoading, setMosLoading] = useState<string | null>(null);
  const [mosResult, setMosResult] = useState<Record<string, any>>({});

  const generateMOS = useCallback(async (workerId: string) => {
    setMosLoading(workerId);
    try {
      const res = await fetch(`${BASE}api/workers/${workerId}/mos-package`, {
        method: "POST", headers: authHeaders(),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error((d as any).error ?? "Failed"); }
      const pkg = await res.json();
      setMosResult(prev => ({ ...prev, [workerId]: pkg }));
    } catch (err) {
      setMosResult(prev => ({ ...prev, [workerId]: { error: err instanceof Error ? err.message : "Failed" } }));
    } finally {
      setMosLoading(null);
    }
  }, []);

  const downloadMOSPdf = useCallback(async (pkg: any) => {
    const { default: jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");
    const norm = (s: string) => (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\u0142/g, "l").replace(/\u0141/g, "L");
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const W = doc.internal.pageSize.getWidth();

    // Header
    doc.setFontSize(16); doc.setFont("helvetica", "bold");
    doc.text("MOS 2026 Readiness Package", W / 2, 18, { align: "center" });
    doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(120);
    doc.text(`${norm(pkg.workerName)} — Generated ${new Date(pkg.generatedAt).toLocaleDateString("en-GB")}`, W / 2, 24, { align: "center" });
    doc.text(`Readiness: ${pkg.mosReadiness.toUpperCase()} | Status: ${pkg.legalStatus} | Risk: ${pkg.riskLevel}`, W / 2, 29, { align: "center" });

    // Employer + Worker
    doc.setDrawColor(200); doc.line(14, 33, W - 14, 33);
    doc.setFontSize(10); doc.setTextColor(0); doc.setFont("helvetica", "bold");
    doc.text("Annex 1 — Employer & Worker Data", 14, 39);

    autoTable(doc, {
      startY: 42, margin: { left: 14, right: 14 },
      head: [["Field", "Value"]],
      body: [
        ["Employer", `${pkg.annex.employer.name} (NIP: ${pkg.annex.employer.nip})`],
        ["Worker", norm(pkg.annex.worker.fullName)],
        ["Nationality", pkg.annex.worker.nationality ?? "—"],
        ["Passport", pkg.annex.worker.passportNumber ?? "—"],
        ["Passport Expiry", pkg.annex.worker.passportExpiry ?? "—"],
        ["PESEL", pkg.annex.worker.pesel ?? "—"],
        ["Site", pkg.annex.worker.assignedSite ?? "—"],
        ["Specialization", pkg.annex.worker.specialization ?? "—"],
        ["Permit Type", pkg.annex.permit.type ?? "—"],
        ["Permit Expiry", pkg.annex.permit.expiryDate ?? "—"],
        ["TRC Filed", pkg.annex.permit.trcSubmitted ? `Yes${pkg.annex.permit.filingDate ? ` (${pkg.annex.permit.filingDate})` : ""}` : "No"],
      ],
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [245, 245, 248] },
    });

    let y = (doc as any).lastAutoTable.finalY + 8;
    doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.setTextColor(0);
    doc.text("9-Point Strategy Brief", 14, y); y += 4;

    autoTable(doc, {
      startY: y, margin: { left: 14, right: 14 },
      head: [["#", "Area", "Assessment", "Status"]],
      body: pkg.strategyBrief.map((p: any) => [
        String(p.id), p.title, norm(p.value), p.status.toUpperCase(),
      ]),
      styles: { fontSize: 7.5, cellPadding: 2 },
      headStyles: { fillColor: [196, 30, 24], textColor: 255, fontStyle: "bold" },
      columnStyles: { 0: { cellWidth: 8 }, 3: { cellWidth: 18 } },
      didParseCell: (data: any) => {
        if (data.section === "body" && data.column.index === 3) {
          const v = data.cell.raw;
          data.cell.styles.textColor = v === "OK" ? [34, 197, 94] : v === "WARNING" ? [245, 158, 11] : v === "CRITICAL" ? [239, 68, 68] : [148, 163, 184];
          data.cell.styles.fontStyle = "bold";
        }
      },
    });

    doc.setFontSize(7); doc.setTextColor(160); doc.setFont("helvetica", "italic");
    doc.text("Apatris Sp. z o.o. — MOS 2026 Digital Mandate Compliance. Polish characters transliterated for PDF compatibility.", W / 2, doc.internal.pageSize.getHeight() - 8, { align: "center" });

    doc.save(`mos-package-${norm(pkg.workerName).replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.pdf`);
  }, []);

  const [batchLoading, setBatchLoading] = useState(false);
  const [batchDone, setBatchDone] = useState(0);

  if (loading) return <Spinner />;
  const filtered = search ? workers.filter((w: any) => (w.full_name ?? "").toLowerCase().includes(search)) : workers;

  const generateAllMOS = async () => {
    setBatchLoading(true); setBatchDone(0);
    for (const w of filtered) {
      if (mosResult[w.id]) continue;
      try {
        const res = await fetch(`${BASE}api/workers/${w.id}/mos-package`, { method: "POST", headers: authHeaders() });
        if (res.ok) { const pkg = await res.json(); setMosResult(prev => ({ ...prev, [w.id]: pkg })); }
      } catch { /* continue */ }
      setBatchDone(prev => prev + 1);
    }
    setBatchLoading(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <SectionHeader title="Workers Legal Status" count={filtered.length} />
        <button
          onClick={generateAllMOS}
          disabled={batchLoading || filtered.length === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#C41E18]/10 border border-[#C41E18]/30 text-[10px] font-bold text-[#C41E18] hover:bg-[#C41E18]/20 disabled:opacity-50 transition-colors"
        >
          {batchLoading ? <><Loader2 className="w-3 h-3 animate-spin" /> Generating {batchDone}/{filtered.length}...</> : <><Stamp className="w-3 h-3" /> Generate All MOS</>}
        </button>
      </div>
      {filtered.length === 0 ? <EmptyState message="No workers found" /> : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-slate-700 bg-slate-800/50">
              <th className="text-left px-3 py-2 text-slate-500 uppercase font-bold">Worker</th>
              <th className="text-left px-3 py-2 text-slate-500 uppercase font-bold">TRC Expiry</th>
              <th className="text-left px-3 py-2 text-slate-500 uppercase font-bold">Passport</th>
              <th className="text-left px-3 py-2 text-slate-500 uppercase font-bold">Work Permit</th>
              <th className="text-left px-3 py-2 text-slate-500 uppercase font-bold">Cases</th>
              <th className="text-left px-3 py-2 text-slate-500 uppercase font-bold">Status</th>
              <th className="text-left px-3 py-2 text-slate-500 uppercase font-bold">MOS 2026</th>
            </tr></thead>
            <tbody>
              {filtered.map((w: any) => {
                const trcDays = daysUntil(w.trc_expiry);
                const blocked = (trcDays !== null && trcDays < 0) || (daysUntil(w.work_permit_expiry) !== null && daysUntil(w.work_permit_expiry)! < 0);
                const pkg = mosResult[w.id];
                const isGenerating = mosLoading === w.id;
                return (
                  <tr key={w.id} className={`border-b border-slate-800 hover:bg-slate-800/40 ${blocked ? "bg-red-500/5" : ""}`}>
                    <td className="px-3 py-2.5">
                      <p className="text-white font-bold">{w.full_name}</p>
                      <p className="text-slate-500 text-[10px]">{w.specialization ?? ""}{w.assigned_site ? ` · ${w.assigned_site}` : ""}</p>
                    </td>
                    <td className={`px-3 py-2.5 font-mono ${expiryZone(w.trc_expiry)}`}>{fmtDate(w.trc_expiry)}</td>
                    <td className={`px-3 py-2.5 font-mono ${expiryZone(w.passport_expiry)}`}>{fmtDate(w.passport_expiry)}</td>
                    <td className={`px-3 py-2.5 font-mono ${expiryZone(w.work_permit_expiry)}`}>{fmtDate(w.work_permit_expiry)}</td>
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
                    <td className="px-3 py-2.5">
                      {pkg && !pkg.error ? (
                        <div className="flex items-center gap-1.5">
                          <Badge
                            label={pkg.mosReadiness === "ready" ? "READY" : pkg.mosReadiness === "needs_attention" ? "ATTENTION" : "BLOCKED"}
                            style={pkg.mosReadiness === "ready" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : pkg.mosReadiness === "needs_attention" ? "bg-amber-500/20 text-amber-400 border-amber-500/30" : "bg-red-500/20 text-red-400 border-red-500/30"}
                          />
                          <button onClick={() => downloadMOSPdf(pkg)} className="text-[9px] text-blue-400 hover:text-blue-300 underline">PDF</button>
                        </div>
                      ) : pkg?.error ? (
                        <span className="text-[10px] text-red-400">{pkg.error.slice(0, 20)}</span>
                      ) : (
                        <button
                          onClick={() => generateMOS(w.id)}
                          disabled={isGenerating}
                          className="flex items-center gap-1 px-2 py-1 rounded bg-[#C41E18]/10 border border-[#C41E18]/30 text-[10px] font-bold text-[#C41E18] hover:bg-[#C41E18]/20 transition-colors disabled:opacity-50"
                        >
                          {isGenerating ? <><Loader2 className="w-3 h-3 animate-spin" /> Generating...</> : <><Stamp className="w-3 h-3" /> Generate MOS</>}
                        </button>
                      )}
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

type WorkerGroup = "ok" | "attention" | "critical";

function classifyWorker(w: any): { group: WorkerGroup; message: string; nextStep: string | null; appealTag: boolean } {
  const now = Date.now();
  const trcExp = w.trc_expiry ? new Date(w.trc_expiry).getTime() : null;
  const wpExp = w.work_permit_expiry ? new Date(w.work_permit_expiry).getTime() : null;
  const nearestExpiry = [trcExp, wpExp].filter(Boolean).sort()[0] as number | undefined;
  const rejected = (w.rejected_cases ?? 0) > 0;

  // Critical: expired or rejected
  if (rejected) {
    return {
      group: "critical",
      message: "Application rejected — action required.",
      nextStep: "File appeal or submit new application.",
      appealTag: true,
    };
  }
  if (nearestExpiry && nearestExpiry < now) {
    const days = Math.ceil((now - nearestExpiry) / 86_400_000);
    return {
      group: "critical",
      message: `Permit expired ${days} day(s) ago.`,
      nextStep: "Begin renewal or new application process.",
      appealTag: false,
    };
  }

  // Attention: expiring within 60 days or has active cases
  if (nearestExpiry && nearestExpiry < now + 60 * 86_400_000) {
    const days = Math.ceil((nearestExpiry - now) / 86_400_000);
    return {
      group: "attention",
      message: `Permit expires in ${days} day(s).`,
      nextStep: "Start renewal process before expiry.",
      appealTag: false,
    };
  }
  if ((w.active_cases ?? 0) > 0) {
    return {
      group: "attention",
      message: "Legal case under review.",
      nextStep: "Monitor case progress.",
      appealTag: false,
    };
  }

  // OK
  return {
    group: "ok",
    message: "No action required.",
    nextStep: null,
    appealTag: false,
  };
}

const GROUP_CONFIG = {
  critical: { label: "Critical", color: "text-red-400", border: "border-red-500/20", bg: "bg-red-500/5", icon: XOctagon, dot: "bg-red-500" },
  attention: { label: "Attention Needed", color: "text-amber-400", border: "border-amber-500/20", bg: "bg-amber-500/5", icon: AlertTriangle, dot: "bg-amber-500" },
  ok: { label: "OK", color: "text-emerald-400", border: "border-emerald-500/20", bg: "bg-emerald-500/5", icon: CheckCircle2, dot: "bg-emerald-500" },
} as const;

function ClientViewTab() {
  const { data, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ["client-view-workers"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/workers`, { headers: authHeaders() });
      if (!r.ok) return [];
      const j = await r.json();
      return (j.workers ?? j ?? []).map((w: any) => ({
        id: w.id,
        full_name: w.name ?? w.full_name,
        specialization: w.specialization,
        assigned_site: w.assignedSite ?? w.assigned_site,
        trc_expiry: w.trcExpiry ?? w.trc_expiry,
        work_permit_expiry: w.workPermitExpiry ?? w.work_permit_expiry,
        active_cases: w.active_cases ?? 0,
        rejected_cases: w.rejected_cases ?? 0,
        mos_status: w.mosStatus ?? w.mos_status ?? "not_started",
      }));
    },
  });

  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const scrollToWorker = useCallback((id: string) => {
    cardRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "center" });
    // Brief highlight
    const el = cardRefs.current[id];
    if (el) { el.classList.add("ring-2", "ring-white/30"); setTimeout(() => el.classList.remove("ring-2", "ring-white/30"), 1500); }
  }, []);

  // Classify workers into groups (memoized to stabilize references)
  const { classified, grouped, total, counts, alerts } = useMemo(() => {
    const workers = (data ?? []) as any[];
    const cls = workers.map(w => ({ ...w, ...classifyWorker(w) }));
    const grps: WorkerGroup[] = ["critical", "attention", "ok"];
    const grpd = grps.map(g => ({ key: g, ...GROUP_CONFIG[g], workers: cls.filter(w => w.group === g) }));
    return {
      classified: cls,
      grouped: grpd,
      total: workers.length,
      counts: { ok: grpd[2].workers.length, attention: grpd[1].workers.length, critical: grpd[0].workers.length },
      alerts: cls.filter(w => w.group === "critical" || w.group === "attention")
        .sort((a, b) => (a.group === "critical" ? 0 : 1) - (b.group === "critical" ? 0 : 1))
        .slice(0, 5),
    };
  }, [data]);

  // PDF generation — returns jsPDF doc for reuse (download or base64)
  const buildPdf = useCallback(async () => {
    const { default: jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");
    const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\u0142/g, "l").replace(/\u0141/g, "L");
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const W = doc.internal.pageSize.getWidth();
    const now = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

    doc.setFontSize(18); doc.setFont("helvetica", "bold");
    doc.text("Workforce Legal Status Report", W / 2, 20, { align: "center" });
    doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(120);
    doc.text(`Generated ${now}  ·  ${total} workers`, W / 2, 27, { align: "center" });

    doc.setDrawColor(200); doc.line(14, 31, W - 14, 31);
    doc.setFontSize(10); doc.setTextColor(0); doc.setFont("helvetica", "bold");
    doc.text(`OK: ${counts.ok}    Attention: ${counts.attention}    Critical: ${counts.critical}`, W / 2, 37, { align: "center" });

    let y = 43;
    const STATUS_LABEL: Record<string, string> = { critical: "Critical", attention: "Attention", ok: "OK" };

    for (const { key, workers: gw } of grouped) {
      if (gw.length === 0) continue;
      doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.setTextColor(key === "critical" ? 180 : key === "attention" ? 160 : 60, key === "critical" ? 40 : key === "attention" ? 120 : 140, key === "ok" ? 80 : 40);
      doc.text(STATUS_LABEL[key]!, 14, y);
      y += 2;

      autoTable(doc, {
        startY: y, margin: { left: 14, right: 14 },
        head: [["Worker", "Status", "Details", "Next Step"]],
        body: gw.map((w: any) => [norm(w.full_name), key === "ok" ? "Clear" : key === "attention" ? "Monitor" : "Action Needed", norm(w.message), w.nextStep ? norm(w.nextStep) : "—"]),
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: key === "critical" ? [180, 40, 40] : key === "attention" ? [180, 140, 40] : [40, 140, 80], textColor: 255, fontStyle: "bold", fontSize: 8 },
        alternateRowStyles: { fillColor: [245, 245, 248] },
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    }

    doc.setFontSize(7); doc.setTextColor(160); doc.setFont("helvetica", "italic");
    doc.text("This report is for informational purposes only and does not constitute legal advice.", W / 2, doc.internal.pageSize.getHeight() - 8, { align: "center" });
    return doc;
  }, [grouped, total, counts]);

  const exportPdf = useCallback(async () => {
    const doc = await buildPdf();
    doc.save(`workforce-status-${new Date().toISOString().slice(0, 10)}.pdf`);
  }, [buildPdf]);

  // Send Report modal state
  const [sendModal, setSendModal] = useState(false);
  const [sendEmail, setSendEmail] = useState("");
  const [sendMessage, setSendMessage] = useState("");
  const [sendStatus, setSendStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [sendError, setSendError] = useState("");

  const handleSend = useCallback(async () => {
    if (!sendEmail) return;
    setSendStatus("sending");
    setSendError("");
    try {
      const doc = await buildPdf();
      const pdfBase64 = doc.output("datauristring").split(",")[1];
      const res = await fetch(`${BASE}api/reports/send`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          email: sendEmail,
          pdfBase64,
          subject: "Workforce Legal Status Report",
          message: sendMessage || undefined,
          summary: { ...counts, total },
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as any).error ?? "Send failed");
      }
      setSendStatus("sent");
      setToast("Report sent to " + sendEmail);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Send failed");
      setSendStatus("error");
    }
  }, [sendEmail, sendMessage, buildPdf, counts, total]);

  // Schedule Report modal state
  const [schedModal, setSchedModal] = useState(false);
  const [schedEmail, setSchedEmail] = useState("");
  const [schedFreq, setSchedFreq] = useState<"daily" | "weekly">("weekly");
  const [schedStatus, setSchedStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [schedError, setSchedError] = useState("");

  const handleSchedule = useCallback(async () => {
    if (!schedEmail) return;
    setSchedStatus("saving");
    setSchedError("");
    try {
      const res = await fetch(`${BASE}api/reports/schedule`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ email: schedEmail, frequency: schedFreq }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as any).error ?? "Schedule failed");
      }
      setSchedStatus("saved");
      setToast("Report scheduled (" + schedFreq + ") for " + schedEmail);
    } catch (err) {
      setSchedError(err instanceof Error ? err.message : "Schedule failed");
      setSchedStatus("error");
    }
  }, [schedEmail, schedFreq]);

  // Notifications
  const { data: notifData, refetch: refetchNotifs } = useQuery({
    queryKey: ["legal-notifications"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/legal-notifications`, { headers: authHeaders() });
      if (!r.ok) return { notifications: [], unread: 0 };
      return r.json();
    },
    refetchInterval: 60_000, // poll every 60s
  });
  const [notifOpen, setNotifOpen] = useState(false);
  const unread = (notifData as any)?.unread ?? 0;
  const notifications = ((notifData as any)?.notifications ?? []).slice(0, 20);

  const [markingRead, setMarkingRead] = useState(false);
  const markAllRead = useCallback(async () => {
    setMarkingRead(true);
    await fetch(`${BASE}api/legal-notifications/read`, { method: "POST", headers: authHeaders(), body: JSON.stringify({}) }).catch(() => {});
    await refetchNotifs();
    setMarkingRead(false);
    setToast("Notifications marked as read");
  }, [refetchNotifs]);

  // Toast state
  const [toast, setToast] = useState<string | null>(null);
  React.useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); } }, [toast]);

  if (isLoading || !data) return <Spinner />;

  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : null;

  return (
    <div className="space-y-4">
      {/* ── Workforce Compliance Overview ─────────────────────────────────── */}
      <div className="rounded-xl border border-slate-700/50 bg-gradient-to-r from-slate-900 to-slate-900/80 p-5">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">Workforce Compliance Overview</h2>
            <p className="text-[12px] text-slate-400 mt-1 leading-relaxed max-w-lg">
              This system monitors workforce legal status across all active workers,
              highlights permits that need attention, and recommends next steps to maintain compliance.
            </p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {/* Notification bell */}
            <div className="relative">
              <button
                onClick={() => setNotifOpen(!notifOpen)}
                className="relative p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white hover:border-slate-600 transition-colors"
              >
                <Bell className="w-4 h-4" />
                {unread > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-[9px] font-bold text-white flex items-center justify-center">{unread > 9 ? "9+" : unread}</span>
                )}
              </button>

            {notifOpen && (
              <div className="absolute right-0 top-full mt-2 w-80 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-[100] overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800">
                  <span className="text-xs font-bold text-white">Notifications</span>
                  {unread > 0 && (
                    <button onClick={markAllRead} disabled={markingRead} className="text-[10px] text-blue-400 hover:text-blue-300 disabled:opacity-50">
                      {markingRead ? "Marking..." : "Mark all read"}
                    </button>
                  )}
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <p className="text-xs text-slate-600 text-center py-6">No notifications</p>
                  ) : (
                    notifications.map((n: any) => (
                      <div key={n.id} className={`px-3 py-2.5 border-b border-slate-800/50 ${n.read ? "" : "bg-slate-800/30"}`}>
                        <div className="flex items-center justify-between mb-0.5">
                          <div className="flex items-center gap-1.5">
                            {n.type === "critical" ? <XOctagon className="w-3 h-3 text-red-400" /> : <AlertTriangle className="w-3 h-3 text-amber-400" />}
                            <span className="text-[11px] font-semibold text-white">{n.worker_name}</span>
                          </div>
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${n.type === "critical" ? "bg-red-500/20 text-red-300" : "bg-amber-500/20 text-amber-300"}`}>
                            {n.type}
                          </span>
                        </div>
                        <p className={`text-[10px] ml-4.5 ${n.type === "critical" ? "text-red-300/80" : "text-amber-300/80"}`}>{n.message}</p>
                        <p className="text-[9px] text-slate-600 ml-4.5 mt-0.5">{new Date(n.created_at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <span className="text-[10px] text-slate-600 font-mono">{total} items</span>
          <button
            onClick={exportPdf}
            disabled={total === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs font-bold text-slate-300 hover:text-white hover:border-slate-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-slate-300 disabled:hover:border-slate-700"
          >
            <FileText className="w-3.5 h-3.5" />
            Export
          </button>
          <button
            onClick={() => { setSendModal(true); setSendStatus("idle"); setSendError(""); }}
            disabled={total === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs font-bold text-slate-300 hover:text-white hover:border-slate-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-slate-300 disabled:hover:border-slate-700"
          >
            <Send className="w-3.5 h-3.5" />
            Send
          </button>
          <button
            onClick={() => { setSchedModal(true); setSchedStatus("idle"); setSchedError(""); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs font-bold text-slate-300 hover:text-white hover:border-slate-600 transition-colors"
          >
            <CalendarClock className="w-3.5 h-3.5" />
            Schedule
          </button>
        </div>
      </div>

        {/* Summary counts inside overview card */}
        <div className="grid grid-cols-4 gap-3 mt-4">
          <div className="bg-slate-800/60 rounded-lg px-3 py-2 text-center">
            <p className="text-xl font-black text-white">{total}</p>
            <p className="text-[9px] text-slate-500 uppercase font-bold">Total</p>
          </div>
          <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-lg px-3 py-2 text-center">
            <p className="text-xl font-black text-emerald-400">{counts.ok}</p>
            <p className="text-[9px] text-emerald-400/60 uppercase font-bold">OK</p>
          </div>
          <div className="bg-amber-500/5 border border-amber-500/10 rounded-lg px-3 py-2 text-center">
            <p className="text-xl font-black text-amber-400">{counts.attention}</p>
            <p className="text-[9px] text-amber-400/60 uppercase font-bold">Attention</p>
          </div>
          <div className="bg-red-500/5 border border-red-500/10 rounded-lg px-3 py-2 text-center">
            <p className="text-xl font-black text-red-400">{counts.critical}</p>
            <p className="text-[9px] text-red-400/60 uppercase font-bold">Critical</p>
          </div>
        </div>

        {/* Project Health */}
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div className="bg-blue-500/5 border border-blue-500/10 rounded-lg px-3 py-2">
            <div className="flex items-center justify-between">
              <p className="text-[9px] text-blue-400/70 uppercase font-bold">MOS Ready</p>
              <Stamp className="w-3 h-3 text-blue-400/40" />
            </div>
            <p className="text-xl font-black text-blue-400 mt-0.5">
              {total > 0 ? Math.round((classified.filter((w: any) => w.mos_status === "ready" || w.mos_status === "needs_attention").length / total) * 100) : 0}%
            </p>
            <p className="text-[9px] text-slate-500">
              {classified.filter((w: any) => w.mos_status === "ready").length} ready · {classified.filter((w: any) => w.mos_status === "needs_attention").length} attention · {classified.filter((w: any) => w.mos_status === "not_started" || !w.mos_status).length} pending
            </p>
          </div>
          <div className="bg-purple-500/5 border border-purple-500/10 rounded-lg px-3 py-2">
            <div className="flex items-center justify-between">
              <p className="text-[9px] text-purple-400/70 uppercase font-bold">Art. 108 Protected</p>
              <Shield className="w-3 h-3 text-purple-400/40" />
            </div>
            <p className="text-xl font-black text-purple-400 mt-0.5">
              {total > 0 ? Math.round((classified.filter((w: any) => { const t = w.trc_expiry ? new Date(w.trc_expiry).getTime() : null; return t && t > Date.now(); }).length / total) * 100) : 0}%
            </p>
            <p className="text-[9px] text-slate-500">
              {classified.filter((w: any) => { const t = w.trc_expiry ? new Date(w.trc_expiry).getTime() : null; return t && t > Date.now(); }).length} with valid TRC · {classified.filter((w: any) => { const t = w.trc_expiry ? new Date(w.trc_expiry).getTime() : null; return !t || t <= Date.now(); }).length} expired or missing
            </p>
          </div>
        </div>

        {lastUpdated && (
          <p className="text-[10px] text-slate-600 mt-3 flex items-center gap-1.5">
            <Clock className="w-3 h-3" /> Last updated: {lastUpdated}
          </p>
        )}
      </div>

      {/* ── Schedule Report Modal ────────────────────────────────────────── */}
      {schedModal && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSchedModal(false)} />
          <div className="relative bg-slate-900 border border-slate-700 rounded-xl p-5 w-full max-w-sm shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-slate-400" />
                <h3 className="text-sm font-bold text-white">Schedule Report</h3>
              </div>
              <button onClick={() => setSchedModal(false)} className="text-slate-500 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-[11px] text-slate-500">Automatically generate and send the workforce report on a recurring schedule.</p>

            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Recipient Email</label>
                <input
                  type="email" value={schedEmail} onChange={e => setSchedEmail(e.target.value)}
                  placeholder="client@company.com"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-slate-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Frequency</label>
                <select
                  value={schedFreq} onChange={e => setSchedFreq(e.target.value as "daily" | "weekly")}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-slate-500"
                >
                  <option value="weekly">Weekly</option>
                  <option value="daily">Daily</option>
                </select>
              </div>
            </div>

            {schedStatus === "error" && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-[11px] text-red-400">{schedError}</div>
            )}
            {schedStatus === "saved" && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2 text-[11px] text-emerald-400 flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5" /> Report scheduled ({schedFreq}) for {schedEmail}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button onClick={() => setSchedModal(false)} className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition-colors">Cancel</button>
              <button
                onClick={handleSchedule}
                disabled={!schedEmail || schedStatus === "saving" || schedStatus === "saved"}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-500 transition-colors"
              >
                {schedStatus === "saving" ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...</> : <><CalendarClock className="w-3.5 h-3.5" /> Save Schedule</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Send Report Modal ────────────────────────────────────────────── */}
      {sendModal && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSendModal(false)} />
          <div className="relative bg-slate-900 border border-slate-700 rounded-xl p-5 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Send className="w-4 h-4 text-slate-400" />
                <h3 className="text-sm font-bold text-white">Send Workforce Report</h3>
              </div>
              <button onClick={() => setSendModal(false)} className="text-slate-500 hover:text-white"><X className="w-4 h-4" /></button>
            </div>

            <p className="text-[11px] text-slate-500">The report PDF will be generated and sent as an email attachment.</p>

            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Recipient Email</label>
                <input
                  type="email"
                  value={sendEmail}
                  onChange={e => setSendEmail(e.target.value)}
                  placeholder="client@company.com"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-slate-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Message (optional)</label>
                <textarea
                  value={sendMessage}
                  onChange={e => setSendMessage(e.target.value)}
                  placeholder="Please find attached the latest workforce status report."
                  rows={3}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-slate-500 resize-none"
                />
              </div>
            </div>

            <div className="bg-slate-800/50 rounded-lg px-3 py-2 text-[10px] text-slate-500">
              Summary: OK {counts.ok} · Attention {counts.attention} · Critical {counts.critical} ({total} workers)
            </div>

            {sendStatus === "error" && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-[11px] text-red-400">{sendError}</div>
            )}
            {sendStatus === "sent" && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2 text-[11px] text-emerald-400 flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5" /> Report sent to {sendEmail}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button onClick={() => setSendModal(false)} className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition-colors">Cancel</button>
              <button
                onClick={handleSend}
                disabled={!sendEmail || sendStatus === "sending" || sendStatus === "sent"}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-500 transition-colors"
              >
                {sendStatus === "sending" ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending...</> : <><Send className="w-3.5 h-3.5" /> Send</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Alerts ────────────────────────────────────────────────────────── */}
      {alerts.length > 0 && (
        <div className="rounded-xl border border-slate-700/50 bg-slate-900/60 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="w-3.5 h-3.5 text-red-400" />
              <span className="text-xs font-bold text-white uppercase tracking-wider">Alerts</span>
              <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-red-500/20 text-red-300">{alerts.length}</span>
            </div>
            <span className="text-[9px] text-slate-600 uppercase">Requires attention</span>
          </div>
          <div className="space-y-1.5">
            {alerts.map((a: any) => {
              const isCrit = a.group === "critical";
              return (
                <div
                  key={a.id}
                  className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 ${isCrit ? "bg-red-500/5 border border-red-500/15" : "bg-amber-500/5 border border-amber-500/15"} cursor-pointer hover:brightness-110 transition-all`}
                  onClick={() => scrollToWorker(a.id)}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {isCrit ? <XOctagon className="w-3.5 h-3.5 text-red-400 flex-shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />}
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold text-white truncate">{a.full_name}</p>
                      <p className={`text-[10px] ${isCrit ? "text-red-300/80" : "text-amber-300/80"}`}>{a.message}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${isCrit ? "bg-red-500/20 text-red-300" : "bg-amber-500/20 text-amber-300"}`}>
                      {isCrit ? "CRITICAL" : "ATTENTION"}
                    </span>
                    <ChevronRight className="w-3 h-3 text-slate-600" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {total === 0 ? <EmptyState message="No workers found" /> : (
        <div className="space-y-5">
          {grouped.map(({ key, label, color, border, bg, icon: GIcon, dot, workers: gWorkers }) => {
            if (gWorkers.length === 0) return null;
            return (
              <div key={key}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`w-2 h-2 rounded-full ${dot}`} />
                  <h3 className={`text-xs font-bold uppercase tracking-wider ${color}`}>{label}</h3>
                  <span className="text-[10px] text-slate-600">{gWorkers.length}</span>
                </div>
                <div className="space-y-2">
                  {gWorkers.map((w: any) => (
                    <div key={w.id} ref={el => { cardRefs.current[w.id] = el; }} className={`${bg} border ${border} rounded-lg px-4 py-3 transition-all`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <GIcon className={`w-3.5 h-3.5 ${color} flex-shrink-0`} />
                          <div>
                            <p className="text-sm font-semibold text-white">{w.full_name}</p>
                            <p className="text-[10px] text-slate-500">{w.assigned_site ?? "Unassigned"}{w.specialization ? ` · ${w.specialization}` : ""}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {w.appealTag && (
                            <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase bg-purple-500/20 text-purple-300 border border-purple-500/20">
                              Appeal may be required
                            </span>
                          )}
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                            key === "ok" ? "bg-emerald-500/15 text-emerald-400" :
                            key === "attention" ? "bg-amber-500/15 text-amber-400" :
                            "bg-red-500/15 text-red-400"
                          }`}>
                            {key === "ok" ? "CLEAR" : key === "attention" ? "MONITOR" : "ACTION NEEDED"}
                          </span>
                        </div>
                      </div>

                      <p className="text-[11px] text-slate-300 mt-1.5 ml-6">{w.message}</p>

                      <div className="flex items-center gap-3 mt-1.5 ml-6">
                        {w.nextStep && (
                          <div className="flex items-center gap-1.5">
                            <ArrowRight className="w-3 h-3 text-slate-500" />
                            <p className="text-[10px] text-slate-400">{w.nextStep}</p>
                          </div>
                        )}
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            const btn = e.currentTarget;
                            btn.textContent = "Loading..."; btn.disabled = true;
                            try {
                              const r = await fetch(`${BASE}api/workers/${w.id}/mos-package`, { method: "POST", headers: authHeaders() });
                              if (!r.ok) throw new Error();
                              const pkg = await r.json();
                              // Reuse MOS PDF generator from Workers Legal tab
                              const { default: jsPDF } = await import("jspdf");
                              const { default: autoTable } = await import("jspdf-autotable");
                              const norm = (s: string) => (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\u0142/g, "l").replace(/\u0141/g, "L");
                              const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
                              const W = doc.internal.pageSize.getWidth();
                              doc.setFontSize(16); doc.setFont("helvetica", "bold");
                              doc.text("MOS 2026 Strategy Brief", W / 2, 18, { align: "center" });
                              doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(120);
                              doc.text(`${norm(pkg.workerName)} — ${pkg.mosReadiness?.toUpperCase()} | ${pkg.legalStatus} | ${pkg.riskLevel}`, W / 2, 24, { align: "center" });
                              doc.setDrawColor(200); doc.line(14, 28, W - 14, 28);
                              autoTable(doc, { startY: 32, margin: { left: 14, right: 14 }, head: [["#", "Area", "Assessment", "Status"]], body: pkg.strategyBrief?.map((p: any) => [String(p.id), p.title, norm(p.value), p.status.toUpperCase()]) ?? [], styles: { fontSize: 8, cellPadding: 2 }, headStyles: { fillColor: [196, 30, 24], textColor: 255, fontStyle: "bold" }, columnStyles: { 0: { cellWidth: 8 }, 3: { cellWidth: 18 } }, didParseCell: (data: any) => { if (data.section === "body" && data.column.index === 3) { const v = data.cell.raw; data.cell.styles.textColor = v === "OK" ? [34, 197, 94] : v === "WARNING" ? [245, 158, 11] : v === "CRITICAL" ? [239, 68, 68] : [148, 163, 184]; data.cell.styles.fontStyle = "bold"; } } });
                              doc.setFontSize(7); doc.setTextColor(160); doc.setFont("helvetica", "italic");
                              doc.text("Apatris Sp. z o.o. — MOS 2026 Digital Mandate", W / 2, doc.internal.pageSize.getHeight() - 8, { align: "center" });
                              doc.save(`strategy-${norm(pkg.workerName).replace(/\s+/g, "-").toLowerCase()}.pdf`);
                            } catch { /* silent */ }
                            btn.textContent = "Strategy PDF"; btn.disabled = false;
                          }}
                          className="text-[9px] text-blue-400 hover:text-blue-300 underline flex-shrink-0"
                        >Strategy PDF</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Toast ──────────────────────────────────────────────────────────── */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[400] flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 shadow-xl">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span className="text-xs text-slate-200">{toast}</span>
        </div>
      )}
    </div>
  );
}
