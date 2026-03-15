import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useGetWorkers, useGetWorkerStats } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { 
  Users, AlertTriangle, ShieldAlert, Clock, 
  Search, Filter, LogOut, FileText, Bell, RefreshCcw, Zap, Pencil, Building2, Settings, ClipboardList,
  Phone, MessageSquare, TrendingUp, Calculator, Download, CalendarDays, ChevronLeft, ChevronRight
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";

import { format, parseISO, addMonths, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek, isSameMonth } from "date-fns";
import { useTranslation } from "react-i18next";

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} xmlns="http://www.w3.org/2000/svg">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}

// ─── Communication helpers ────────────────────────────────────────────────────
function formatWaNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("48") && digits.length >= 10) return digits;
  if (digits.startsWith("0") && digits.length >= 9) return "48" + digits.slice(1);
  if (digits.length === 9) return "48" + digits;
  return "48" + digits;
}

function getUrgentDocType(worker: any): string | null {
  const RED_MS = 30 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const checks: [string, string | undefined | null][] = [
    ["TRC", worker.trcExpiry],
    ["Passport", worker.passportExpiry],
  ];
  for (const [label, expiry] of checks) {
    if (expiry) {
      const diff = new Date(expiry).getTime() - now;
      if (diff <= RED_MS) return label;
    }
  }
  return null;
}

function buildWhatsAppUrl(phone: string, urgentDoc: string | null): string {
  const num = formatWaNumber(phone);
  if (urgentDoc) {
    const msg = encodeURIComponent(
      `Dzień dobry, tutaj biuro Apatris. Twoje dokumenty (${urgentDoc}) wygasają. Prosimy o pilny kontakt.`
    );
    return `https://wa.me/${num}?text=${msg}`;
  }
  return `https://wa.me/${num}`;
}

import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { WorkerProfilePanel } from "@/components/WorkerProfilePanel";
import { NotifyDialog, RenewDialog } from "@/components/ActionDialogs";
import { ComplianceReportModal } from "@/components/ComplianceReportModal";
import { BulkUploadModal } from "@/components/BulkUploadModal";
import { NotificationBell } from "@/components/NotificationBell";
import { AddWorkerModal } from "@/components/AddWorkerModal";

function LanguageToggle() {
  const { i18n } = useTranslation();
  const current = i18n.language?.startsWith("pl") ? "pl" : "en";

  const toggle = (lang: string) => {
    i18n.changeLanguage(lang);
  };

  return (
    <div className="flex items-center gap-1 bg-black/30 border border-white/10 rounded-lg p-1">
      <button
        onClick={() => toggle("en")}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${
          current === "en"
            ? "bg-primary text-white shadow-[0_0_12px_rgba(196,30,24,0.5)]"
            : "text-muted-foreground hover:text-white"
        }`}
        title="English"
      >
        <span className="text-sm leading-none">🇬🇧</span>
        <span>EN</span>
      </button>
      <button
        onClick={() => toggle("pl")}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${
          current === "pl"
            ? "bg-primary text-white shadow-[0_0_12px_rgba(196,30,24,0.5)]"
            : "text-muted-foreground hover:text-white"
        }`}
        title="Polski"
      >
        <span className="text-sm leading-none">🇵🇱</span>
        <span>PL</span>
      </button>
    </div>
  );
}

interface TrendSnapshot { date: string; total: number; compliant: number; warning: number; critical: number; expired: number; }

