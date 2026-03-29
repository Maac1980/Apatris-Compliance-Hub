import { KnowledgeCenter } from "@/components/KnowledgeCenter";
import React, { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useAuth } from "@/lib/auth";
import { useGetWorkers, useGetWorkerStats } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { 
  Users, AlertTriangle, ShieldAlert, Clock, 
  Search, Filter, LogOut, FileText, Bell, RefreshCcw, Zap, Pencil, Building2, Settings,
  Phone, MessageSquare, TrendingUp, Calculator, Download, Upload, CalendarDays, ChevronLeft, ChevronRight,
  CheckSquare, Square, Archive, X, Send, History
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";

import { format, parseISO, addMonths, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek, isSameMonth } from "date-fns";
import { useTranslation } from "react-i18next";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

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

import { useToast } from "@/hooks/use-toast";
import { WorkerRowSkeleton, StatCardSkeleton, SiteCardSkeleton } from "@/components/Skeleton";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { WorkerProfilePanel } from "@/components/WorkerProfilePanel";
import { NotifyDialog, RenewDialog } from "@/components/ActionDialogs";
import { ComplianceReportModal } from "@/components/ComplianceReportModal";
import { BulkUploadModal } from "@/components/BulkUploadModal";
import { NotificationBell } from "@/components/NotificationBell";
import { AddWorkerModal } from "@/components/AddWorkerModal";
import { BulkImportModal } from "@/components/BulkImportModal";

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
  const { toast } = useToast();
  const { t } = useTranslation();
  const isAdmin = user?.role === "Admin";
  const [, setLocation] = useLocation();
  
  const [search, setSearch] = useState("");
  const [specialization, setSpecialization] = useState("");
  const [status, setStatus] = useState("");
  const [site, setSite] = useState("");

  // Seed today's snapshot once on mount so trend chart has data from day 1
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}api/compliance/snapshot`, { method: "POST", headers: authHeaders() }).catch((err) => { console.error("[Dashboard] Compliance snapshot seed failed:", err); });
  }, []);

  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
  const [panelEditMode, setPanelEditMode] = useState(false);
  const [actionWorker, setActionWorker] = useState<any | null>(null);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [renewOpen, setRenewOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
  const [addWorkerOpen, setAddWorkerOpen] = useState(false);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [calendarView, setCalendarView] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => format(new Date(), "yyyy-MM"));
  const [showArchived, setShowArchived] = useState(false);
  const [selectedWorkers, setSelectedWorkers] = useState<Set<string>>(new Set());
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [mobileBannerDismissed, setMobileBannerDismissed] = useState(() =>
    localStorage.getItem("apatris-install-dismissed") === "1"
  );
  const [isInstalledPWA] = useState(() =>
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  );

  // Device detection for the install banner
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

  // Capture the beforeinstallprompt event for Android Chrome one-tap install
  useEffect(() => {
    const handler = (e: Event) => { e.preventDefault(); setDeferredPrompt(e); };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const isCoordinator = user?.role === "Coordinator";

  // Site-scoped coordinator: auto-lock to assigned site
  useEffect(() => {
    if (user?.assignedSite) setSite(user.assignedSite);
  }, [user?.assignedSite]);

  // QR deep-link: ?worker=<id> auto-opens the profile panel
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const wid = params.get("worker");
    if (wid) {
      setSelectedWorkerId(wid);
      // Clean URL without page reload
      const clean = window.location.pathname + window.location.hash;
      window.history.replaceState({}, "", clean);
    }
  }, []);

  const { data: workersData, isLoading: isLoadingWorkers } = useGetWorkers({ 
    search: search || undefined, 
    specialization: specialization || undefined, 
    status: status || undefined,
    site: site || undefined,
    showArchived: showArchived ? "true" : undefined,
  } as any);
  
  const { data: stats } = useGetWorkerStats();

  // Live site list from Airtable — refreshes whenever a worker's site is updated
  const { data: sitesData } = useQuery<{ sites: string[] }>({
    queryKey: ["workers-sites"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/workers/sites`, { headers: authHeaders() });
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
      const res = await fetch(`${import.meta.env.BASE_URL}api/compliance/trend`, { headers: authHeaders() });
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

  // Days forecast — expiry counts for next 30, 60, 90 days across all workers
  const forecastCounts = React.useMemo(() => {
    const ws = allWorkersData?.workers ?? [];
    const now = Date.now();
    const DAY = 86400000;
    let d30 = 0, d60 = 0, d90 = 0;
    for (const w of ws as any[]) {
      const dates = [w.trcExpiry, w.passportExpiry, w.workPermitExpiry, w.contractEndDate, w.medicalExamExpiry, w.bhpStatus?.includes("-") ? w.bhpStatus : null];
      for (const d of dates) {
        if (!d) continue;
        const diff = new Date(d).getTime() - now;
        if (diff > 0 && diff <= 30 * DAY) d30++;
        else if (diff > 0 && diff <= 60 * DAY) d60++;
        else if (diff > 0 && diff <= 90 * DAY) d90++;
      }
    }
    return { d30, d60, d90 };
  }, [allWorkersData]);

  function daysLeftBadge(dateStr: string | null | undefined): React.ReactNode {
    if (!dateStr) return null;
    const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
    if (diff < 0) return <span className="ml-1 px-1 py-0.5 rounded text-[9px] font-bold bg-red-600/40 text-red-300 border border-red-500/30">EXP</span>;
    if (diff <= 30) return <span className="ml-1 px-1 py-0.5 rounded text-[9px] font-bold bg-red-600/30 text-red-300 border border-red-500/30">{diff}d</span>;
    if (diff <= 60) return <span className="ml-1 px-1 py-0.5 rounded text-[9px] font-bold bg-yellow-600/30 text-yellow-300 border border-yellow-500/30">{diff}d</span>;
    return null;
  }

  const handleDownloadCSV = () => {
    const ws = (workersData?.workers ?? allWorkersData?.workers ?? []) as any[];
    const headers = ["Name","Specialization","Site","Status","TRC Expiry","Passport Expiry","BHP Expiry","Work Permit Expiry","Contract End","Compliance Status","Email","Phone"];
    const rows = (ws as any[]).map((w) => [
      w.name, w.specialization||"", w.assignedSite||"", w.workerStatus||"Active",
      w.trcExpiry||"", w.passportExpiry||"", w.bhpStatus||"",
      w.workPermitExpiry||"", w.contractEndDate||"",
      w.complianceStatus||"", w.email||"", w.phone||"",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v: any) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `apatris-workers-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
    toast({ title: "Export complete", description: `${ws.length} workers saved to CSV.` });
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
    <div className="app-shell-page bg-slate-900 text-foreground flex flex-col relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/8 blur-[140px] rounded-full" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[40%] h-[40%] bg-primary/5 blur-[120px] rounded-full" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60%] h-[30%] bg-destructive/3 blur-[160px] rounded-full" />
      </div>

      <main className="flex-1 overflow-y-auto z-10 w-full">
        {/* ── Action toolbar ───────────────────────────────────────────────── */}
        <div className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur border-b border-slate-700/50 px-4 sm:px-6 py-2"
          style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.3)" }}>
          <div className="overflow-x-auto no-scrollbar">
            <div className="flex items-center gap-2 w-max">

              {/* ⚡ AI Smart Upload */}
              {isAdmin && (
                <button onClick={() => setBulkUploadOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-red-500/60 text-red-400 hover:bg-red-600 hover:text-white rounded-lg text-xs font-mono font-bold uppercase tracking-wide transition-all hover:shadow-[0_0_12px_rgba(196,30,24,0.4)]">
                  <Zap className="w-3.5 h-3.5" /><span className="hidden sm:inline">{t("header.aiUpload")}</span>
                </button>
              )}

              {/* + Add Worker */}
              {isAdmin && (
                <button onClick={() => setAddWorkerOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#C41E18] hover:bg-red-500 border border-red-400/60 text-white rounded-lg text-xs font-mono font-bold uppercase tracking-wide transition-all shadow-[0_0_10px_rgba(196,30,24,0.35)]">
                  <Users className="w-3.5 h-3.5" /><span className="hidden sm:inline">Add Worker</span>
                </button>
              )}

              {/* ↑ Bulk Import */}
              {isAdmin && (
                <button onClick={() => setBulkImportOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-lime-500/50 text-lime-400 hover:bg-lime-600 hover:text-white rounded-lg text-xs font-mono font-bold uppercase tracking-wide transition-all">
                  <Upload className="w-3.5 h-3.5" /><span className="hidden sm:inline">Bulk Import</span>
                </button>
              )}

              {/* 📄 Report */}
              <button onClick={() => setReportOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-600 text-gray-300 hover:bg-slate-700 hover:text-white rounded-lg text-xs font-mono font-bold uppercase tracking-wide transition-all">
                <FileText className="w-3.5 h-3.5" /><span className="hidden sm:inline">{t("header.generateReport")}</span>
              </button>

              {/* ↓ Export */}
              <button onClick={handleDownloadCSV}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-600 text-gray-300 hover:bg-slate-700 hover:text-white rounded-lg text-xs font-mono font-bold uppercase tracking-wide transition-all">
                <Download className="w-3.5 h-3.5" /><span className="hidden sm:inline">Export</span>
              </button>

              {/* 🔔 Notifications */}
              <NotificationBell onSelectWorker={(id) => setSelectedWorkerId(id)} />

              {/* 🌐 Language */}
              <LanguageToggle />

              {/* 📲 Install App */}
              <button
                onClick={async () => {
                  if (deferredPrompt) {
                    deferredPrompt.prompt();
                    await deferredPrompt.userChoice;
                    setDeferredPrompt(null);
                  } else {
                    setShowInstallModal(true);
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-lime-500/40 text-lime-400/80 hover:bg-lime-600 hover:text-white rounded-lg text-xs font-mono font-bold uppercase tracking-wide transition-all"
                title="Install as app on your device"
              >
                <Download className="w-3.5 h-3.5" /><span className="hidden lg:inline">Install App</span>
              </button>
            </div>
          </div>
        </div>

        {/* ── Page content ─────────────────────────────────────────────────── */}
        <div className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto w-full space-y-8">

        {/* ── Section Navigation Grid ───────────────────────────────────────── */}
        <div className="hidden md:grid grid-cols-4 gap-4">
          {([
            { path: "/",                  labelKey: "cards.workers",     icon: Users,         solidBg: "bg-[#ef4444]",  border: "border-red-500",    shadow: "hover:shadow-[0_6px_24px_rgba(239,68,68,0.45)]"  },
            { path: "/payroll",           labelKey: "cards.payroll",     icon: Calculator,    solidBg: "bg-[#22c55e]",  border: "border-green-500",  shadow: "hover:shadow-[0_6px_24px_rgba(34,197,94,0.40)]"  },
            { path: "/compliance-alerts", labelKey: "cards.alerts",      icon: AlertTriangle, solidBg: "bg-[#f59e0b]",  border: "border-amber-500",  shadow: "hover:shadow-[0_6px_24px_rgba(245,158,11,0.40)]" },
            { path: "/history",           labelKey: "cards.history",     icon: History,       solidBg: "bg-[#a855f7]",  border: "border-purple-500", shadow: "hover:shadow-[0_6px_24px_rgba(168,85,247,0.40)]" },
          ] as const).map(({ path, labelKey, icon: Icon, solidBg, border, shadow }) => (
            <button
              key={path}
              onClick={() => setLocation(path)}
              className={[
                "group flex flex-col items-center justify-center gap-3 rounded-2xl py-6",
                solidBg, border, "border",
                "transition-all duration-200 cursor-pointer hover:-translate-y-1",
                shadow,
              ].join(" ")}
            >
              <Icon className="w-10 h-10 text-white transition-transform duration-200 group-hover:scale-110" strokeWidth={1.8} />
              <span className="text-sm font-bold uppercase tracking-widest text-white/90 group-hover:text-white transition-colors text-center leading-tight px-3">
                {t(labelKey)}
              </span>
            </button>
          ))}
        </div>

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
                <Line type="monotone" dataKey="compliant" stroke="#22c55e" strokeWidth={2} dot={false} name={t("chart.compliant")} />
                <Line type="monotone" dataKey="warning" stroke="#eab308" strokeWidth={2} dot={false} name={t("chart.warning")} />
                <Line type="monotone" dataKey="critical" stroke="#C41E18" strokeWidth={2} dot={false} name={t("chart.critical")} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Forecast Panel — upcoming expirations */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Expiring in 30 days", count: forecastCounts.d30, color: forecastCounts.d30 > 0 ? "border-red-500/40 bg-red-600/5 text-red-400" : "border-white/10 text-gray-400" },
            { label: "Expiring in 60 days", count: forecastCounts.d60, color: forecastCounts.d60 > 0 ? "border-yellow-500/40 bg-yellow-600/5 text-yellow-400" : "border-white/10 text-gray-400" },
            { label: "Expiring in 90 days", count: forecastCounts.d90, color: forecastCounts.d90 > 0 ? "border-blue-500/40 bg-blue-600/5 text-blue-400" : "border-white/10 text-gray-400" },
          ].map(({ label, count, color }) => (
            <div key={label} className={`rounded-xl border p-4 flex items-center gap-4 ${color}`}>
              <Clock className="w-6 h-6 flex-shrink-0 opacity-70" />
              <div>
                <p className="text-2xl font-mono font-bold">{count}</p>
                <p className="text-[10px] font-bold uppercase tracking-widest opacity-70 mt-0.5">{label}</p>
              </div>
            </div>
          ))}
        </div>

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
                onChange={(e) => !isCoordinator && setSite(e.target.value)}
                disabled={isCoordinator}
                className={`w-full pl-10 pr-8 py-2.5 bg-slate-900 border border-slate-500 rounded-lg text-sm font-mono text-white appearance-none focus:outline-none focus:border-primary/60 transition-colors ${isCoordinator ? "opacity-60 cursor-not-allowed" : ""}`}
              >
                <option value="">{t("table.allClientsProjects")}</option>
                {availableSites.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <button
              onClick={() => setShowArchived(!showArchived)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-mono font-bold uppercase tracking-wide border transition-all whitespace-nowrap ${showArchived ? "bg-slate-600 border-slate-400 text-white" : "border-slate-500 text-gray-400 hover:bg-slate-700 hover:text-white"}`}
              title="Show archived/departed workers"
            >
              <Archive className="w-4 h-4" />
              <span className="hidden sm:inline">Archived</span>
            </button>
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

          {/* ── Mobile Card List (phones / small tablets) ──────────────────── */}
          <div className="md:hidden">
            {isLoadingWorkers ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="p-3 rounded-xl border border-slate-700/40 bg-slate-800/30 space-y-2">
                    <div className="relative overflow-hidden rounded bg-slate-700 h-4 w-36">
                      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
                    </div>
                    <div className="relative overflow-hidden rounded bg-slate-700 h-3 w-24">
                      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (workersData?.workers ?? []).length === 0 ? (
              <div className="p-8 text-center text-gray-500 font-mono text-sm">{t("table.noResults")}</div>
            ) : (
              <div className="divide-y divide-white/5">
                {(workersData?.workers ?? []).map((worker: any) => {
                  const cs = worker.complianceStatus as string;
                  const borderColor = cs === "critical" || cs === "non-compliant" ? "border-l-red-500" : cs === "warning" ? "border-l-yellow-500" : "border-l-green-500";
                  return (
                    <button
                      key={worker.id}
                      onClick={() => setSelectedWorkerId(worker.id)}
                      className={`w-full text-left px-4 py-3 hover:bg-white/5 transition-colors border-l-2 ${borderColor} flex items-start gap-3`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <p className="font-semibold text-white text-sm truncate">{worker.name}</p>
                          <StatusBadge status={worker.complianceStatus} />
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {worker.assignedSite && <span className="text-[10px] font-mono text-red-400 bg-red-500/10 px-2 py-0.5 rounded">{worker.assignedSite}</span>}
                          {worker.specialization && <span className="text-[10px] font-mono text-gray-400">{worker.specialization}</span>}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap mt-1.5">
                          {worker.trcExpiry && <span className="text-[10px] font-mono text-gray-500">TRC: {daysLeftBadge(worker.trcExpiry)}</span>}
                          {worker.passportExpiry && <span className="text-[10px] font-mono text-gray-500">PP: {daysLeftBadge(worker.passportExpiry)}</span>}
                        </div>
                      </div>
                      <svg className="w-4 h-4 text-gray-600 flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Desktop Table ───────────────────────────────────────────────── */}
          <div className="hidden md:block">
          <div className="overflow-x-auto">
            {/* table-layout:fixed + colgroup locks every header/cell to identical widths — no drift */}
            <table className="w-full text-left" style={{ tableLayout: "fixed", minWidth: "1060px" }}>
              <colgroup>
                <col style={{ width: "3%" }} />
                <col style={{ width: "11%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "9%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "7%" }} />
                <col style={{ width: "7%" }} />
                <col style={{ width: "13%" }} />
                <col style={{ width: "18%" }} />
              </colgroup>
              <thead className="bg-slate-700/60 border-b border-slate-600">
                <tr>
                  <th className="sticky left-0 z-20 bg-slate-700/95 px-3 py-4 border-r border-white/5 text-center w-10">
                    <button
                      onClick={() => {
                        const ids = workersData?.workers.map((w: any) => w.id) ?? [];
                        if (ids.every((id: string) => selectedWorkers.has(id))) {
                          setSelectedWorkers(new Set());
                        } else {
                          setSelectedWorkers(new Set(ids));
                        }
                      }}
                      className="text-gray-400 hover:text-white transition-colors"
                    >
                      {(workersData?.workers ?? []).every((w: any) => selectedWorkers.has(w.id)) && (workersData?.workers ?? []).length > 0
                        ? <CheckSquare className="w-4 h-4 text-red-400" />
                        : <Square className="w-4 h-4" />}
                    </button>
                  </th>
                  <th className="sticky left-10 z-20 bg-slate-700/95 px-4 py-4 text-xs font-display font-bold uppercase tracking-widest text-white border-r border-white/5 text-left">{t("table.operator")}</th>
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
                  Array.from({ length: 8 }).map((_, i) => (
                    <WorkerRowSkeleton key={i} cols={11} />
                  ))
                ) : workersData?.workers.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-6 py-12 text-center text-muted-foreground font-sans">
                      {t("table.noResults")}
                    </td>
                  </tr>
                ) : (
                  workersData?.workers.map((worker: any) => {
                    const isSelected = selectedWorkers.has(worker.id);
                    return (
                    <tr 
                      key={worker.id} 
                      onClick={() => setSelectedWorkerId(worker.id)}
                      className={`hover:bg-white/5 transition-colors cursor-pointer group ${isSelected ? "bg-red-900/10 border-l-2 border-red-500" : ""}`}
                    >
                      <td className="sticky left-0 z-10 bg-slate-900/95 group-hover:bg-slate-800/95 px-3 py-3 border-r border-white/5 transition-colors text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelectedWorkers((prev) => { const n = new Set(prev); isSelected ? n.delete(worker.id) : n.add(worker.id); return n; }); }}
                          className="text-gray-400 hover:text-white transition-colors"
                        >
                          {isSelected ? <CheckSquare className="w-4 h-4 text-red-400" /> : <Square className="w-4 h-4" />}
                        </button>
                      </td>
                      <td className="sticky left-10 z-10 bg-slate-900/95 group-hover:bg-slate-800/95 px-4 py-3 border-r border-white/5 transition-colors overflow-hidden">
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
                        <span className="inline-flex items-center flex-wrap">
                          {worker.trcExpiry ? format(parseISO(worker.trcExpiry), 'MMM d, yy') : <span className="text-gray-500">—</span>}
                          {daysLeftBadge(worker.trcExpiry)}
                        </span>
                      </td>
                      <td className="px-4 py-4 overflow-hidden text-white font-mono text-sm">
                        <span className="inline-flex items-center flex-wrap">
                          {(worker as any).passportExpiry ? format(parseISO((worker as any).passportExpiry), 'MMM d, yy') : <span className="text-gray-500">—</span>}
                          {daysLeftBadge((worker as any).passportExpiry)}
                        </span>
                      </td>
                      <td className="px-4 py-4 overflow-hidden font-mono text-sm">
                        {(() => {
                          const v = worker.bhpStatus;
                          if (!v) return <span className="text-gray-500">—</span>;
                          const d = new Date(v);
                          if (!isNaN(d.getTime()) && v.includes('-')) {
                            const expired = d < new Date();
                            return <span className="inline-flex items-center gap-1 flex-wrap"><span className={expired ? 'text-destructive font-bold' : 'text-success font-bold'}>{format(parseISO(v), 'MMM d, yy')}</span>{daysLeftBadge(v)}</span>;
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
                          return <span className="inline-flex items-center gap-1 flex-wrap"><span className={expired ? "text-destructive font-bold" : warn ? "text-yellow-400 font-bold" : "text-success font-bold"}>{format(d, "MMM d, yy")}</span>{daysLeftBadge((worker as any).workPermitExpiry)}</span>;
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
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          </div>{/* end hidden md:block */}
        </div>
        </div>{/* end page content wrapper */}
      </main>

      {/* Bulk WhatsApp floating action bar */}
      {selectedWorkers.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 px-5 py-3 rounded-2xl bg-slate-800 border border-slate-600 shadow-2xl shadow-black/50">
          <span className="text-sm font-bold text-white font-mono">{selectedWorkers.size} selected</span>
          <div className="w-px h-5 bg-white/20" />
          <button
            onClick={() => {
              const workers = workersData?.workers ?? [];
              const targets = workers.filter((w: any) => selectedWorkers.has(w.id) && w.phone);
              if (targets.length === 0) { alert("No phone numbers available for selected workers."); return; }
              const msg = encodeURIComponent("Dzień dobry, tutaj biuro Apatris. Prosimy o sprawdzenie ważności dokumentów. Dziękujemy.");
              for (const w of targets) {
                const num = String(w.phone).replace(/\D/g, "");
                const n48 = num.startsWith("48") ? num : num.length === 9 ? "48" + num : "48" + num;
                window.open(`https://wa.me/${n48}?text=${msg}`, "_blank");
              }
              setSelectedWorkers(new Set());
            }}
            className="flex items-center gap-2 px-4 py-1.5 rounded-xl bg-green-600 hover:bg-green-500 text-white text-sm font-bold uppercase tracking-wide transition-colors border border-green-400"
          >
            <Send className="w-4 h-4" />
            Send WhatsApp
          </button>
          <button
            onClick={() => setSelectedWorkers(new Set())}
            className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
            title="Clear selection"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

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
      <BulkImportModal isOpen={bulkImportOpen} onClose={() => setBulkImportOpen(false)} />
      <AddWorkerModal
        isOpen={addWorkerOpen}
        onClose={() => setAddWorkerOpen(false)}
        onCreated={(id) => setSelectedWorkerId(id)}
      />

      {/* Install App Modal */}
      {showInstallModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setShowInstallModal(false)}>
          <div className="bg-slate-900 border border-lime-500/30 rounded-2xl shadow-2xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-bold text-white uppercase tracking-wider">Install App</h2>
                <p className="text-xs text-gray-400 font-mono mt-0.5">Add APATRIS to your home screen</p>
              </div>
              <button onClick={() => setShowInstallModal(false)} className="p-1.5 text-gray-500 hover:text-white transition-colors rounded-lg hover:bg-white/10"><X className="w-5 h-5" /></button>
            </div>

            {/* QR Code */}
            <div className="mb-5 bg-slate-800 border border-lime-500/30 rounded-xl p-4 flex flex-col items-center">
              <p className="text-xs text-gray-400 font-mono mb-3 uppercase tracking-wider self-start">Scan to open on your phone</p>
              <div className="bg-white p-3 rounded-xl shadow-lg">
                <QRCodeSVG
                  value={window.location.origin}
                  size={180}
                  bgColor="#ffffff"
                  fgColor="#0f172a"
                  level="M"
                  includeMargin={false}
                />
              </div>
              <p className="text-xs text-gray-400 font-mono mt-3 text-center">
                Point your phone camera at this code<br />
                <span className="text-lime-400">→ open link → follow install steps below</span>
              </p>
              {/* URL copy row */}
              <div className="w-full mt-3 flex items-center gap-2">
                <code className="flex-1 text-xs text-lime-400 font-mono bg-black/30 rounded-lg px-3 py-2 truncate select-all">
                  {window.location.origin}
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(window.location.origin);
                    setUrlCopied(true);
                    setTimeout(() => setUrlCopied(false), 2000);
                  }}
                  className="flex-shrink-0 px-3 py-2 text-xs font-bold text-black bg-lime-500 hover:bg-lime-400 rounded-lg transition-colors font-mono uppercase"
                >
                  {urlCopied ? "Copied ✓" : "Copy"}
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {/* Android */}
              <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-lg bg-lime-500/20 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-lime-400" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18c0 .55.45 1 1 1h1v3.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V19h2v3.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V19h1c.55 0 1-.45 1-1V8H6v10zM3.5 8C2.67 8 2 8.67 2 9.5v7c0 .83.67 1.5 1.5 1.5S5 17.33 5 16.5v-7C5 8.67 4.33 8 3.5 8zm17 0c-.83 0-1.5.67-1.5 1.5v7c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5v-7c0-.83-.67-1.5-1.5-1.5zm-4.97-5.84l1.3-1.3c.2-.2.2-.51 0-.71-.2-.2-.51-.2-.71 0l-1.48 1.48A5.84 5.84 0 0 0 12 1.5c-.96 0-1.86.23-2.66.63L7.85.65c-.2-.2-.51-.2-.71 0-.2.2-.2.51 0 .71l1.31 1.31A5.981 5.981 0 0 0 6 7.5h12a5.98 5.98 0 0 0-2.47-5.34zM10 5H9V4h1v1zm5 0h-1V4h1v1z"/></svg>
                  </div>
                  <span className="text-sm font-bold text-lime-400 uppercase tracking-wider">Android (Chrome)</span>
                </div>
                <ol className="space-y-1.5 text-sm text-gray-300 font-mono">
                  <li className="flex gap-2"><span className="text-lime-500 font-bold">1.</span> Tap the <span className="text-white font-bold">⋮ three-dot menu</span> at top right</li>
                  <li className="flex gap-2"><span className="text-lime-500 font-bold">2.</span> Tap <span className="text-white font-bold">"Install App"</span> or <span className="text-white font-bold">"Add to Home Screen"</span></li>
                  <li className="flex gap-2"><span className="text-lime-500 font-bold">3.</span> Tap <span className="text-white font-bold">Install</span> — done ✓</li>
                </ol>
              </div>

              {/* iPhone */}
              <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-blue-400" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
                  </div>
                  <span className="text-sm font-bold text-blue-400 uppercase tracking-wider">iPhone / iPad (Safari)</span>
                </div>
                <ol className="space-y-1.5 text-sm text-gray-300 font-mono">
                  <li className="flex gap-2"><span className="text-blue-400 font-bold">1.</span> Open this URL in <span className="text-white font-bold">Safari</span> (not Chrome)</li>
                  <li className="flex gap-2"><span className="text-blue-400 font-bold">2.</span> Tap the <span className="text-white font-bold">Share button</span> <span className="text-gray-400">(box with arrow, bottom bar)</span></li>
                  <li className="flex gap-2"><span className="text-blue-400 font-bold">3.</span> Scroll down → tap <span className="text-white font-bold">"Add to Home Screen"</span></li>
                  <li className="flex gap-2"><span className="text-blue-400 font-bold">4.</span> Tap <span className="text-white font-bold">Add</span> — done ✓</li>
                </ol>
              </div>

              {/* Mac Chrome/Edge */}
              <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-lg bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
                  </div>
                  <span className="text-sm font-bold text-purple-400 uppercase tracking-wider">Mac — Chrome or Edge</span>
                </div>
                <ol className="space-y-1.5 text-sm text-gray-300 font-mono">
                  <li className="flex gap-2"><span className="text-purple-400 font-bold">1.</span> Open the app URL in <span className="text-white font-bold">Chrome</span> or <span className="text-white font-bold">Edge</span></li>
                  <li className="flex gap-2"><span className="text-purple-400 font-bold">2.</span> Look at the <span className="text-white font-bold">right side of the address bar</span> — click the <span className="text-white font-bold">⊕ install icon</span> (or screen with arrow icon)</li>
                  <li className="flex gap-2"><span className="text-purple-400 font-bold">3.</span> Click <span className="text-white font-bold">Install</span> — APATRIS opens as its own app with the logo ✓</li>
                </ol>
              </div>

              {/* Mac Safari */}
              <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-blue-400" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
                  </div>
                  <span className="text-sm font-bold text-blue-400 uppercase tracking-wider">Mac — Safari (macOS Sonoma+)</span>
                </div>
                <ol className="space-y-1.5 text-sm text-gray-300 font-mono">
                  <li className="flex gap-2"><span className="text-blue-400 font-bold">1.</span> Open the URL in <span className="text-white font-bold">Safari</span></li>
                  <li className="flex gap-2"><span className="text-blue-400 font-bold">2.</span> Click <span className="text-white font-bold">File</span> in the menu bar → <span className="text-white font-bold">"Add to Dock"</span></li>
                  <li className="flex gap-2"><span className="text-blue-400 font-bold">3.</span> Click <span className="text-white font-bold">Add</span> — the Apatris icon appears in your Dock ✓</li>
                </ol>
                <p className="text-xs text-gray-500 font-mono mt-2">Requires macOS Sonoma (14) or later</p>
              </div>
            </div>

            <p className="text-center text-xs text-gray-500 font-mono mt-4">Once installed, the app opens full-screen with no browser bar.</p>
          </div>
        </div>
      )}

      {/* ── Mobile Install Banner ─────────────────────────────────────────── */}
      {isMobile && !isInstalledPWA && !mobileBannerDismissed && (
        <div className="fixed bottom-0 left-0 right-0 z-50 sm:hidden"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
          <div className="bg-slate-900 border-t border-lime-500/40 shadow-2xl px-4 pt-4 pb-5">
            {/* Header row */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-[#C41E18] flex items-center justify-center flex-shrink-0">
                  <Download className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-white font-bold text-sm leading-tight">Install APATRIS</p>
                  <p className="text-gray-400 text-xs font-mono">Add to your home screen</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setMobileBannerDismissed(true);
                  localStorage.setItem("apatris-install-dismissed", "1");
                }}
                className="p-2 text-gray-500 active:text-white transition-colors rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Android — one-tap install if prompt available */}
            {!isIOS && deferredPrompt && (
              <button
                onClick={async () => {
                  deferredPrompt.prompt();
                  await deferredPrompt.userChoice;
                  setDeferredPrompt(null);
                  setMobileBannerDismissed(true);
                  localStorage.setItem("apatris-install-dismissed", "1");
                }}
                className="w-full py-3 bg-lime-500 active:bg-lime-400 text-black font-bold font-mono uppercase text-sm rounded-xl tracking-wide transition-all flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                Tap to Install Now
              </button>
            )}

            {/* Android — manual steps when no prompt */}
            {!isIOS && !deferredPrompt && (
              <div className="space-y-1.5">
                <p className="text-xs font-bold text-lime-400 font-mono uppercase tracking-wider mb-2">Android Chrome — 3 steps:</p>
                <div className="flex gap-2 text-sm text-gray-300 font-mono">
                  <span className="text-lime-500 font-bold w-4 flex-shrink-0">1.</span>
                  <span>Tap the <span className="text-white font-bold">⋮ menu</span> (top right)</span>
                </div>
                <div className="flex gap-2 text-sm text-gray-300 font-mono">
                  <span className="text-lime-500 font-bold w-4 flex-shrink-0">2.</span>
                  <span>Tap <span className="text-white font-bold">"Add to Home Screen"</span></span>
                </div>
                <div className="flex gap-2 text-sm text-gray-300 font-mono">
                  <span className="text-lime-500 font-bold w-4 flex-shrink-0">3.</span>
                  <span>Tap <span className="text-white font-bold">Install</span> — done ✓</span>
                </div>
              </div>
            )}

            {/* iOS — Apple blocks one-tap install; guide user via Safari Share menu */}
            {isIOS && (
              <div>
                <div className="bg-blue-950/60 border border-blue-500/30 rounded-xl p-3 mb-3">
                  <p className="text-xs text-blue-300 font-mono leading-relaxed">
                    <span className="font-bold text-white">Apple requires Safari</span> to install web apps.
                    Tap <span className="font-bold text-white">Copy Link</span> below, open Safari, paste the link, then follow the 3 steps.
                  </p>
                </div>

                {/* Copy Link button — actionable tap for iOS */}
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(window.location.origin).catch(() => {
                      const el = document.createElement("textarea");
                      el.value = window.location.origin;
                      document.body.appendChild(el);
                      el.select();
                      document.execCommand("copy");
                      document.body.removeChild(el);
                    });
                    setUrlCopied(true);
                    setTimeout(() => setUrlCopied(false), 2500);
                  }}
                  className="w-full py-3 bg-blue-600 active:bg-blue-500 text-white font-bold font-mono uppercase text-sm rounded-xl tracking-wide transition-all flex items-center justify-center gap-2 mb-3"
                >
                  {urlCopied ? (
                    <><span className="text-lg leading-none">✓</span> Link Copied!</>
                  ) : (
                    <><span className="text-base leading-none">📋</span> Copy App Link</>
                  )}
                </button>

                {/* Steps */}
                <div className="space-y-1.5">
                  <div className="flex gap-2 text-sm text-gray-300 font-mono">
                    <span className="text-blue-400 font-bold w-4 flex-shrink-0">1.</span>
                    <span>Open <span className="text-white font-bold">Safari</span> → paste the link → go</span>
                  </div>
                  <div className="flex gap-2 text-sm text-gray-300 font-mono">
                    <span className="text-blue-400 font-bold w-4 flex-shrink-0">2.</span>
                    <span>Tap the <span className="text-white font-bold">Share ↑</span> icon at the bottom</span>
                  </div>
                  <div className="flex gap-2 text-sm text-gray-300 font-mono">
                    <span className="text-blue-400 font-bold w-4 flex-shrink-0">3.</span>
                    <span>Tap <span className="text-white font-bold">"Add to Home Screen"</span> → <span className="text-white font-bold">Add</span> ✓</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