export default function Dashboard() {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const isAdmin = user?.role === "Admin";
  const [, setLocation] = useLocation();
  
  const [search, setSearch] = useState("");
  const [specialization, setSpecialization] = useState("");
  const [status, setStatus] = useState("");
  const [site, setSite] = useState("");

  // Seed today's snapshot once on mount so trend chart has data from day 1
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}api/compliance/snapshot`, { method: "POST" }).catch(() => {});
  }, []);

  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
  const [panelEditMode, setPanelEditMode] = useState(false);
  const [actionWorker, setActionWorker] = useState<any | null>(null);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [renewOpen, setRenewOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
  const [addWorkerOpen, setAddWorkerOpen] = useState(false);
  const [calendarView, setCalendarView] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => format(new Date(), "yyyy-MM"));

  const { data: workersData, isLoading: isLoadingWorkers } = useGetWorkers({ 
    search: search || undefined, 
    specialization: specialization || undefined, 
    status: status || undefined,
    site: site || undefined,
  } as any);
  
  const { data: stats } = useGetWorkerStats();

  // Live site list from Airtable — refreshes whenever a worker's site is updated
  const { data: sitesData } = useQuery<{ sites: string[] }>({
    queryKey: ["workers-sites"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/workers/sites`);
      if (!res.ok) throw new Error("Failed to fetch sites");
      return res.json();
    },
    staleTime: 30_000,
  });
  const availableSites = sitesData?.sites ?? [];

  // All workers (unfiltered) for per-site stats
  const { data: allWorkersData } = useGetWorkers({} as any);

  // Compliance trend snapshots
  const { data: trendData } = useQuery<{ snapshots: TrendSnapshot[] }>({
    queryKey: ["compliance-trend"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/compliance/trend`);
      if (!res.ok) throw new Error("Failed to fetch trend");
      return res.json();
    },
    staleTime: 60_000,
  });
  const trendSnapshots = trendData?.snapshots ?? [];

  // Per-site stats computed from all workers
  const siteStats = React.useMemo(() => {
    const workers = allWorkersData?.workers ?? [];
    const map = new Map<string, { total: number; critical: number; warning: number; compliant: number }>();
    for (const w of workers) {
      const s = (w as any).assignedSite || "Unassigned";
      if (!map.has(s)) map.set(s, { total: 0, critical: 0, warning: 0, compliant: 0 });
      const entry = map.get(s)!;
      entry.total++;
      if (w.complianceStatus === "critical" || w.complianceStatus === "non-compliant") entry.critical++;
      else if (w.complianceStatus === "warning") entry.warning++;
      else entry.compliant++;
    }
    return Array.from(map.entries()).map(([name, stats]) => ({ name, ...stats })).sort((a, b) => b.total - a.total);
  }, [allWorkersData]);

  // Workers with any document expiring within the next 7 days
  const expiringThisWeek = React.useMemo(() => {
    const ws = allWorkersData?.workers ?? [];
    const now = Date.now();
    const week = 7 * 24 * 60 * 60 * 1000;
    const items: Array<{ worker: any; docType: string; expiry: string }> = [];
    for (const w of ws as any[]) {
      const checks: [string, string | null | undefined][] = [
        ["TRC", w.trcExpiry], ["Passport", w.passportExpiry],
        ["Work Permit", w.workPermitExpiry], ["Contract", w.contractEndDate],
        ["Medical", w.medicalExamExpiry], ["BHP", w.bhpStatus?.includes("-") ? w.bhpStatus : null],
      ];
      for (const [docType, d] of checks) {
        if (d && d.includes("-")) {
          const ms = new Date(d).getTime();
          if (ms >= now && ms <= now + week) items.push({ worker: w, docType, expiry: d });
        }
      }
    }
    return items.sort((a, b) => new Date(a.expiry).getTime() - new Date(b.expiry).getTime());
  }, [allWorkersData]);

  // Calendar events: expiry dates → list of workers
  const calendarEvents = React.useMemo(() => {
    const ws = allWorkersData?.workers ?? [];
    const map: Record<string, Array<{ name: string; docType: string; critical: boolean }>> = {};
    for (const w of ws as any[]) {
      const fields: [string, string | null | undefined][] = [
        ["TRC", w.trcExpiry], ["Passport", w.passportExpiry],
        ["Work Permit", w.workPermitExpiry], ["Contract", w.contractEndDate],
        ["Medical", w.medicalExamExpiry], ["BHP", w.bhpStatus?.includes("-") ? w.bhpStatus : null],
      ];
      for (const [docType, expiry] of fields) {
        if (expiry && expiry.includes("-")) {
          const key = expiry.slice(0, 10);
          if (!map[key]) map[key] = [];
          map[key].push({ name: w.name, docType, critical: w.complianceStatus === "critical" || w.complianceStatus === "non-compliant" });
        }
      }
    }
    return map;
  }, [allWorkersData]);

  const handleDownloadCSV = () => {
    const ws = allWorkersData?.workers ?? [];
    const headers = ["Name","Specialization","Site","TRC Expiry","Passport Expiry","BHP Expiry","Work Permit Expiry","Contract End","Compliance Status","Email","Phone"];
    const rows = (ws as any[]).map((w) => [
      w.name, w.specialization||"", w.assignedSite||"",
      w.trcExpiry||"", w.passportExpiry||"", w.bhpStatus||"",
      w.workPermitExpiry||"", w.contractEndDate||"",
      w.complianceStatus||"", w.email||"", w.phone||"",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v: any) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `apatris-workers-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const handleNotify = (e: React.MouseEvent, worker: any) => {
    e.stopPropagation();
    setActionWorker(worker);
    setNotifyOpen(true);
  };

  const handleRenew = (e: React.MouseEvent, worker: any) => {
    e.stopPropagation();
    setActionWorker(worker);
    setRenewOpen(true);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-foreground flex flex-col relative">
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/8 blur-[140px] rounded-full" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[40%] h-[40%] bg-primary/5 blur-[120px] rounded-full" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60%] h-[30%] bg-destructive/3 blur-[160px] rounded-full" />
      </div>

      {/* Header */}
      <header
        className="h-16 border-b border-slate-700 bg-slate-900/95 backdrop-blur-xl sticky top-0 z-30 px-6 flex items-center justify-between"
        style={{ boxShadow: "0 1px 0 rgba(196,30,24,0.08), 0 4px 20px rgba(0,0,0,0.3)" }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-full bg-white flex-shrink-0 flex items-center justify-center"
            style={{ boxShadow: "0 0 0 2px rgba(196,30,24,0.35), 0 0 12px rgba(196,30,24,0.2)" }}
            aria-label="Apatris Logo"
          >
            <svg width="38" height="38" viewBox="0 0 38 38" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M19 2 L33 8.5 L33 21 Q33 30 19 36 Q5 30 5 21 L5 8.5 Z" fill="#fef2f2" stroke="#C41E18" strokeWidth="1.5" strokeLinejoin="round" />
              <text x="19" y="28" textAnchor="middle" fontSize="19" fontWeight="900" fontFamily="Arial Black, Arial, sans-serif" fill="#C41E18" letterSpacing="-0.5">A</text>
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-[0.15em] uppercase leading-none text-white">
              {t("header.title")}
            </h1>
            <p
              className="text-[9px] text-red-500 font-bold font-mono tracking-[0.2em] uppercase leading-none mt-0.5"
              style={{ textShadow: "0 0 8px rgba(239,68,68,0.7)" }}
            >
              OUTSOURCING · CERTIFIED WELDERS
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Compliance Alerts */}
          <button
            onClick={() => setLocation("/compliance-alerts")}
            className="flex items-center gap-2 px-4 py-2 border border-orange-600/60 text-orange-400 hover:bg-orange-600 hover:text-white rounded-lg text-sm font-mono font-bold uppercase tracking-wide transition-all hover:shadow-[0_0_15px_rgba(234,88,12,0.3)]"
            title="Compliance Alerts"
          >
            <ClipboardList className="w-4 h-4" />
            <span className="hidden sm:inline">{t("header.compliance")}</span>
          </button>

          {/* Monthly Payroll Run — Admin + Coordinator */}
          <button
            onClick={() => setLocation("/payroll")}
            className="flex items-center gap-2 px-4 py-2 border border-green-600/60 text-green-400 hover:bg-green-700 hover:text-white rounded-lg text-sm font-mono font-bold uppercase tracking-wide transition-all hover:shadow-[0_0_15px_rgba(34,197,94,0.3)]"
            title="Monthly Payroll Run"
          >
            <Calculator className="w-4 h-4" />
            <span className="hidden sm:inline">Payroll</span>
          </button>

          {/* Admin Settings — Admin only */}
          {isAdmin && (
            <button
              onClick={() => setLocation("/admin-settings")}
              className="flex items-center gap-2 px-4 py-2 border border-slate-600 text-gray-400 hover:bg-slate-700 hover:text-white rounded-lg text-sm font-mono font-bold uppercase tracking-wide transition-all"
              title="Admin Settings"
            >
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">{t("header.admin")}</span>
            </button>
          )}

          {/* ⚡ AI Smart Upload — Admin only */}
          {isAdmin && (
            <button
              onClick={() => setBulkUploadOpen(true)}
              className="flex items-center gap-2 px-4 py-2 border border-red-600/70 text-red-400 hover:bg-red-600 hover:text-white rounded-lg text-sm font-mono font-bold uppercase tracking-wide transition-all hover:shadow-[0_0_15px_rgba(196,30,24,0.4)]"
            >
              <Zap className="w-4 h-4" />
              <span className="hidden sm:inline">{t("header.aiUpload")}</span>
            </button>
          )}

          {/* + Add Worker — Admin only */}
          {isAdmin && (
            <button
              onClick={() => setAddWorkerOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-red-700 hover:bg-red-600 border border-red-500 text-white rounded-lg text-sm font-mono font-bold uppercase tracking-wide transition-all shadow-[0_0_12px_rgba(196,30,24,0.35)] hover:shadow-[0_0_18px_rgba(196,30,24,0.5)]"
            >
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline">Add Worker</span>
            </button>
          )}

          <button
            onClick={() => setReportOpen(true)}
            className="flex items-center gap-2 px-4 py-2 border border-red-600/70 text-red-400 hover:bg-red-600 hover:text-white rounded-lg text-sm font-mono font-bold uppercase tracking-wide transition-all hover:shadow-[0_0_15px_rgba(196,30,24,0.4)]"
          >
            <FileText className="w-4 h-4" />
            <span className="hidden sm:inline">{t("header.generateReport")}</span>
          </button>
          <button
            onClick={handleDownloadCSV}
            className="flex items-center gap-2 px-4 py-2 border border-slate-600 text-gray-400 hover:bg-slate-700 hover:text-white rounded-lg text-sm font-mono font-bold uppercase tracking-wide transition-all"
            title="Download full worker list as CSV"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">CSV</span>
          </button>

          {/* Notification Bell */}
          <NotificationBell onSelectWorker={(id) => setSelectedWorkerId(id)} />

          <LanguageToggle />
          
          <div className="w-px h-6 bg-white/10" />
          
          <div className="flex items-center gap-3">
            <div className="text-right hidden md:block">
              <p className="text-sm font-bold text-white leading-tight">{user?.name}</p>
              <p className="text-xs text-primary font-mono">{user?.role}</p>
            </div>
            <button onClick={logout} title={t("header.logout")} className="p-2 text-muted-foreground hover:text-white transition-colors">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 p-6 lg:p-8 z-10 max-w-[1600px] mx-auto w-full space-y-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard title={t("stats.totalWorkforce")} value={stats?.total || "0"} icon={Users} />
          <StatCard title={t("stats.critical")} value={stats?.critical || "0"} icon={ShieldAlert} variant="critical" />
          <StatCard title={t("stats.upcomingRenewals")} value={stats?.warning || "0"} icon={Clock} variant="warning" />
          <StatCard title={t("stats.nonCompliant")} value={stats?.nonCompliant || "0"} icon={AlertTriangle} variant="critical" />
        </div>

        {/* Per-Site Compliance Cards */}
        {siteStats.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 flex items-center gap-2">
              <Building2 className="w-4 h-4" /> Site Overview
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {siteStats.map((s) => {
                const pct = s.total > 0 ? Math.round((s.compliant / s.total) * 100) : 100;
                const color = s.critical > 0 ? "border-red-500/40 bg-red-600/5" : s.warning > 0 ? "border-yellow-500/40 bg-yellow-600/5" : "border-green-500/40 bg-green-600/5";
                const textColor = s.critical > 0 ? "text-red-400" : s.warning > 0 ? "text-yellow-400" : "text-green-400";
                return (
                  <button
                    key={s.name}
                    onClick={() => setSite(site === s.name ? "" : s.name)}
                    className={`p-3 rounded-xl border text-left transition-all hover:scale-[1.02] ${color} ${site === s.name ? "ring-2 ring-red-500" : ""}`}
                  >
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 truncate">{s.name}</p>
                    <p className={`text-2xl font-mono font-bold mt-1 ${textColor}`}>{pct}%</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">{s.total} worker{s.total !== 1 ? "s" : ""}{s.critical > 0 ? ` · ${s.critical} critical` : s.warning > 0 ? ` · ${s.warning} warning` : " · all clear"}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Compliance Trend Chart */}
        {trendSnapshots.length > 0 && (
          <div className="glass-panel p-5 rounded-xl">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4" /> Compliance Trend (Last {trendSnapshots.length} day{trendSnapshots.length !== 1 ? "s" : ""})
            </h2>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={trendSnapshots} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
                <YAxis tick={{ fill: "#64748b", fontSize: 10 }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} labelStyle={{ color: "#94a3b8" }} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Line type="monotone" dataKey="compliant" stroke="#22c55e" strokeWidth={2} dot={false} name="Compliant" />
                <Line type="monotone" dataKey="warning" stroke="#eab308" strokeWidth={2} dot={false} name="Warning" />
                <Line type="monotone" dataKey="critical" stroke="#C41E18" strokeWidth={2} dot={false} name="Critical" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Command Bar */}
        <div className="glass-panel p-4 rounded-xl flex flex-col md:flex-row gap-4 items-center justify-between mt-8">
          <div className="flex-1 w-full relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input 
              type="text" 
              placeholder={t("table.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-500 rounded-lg text-sm font-mono text-white focus:outline-none focus:border-primary/60 transition-colors placeholder:text-gray-500"
            />
          </div>
          
          <div className="flex gap-3 w-full md:w-auto flex-wrap">
            <div className="relative flex-1 md:w-40">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <select 
                value={specialization}
                onChange={(e) => setSpecialization(e.target.value)}
                className="w-full pl-10 pr-8 py-2.5 bg-slate-900 border border-slate-500 rounded-lg text-sm font-mono text-white appearance-none focus:outline-none focus:border-primary/60 transition-colors"
              >
                <option value="">{t("table.allSpecs")}</option>
                <option value="TIG">TIG</option>
                <option value="MIG">MIG</option>
                <option value="MAG">MAG</option>
                <option value="MMA">MMA</option>
                <option value="ARC">ARC</option>
                <option value="FCAW">FCAW</option>
                <option value="FABRICATOR">FABRICATOR</option>
              </select>
            </div>
            <div className="relative flex-1 md:w-40">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <select 
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full pl-10 pr-8 py-2.5 bg-slate-900 border border-slate-500 rounded-lg text-sm font-mono text-white appearance-none focus:outline-none focus:border-primary/60 transition-colors"
              >
                <option value="">{t("table.allStatuses")}</option>
                <option value="compliant">{t("table.compliant")}</option>
                <option value="warning">{t("table.warning")}</option>
                <option value="critical">{t("table.critical")}</option>
                <option value="non-compliant">{t("table.nonCompliant")}</option>
              </select>
            </div>
            <div className="relative flex-1 md:w-52">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none z-10" />
              <select
                value={site}
                onChange={(e) => setSite(e.target.value)}
                className="w-full pl-10 pr-8 py-2.5 bg-slate-900 border border-slate-500 rounded-lg text-sm font-mono text-white appearance-none focus:outline-none focus:border-primary/60 transition-colors"
              >
                <option value="">{t("table.allClientsProjects")}</option>
                {availableSites.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <button
              onClick={() => setCalendarView(!calendarView)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-mono font-bold uppercase tracking-wide border transition-all whitespace-nowrap ${calendarView ? "bg-red-600 border-red-500 text-white shadow-[0_0_12px_rgba(196,30,24,0.35)]" : "border-slate-500 text-gray-400 hover:bg-slate-700 hover:text-white"}`}
            >
              <CalendarDays className="w-4 h-4" />
              <span className="hidden sm:inline">Calendar</span>
            </button>
          </div>
        </div>

        {/* Expiring This Week */}
        {expiringThisWeek.length > 0 && (
          <div className="rounded-xl border border-orange-500/30 bg-orange-950/20 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-orange-400" />
              <p className="text-xs font-bold uppercase tracking-widest text-orange-400">
                Expiring This Week — {expiringThisWeek.length} document{expiringThisWeek.length !== 1 ? "s" : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {expiringThisWeek.map((item, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedWorkerId(item.worker.id)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-orange-900/30 border border-orange-500/40 hover:border-orange-400 hover:bg-orange-800/40 transition-colors text-left"
                >
                  <span className="text-xs font-bold text-white">{item.worker.name}</span>
                  <span className="text-[10px] font-mono text-orange-300 bg-orange-500/20 px-1.5 py-0.5 rounded uppercase">{item.docType}</span>
                  <span className="text-[10px] text-gray-400 font-mono">{format(parseISO(item.expiry), "MMM d")}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Calendar View */}
        {calendarView && (() => {
          const monthDate = new Date(calendarMonth + "-01");
          const calStart = startOfWeek(startOfMonth(monthDate), { weekStartsOn: 1 });
          const calEnd = endOfWeek(endOfMonth(monthDate), { weekStartsOn: 1 });
          const days = eachDayOfInterval({ start: calStart, end: calEnd });
          const todayKey = format(new Date(), "yyyy-MM-dd");
          return (
            <div className="glass-panel rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-red-400" />
                  <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400">
                    Expiry Calendar — {format(monthDate, "MMMM yyyy")}
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCalendarMonth(format(addMonths(monthDate, -1), "yyyy-MM"))}
                    className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs font-mono text-gray-300 w-24 text-center">{format(monthDate, "MMM yyyy")}</span>
                  <button
                    onClick={() => setCalendarMonth(format(addMonths(monthDate, 1), "yyyy-MM"))}
                    className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-1">
                {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d) => (
                  <div key={d} className="text-center text-[10px] font-bold uppercase tracking-widest text-gray-500 pb-2">{d}</div>
                ))}
                {days.map((day) => {
                  const key = format(day, "yyyy-MM-dd");
                  const events = calendarEvents[key] ?? [];
                  const isToday = key === todayKey;
                  const inMonth = isSameMonth(day, monthDate);
                  return (
                    <div
                      key={key}
                      className={`min-h-[80px] p-1.5 rounded-lg border text-left ${isToday ? "border-red-500/60 bg-red-600/10" : inMonth ? "border-white/5 bg-white/[0.02]" : "border-transparent opacity-30"}`}
                    >
                      <p className={`text-[11px] font-mono font-bold mb-1 ${isToday ? "text-red-400" : inMonth ? "text-gray-400" : "text-gray-600"}`}>
                        {format(day, "d")}
                      </p>
                      <div className="space-y-0.5">
                        {events.slice(0, 3).map((ev, i) => (
                          <div key={i} className={`text-[9px] font-bold truncate px-1 py-0.5 rounded leading-tight ${ev.critical ? "bg-red-600/30 text-red-300" : "bg-yellow-600/30 text-yellow-300"}`}>
                            {ev.name.split(" ")[0]} · {ev.docType}
                          </div>
                        ))}
                        {events.length > 3 && (
                          <div className="text-[9px] text-gray-500 px-1">+{events.length - 3} more</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Data Table */}
        <div className="glass-panel rounded-xl overflow-hidden tech-border">
          <div className="overflow-x-auto">
            {/* table-layout:fixed + colgroup locks every header/cell to identical widths — no drift */}
            <table className="w-full text-left" style={{ tableLayout: "fixed", minWidth: "1000px" }}>
              <colgroup>
                <col style={{ width: "12%" }} />
                <col style={{ width: "9%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "7%" }} />
                <col style={{ width: "13%" }} />
                <col style={{ width: "17%" }} />
              </colgroup>
              <thead className="bg-slate-700/60 border-b border-slate-600">
                <tr>
                  <th className="sticky left-0 z-20 bg-slate-700/95 px-6 py-4 text-xs font-display font-bold uppercase tracking-widest text-white border-r border-white/5 text-left">{t("table.operator")}</th>
                  <th className="px-4 py-4 text-xs font-display font-bold uppercase tracking-widest text-white text-left">{t("table.spec")}</th>
                  <th className="px-4 py-4 text-xs font-display font-bold uppercase tracking-widest text-white text-left">{t("table.assignedSite")}</th>
                  <th className="px-4 py-4 text-xs font-display font-bold uppercase tracking-widest text-white text-left">{t("table.trcExpiry")}</th>
                  <th className="px-4 py-4 text-xs font-display font-bold uppercase tracking-widest text-white text-left">{t("table.passportExp")}</th>
                  <th className="px-4 py-4 text-xs font-display font-bold uppercase tracking-widest text-white text-left">{t("table.bhp")}</th>
                  <th className="px-4 py-4 text-xs font-display font-bold uppercase tracking-widest text-white text-left">Work Permit</th>
                  <th className="px-4 py-4 text-xs font-display font-bold uppercase tracking-widest text-white text-left">{t("table.docs")}</th>
                  <th className="px-4 py-4 text-xs font-display font-bold uppercase tracking-widest text-white text-left">{t("table.status")}</th>
                  <th className="px-4 py-4 text-xs font-display font-bold uppercase tracking-widest text-white text-center">{t("table.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono text-sm">
                {isLoadingWorkers ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={10} className="px-6 py-6">
                        <div className="h-4 bg-white/5 rounded animate-pulse w-full" />
                      </td>
                    </tr>
                  ))
                ) : workersData?.workers.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-6 py-12 text-center text-muted-foreground font-sans">
                      {t("table.noResults")}
                    </td>
                  </tr>
                ) : (
                  workersData?.workers.map((worker: any) => (
                    <tr 
                      key={worker.id} 
                      onClick={() => setSelectedWorkerId(worker.id)}
                      className="hover:bg-white/5 transition-colors cursor-pointer group"
                    >
                      <td className="sticky left-0 z-10 bg-slate-900/95 group-hover:bg-slate-800/95 px-4 py-3 border-r border-white/5 transition-colors overflow-hidden">
                        <div className="font-sans font-medium text-white truncate text-sm">{worker.name}</div>
                        {(worker as any).phone ? (
                          <div className="flex items-center gap-1 mt-1 flex-wrap">
                            <span className="text-[10px] text-gray-500 font-mono mr-0.5 truncate max-w-[70px]">{(worker as any).phone}</span>
                            <a
                              href={`tel:${(worker as any).phone}`}
                              onClick={(e) => e.stopPropagation()}
                              title={t("comm.call")}
                              className="w-6 h-6 flex items-center justify-center rounded-md bg-green-600/20 hover:bg-green-600/40 text-green-400 transition-colors flex-shrink-0 border border-green-500/30"
                            ><Phone className="w-3 h-3" /></a>
                            <a
                              href={`sms:${(worker as any).phone}`}
                              onClick={(e) => e.stopPropagation()}
                              title={t("comm.sms")}
                              className="w-6 h-6 flex items-center justify-center rounded-md bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 transition-colors flex-shrink-0 border border-blue-500/30"
                            ><MessageSquare className="w-3 h-3" /></a>
                            {(() => {
                              const urgentDoc = getUrgentDocType(worker);
                              const waUrl = buildWhatsAppUrl((worker as any).phone, urgentDoc);
                              if (urgentDoc) {
                                return (
                                  <a
                                    href={waUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    title={t("comm.urgentTitle")}
                                    className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-red-600 hover:bg-red-500 text-white text-[8px] font-bold uppercase tracking-wide transition-colors flex-shrink-0 animate-pulse border border-red-400"
                                  >
                                    <AlertTriangle className="w-2.5 h-2.5" />
                                    {t("comm.urgentAlert")}
                                  </a>
                                );
                              }
                              return (
                                <a
                                  href={waUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  title={t("comm.whatsapp")}
                                  className="w-6 h-6 flex items-center justify-center rounded-md bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 transition-colors flex-shrink-0 border border-emerald-500/30"
                                ><WhatsAppIcon className="w-3 h-3" /></a>
                              );
                            })()}
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground truncate">{worker.email || '—'}</div>
                        )}
                      </td>
                      <td className="px-4 py-4 overflow-hidden">
                        <span className="px-2 py-1 rounded bg-white/10 border border-white/20 text-xs font-bold text-white">
                          {worker.specialization || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-4 overflow-hidden">
                        {(worker as any).assignedSite ? (
                          <span className="px-2 py-1 rounded-full bg-red-600/20 border border-red-500/40 text-xs font-bold text-red-300 truncate block max-w-full">
                            {(worker as any).assignedSite}
                          </span>
                        ) : (
                          <span className="text-gray-600 text-xs font-mono">—</span>
                        )}
                      </td>
                      <td className="px-4 py-4 overflow-hidden text-white font-mono text-sm">
                        {worker.trcExpiry ? format(parseISO(worker.trcExpiry), 'MMM d, yy') : <span className="text-gray-500">—</span>}
                      </td>
                      <td className="px-4 py-4 overflow-hidden text-white font-mono text-sm">
                        {(worker as any).passportExpiry ? format(parseISO((worker as any).passportExpiry), 'MMM d, yy') : <span className="text-gray-500">—</span>}
                      </td>
                      <td className="px-4 py-4 overflow-hidden font-mono text-sm">
                        {(() => {
                          const v = worker.bhpStatus;
                          if (!v) return <span className="text-gray-500">—</span>;
                          const d = new Date(v);
                          if (!isNaN(d.getTime()) && v.includes('-')) {
                            const expired = d < new Date();
                            return <span className={expired ? 'text-destructive font-bold' : 'text-success font-bold'}>{format(parseISO(v), 'MMM d, yy')}</span>;
                          }
                          const lower = v.toLowerCase();
                          return <span className={lower === 'active' ? 'text-success font-bold' : 'text-destructive font-bold'}>{v}</span>;
                        })()}
                      </td>
                      <td className="px-4 py-4 overflow-hidden font-mono text-sm">
                        {(worker as any).workPermitExpiry ? (() => {
                          const d = parseISO((worker as any).workPermitExpiry);
                          const expired = d < new Date();
                          const warn = !expired && d < new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
                          return <span className={expired ? "text-destructive font-bold" : warn ? "text-yellow-400 font-bold" : "text-success font-bold"}>{format(d, "MMM d, yy")}</span>;
                        })() : <span className="text-gray-500">—</span>}
                      </td>
                      <td className="px-4 py-4 overflow-hidden">
                        <div className="flex items-center gap-1 flex-wrap">
                          {(worker as any).passportAttachments?.length > 0 && (
                            <span title="Passport" className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">PP</span>
                          )}
                          {(worker as any).trcAttachments?.length > 0 && (
                            <span title="TRC" className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-500/20 text-green-300 border border-green-500/30">TRC</span>
                          )}
                          {(worker as any).bhpAttachments?.length > 0 && (
                            <span title="BHP Certificate" className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-500/20 text-orange-300 border border-orange-500/30">BHP</span>
                          )}
                          {(worker as any).contractAttachments?.length > 0 && (
                            <span title="Contract" className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-violet-500/20 text-violet-300 border border-violet-500/30">CON</span>
                          )}
                          {/* Polish compliance indicators */}
                          {(worker as any).medicalExamExpiry && (() => {
                            const d = new Date((worker as any).medicalExamExpiry);
                            const expired = d < new Date();
                            const warn = !expired && d < new Date(Date.now() + 60*24*60*60*1000);
                            return <span title={`Medical Exam: ${(worker as any).medicalExamExpiry}`} className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${expired ? "bg-red-500/20 text-red-300 border-red-500/40" : warn ? "bg-yellow-500/20 text-yellow-300 border-yellow-500/40" : "bg-teal-500/20 text-teal-300 border-teal-500/40"}`}>MED</span>;
                          })()}
                          {(worker as any).oswiadczenieExpiry && (() => {
                            const d = new Date((worker as any).oswiadczenieExpiry);
                            const expired = d < new Date();
                            const warn = !expired && d < new Date(Date.now() + 60*24*60*60*1000);
                            return <span title={`Oświadczenie: ${(worker as any).oswiadczenieExpiry}`} className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${expired ? "bg-red-500/20 text-red-300 border-red-500/40" : warn ? "bg-yellow-500/20 text-yellow-300 border-yellow-500/40" : "bg-indigo-500/20 text-indigo-300 border-indigo-500/40"}`}>OŚW</span>;
                          })()}
                          {(worker as any).udtCertExpiry && (() => {
                            const d = new Date((worker as any).udtCertExpiry);
                            const expired = d < new Date();
                            const warn = !expired && d < new Date(Date.now() + 60*24*60*60*1000);
                            return <span title={`UDT Cert: ${(worker as any).udtCertExpiry}`} className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${expired ? "bg-red-500/20 text-red-300 border-red-500/40" : warn ? "bg-yellow-500/20 text-yellow-300 border-yellow-500/40" : "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"}`}>UDT</span>;
                          })()}
                          {!(worker as any).passportAttachments?.length && !(worker as any).trcAttachments?.length && !(worker as any).bhpAttachments?.length && !(worker as any).contractAttachments?.length && !(worker as any).medicalExamExpiry && !(worker as any).oswiadczenieExpiry && !(worker as any).udtCertExpiry && (
                            <span className="text-gray-600 text-xs">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 overflow-hidden">
                        <StatusBadge status={worker.complianceStatus} />
                      </td>
                      <td className="px-4 py-4 overflow-hidden">
                        <div className="flex justify-center items-center gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); setPanelEditMode(true); setSelectedWorkerId(worker.id); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-700 hover:bg-red-600 text-white border border-red-500 hover:border-red-400 text-xs font-bold uppercase tracking-wide transition-all shadow-[0_0_10px_rgba(196,30,24,0.3)] whitespace-nowrap"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            <span>{t("table.viewEdit")}</span>
                          </button>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={(e) => handleNotify(e, worker)}
                              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-white transition-colors"
                              title={t("table.notifyWorker")}
                            >
                              <Bell className="w-3.5 h-3.5" />
                            </button>
                            <button 
                              onClick={(e) => handleRenew(e, worker)}
                              className="p-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 transition-colors"
                              title={t("table.renewDocument")}
                            >
                              <RefreshCcw className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      <WorkerProfilePanel 
        workerId={selectedWorkerId}
        initialEditMode={panelEditMode}
        onClose={() => { setSelectedWorkerId(null); setPanelEditMode(false); }} 
        onRenew={(w) => { setSelectedWorkerId(null); setPanelEditMode(false); setActionWorker(w); setRenewOpen(true); }}
        onNotify={(w) => { setSelectedWorkerId(null); setPanelEditMode(false); setActionWorker(w); setNotifyOpen(true); }}
      />
      
      {actionWorker && (
        <>
          <NotifyDialog worker={actionWorker} isOpen={notifyOpen} onClose={() => setNotifyOpen(false)} />
          <RenewDialog worker={actionWorker} isOpen={renewOpen} onClose={() => setRenewOpen(false)} />
        </>
      )}

      <ComplianceReportModal isOpen={reportOpen} onClose={() => setReportOpen(false)} />
      <BulkUploadModal isOpen={bulkUploadOpen} onClose={() => setBulkUploadOpen(false)} />
      <AddWorkerModal
        isOpen={addWorkerOpen}
        onClose={() => setAddWorkerOpen(false)}
        onCreated={(id) => setSelectedWorkerId(id)}
      />
    </div>
  );
}
