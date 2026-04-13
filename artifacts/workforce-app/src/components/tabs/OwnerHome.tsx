import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Users, ShieldCheck, AlertTriangle, FileWarning, ShieldX,
  Receipt, Clock, Scale, FileSignature, Stethoscope,
  LayoutGrid, MapPin, ClipboardList, FileText,
  ChevronRight, Bell, Loader2, Activity, Shield, FileCheck,
} from "lucide-react";
import { LegalSearchBar } from "@/components/LegalSearchBar";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useWorkers } from "@/hooks/useWorkers";
import { TimesheetsSheet } from "@/components/TimesheetsSheet";
import { SiteDeploymentsSheet } from "@/components/SiteDeploymentsSheet";
import { LegalDossiersSheet } from "@/components/LegalDossiersSheet";
import { UDTSheet } from "@/components/UDTSheet";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_token") || localStorage.getItem("apatris_jwt") || "";
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}
const API = import.meta.env.VITE_API_URL ?? "";

interface OwnerHomeProps {
  onNavigate: (tab: string) => void;
}

export function OwnerHome({ onNavigate }: OwnerHomeProps) {
  const { t } = useTranslation();
  const { workers, loading, isLive } = useWorkers();
  const [timesheetsOpen, setTimesheetsOpen] = useState(false);
  const [sitesOpen, setSitesOpen]           = useState(false);
  const [dossiersOpen, setDossiersOpen]     = useState(false);
  const [udtOpen, setUdtOpen]               = useState(false);

  const compliant    = workers.filter(w => w.status === "Compliant").length;
  const expiring     = workers.filter(w => w.status === "Expiring Soon").length;
  const nonCompliant = workers.filter(w => w.status === "Non-Compliant").length;
  const missingDocs  = workers.filter(w => w.status === "Missing Docs").length;
  const activeSites  = new Set(workers.map(w => w.workplace).filter(Boolean)).size;
  const alertCount   = nonCompliant + missingDocs + expiring;
  const complianceRate = workers.length > 0 ? Math.round((compliant / workers.length) * 100) : 0;

  const TIER1_MODULES = [
    {
      icon: Receipt,
      label: t("modules.zusPayroll"),
      sublabel: t("modules.zusPayrollSub"),
      iconBg: "bg-indigo-500/10",
      iconColor: "text-indigo-600",
      accent: "hover:border-indigo-500/25 hover:bg-indigo-500/10",
      badge: "TIER 1 ONLY",
      badgeColor: "bg-indigo-600 text-white",
      onClick: () => onNavigate("payroll"),
    },
    {
      icon: Bell,
      label: t("modules.complianceAlerts"),
      sublabel: loading ? "…" : `${alertCount} ${t("modules.activeAlerts")}`,
      iconBg: "bg-red-500/10",
      iconColor: "text-red-600",
      accent: "hover:border-red-500/25 hover:bg-red-500/10",
      onClick: () => onNavigate("alerts"),
    },
    {
      icon: Scale,
      label: t("modules.pipLegalDossiers"),
      sublabel: loading ? "…" : `${nonCompliant + missingDocs} ${t("modules.issuesActive")}`,
      iconBg: "bg-violet-500/10",
      iconColor: "text-violet-600",
      accent: "hover:border-violet-500/25 hover:bg-violet-500/10",
      onClick: () => setDossiersOpen(true),
    },
    {
      icon: FileSignature,
      label: t("modules.b2bContracts"),
      sublabel: loading ? "…" : `${workers.length} workers · ${t("modules.activeContracts")}`,
      iconBg: "bg-emerald-500/10",
      iconColor: "text-emerald-600",
      accent: "hover:border-emerald-500/25 hover:bg-emerald-500/10",
      onClick: () => onNavigate("workers"),
    },
    {
      icon: Stethoscope,
      label: t("modules.udtBadania"),
      sublabel: loading ? "…" : `${expiring} ${t("modules.renewalsPending")}`,
      iconBg: "bg-teal-500/10",
      iconColor: "text-teal-600",
      accent: "hover:border-teal-500/25 hover:bg-teal-500/10",
      full: true,
      onClick: () => setUdtOpen(true),
    },
  ];

  const OPERATIONAL_MODULES = [
    {
      icon: LayoutGrid,
      label: t("modules.workspace"),
      sublabel: t("modules.activeOps"),
      iconBg: "bg-blue-500/10",
      iconColor: "text-blue-600",
      accent: "hover:border-blue-500/25 hover:bg-blue-500/10",
      onClick: () => onNavigate("workspace"),
    },
    {
      icon: MapPin,
      label: t("modules.siteMonitor"),
      sublabel: loading ? "…" : `${activeSites} ${t("home.activeSites")}`,
      iconBg: "bg-emerald-500/10",
      iconColor: "text-emerald-600",
      accent: "hover:border-emerald-500/25 hover:bg-emerald-500/10",
      onClick: () => setSitesOpen(true),
    },
    {
      icon: ClipboardList,
      label: t("modules.docQueue"),
      sublabel: t("modules.pendingApprovals"),
      iconBg: "bg-amber-500/10",
      iconColor: "text-amber-600",
      accent: "hover:border-amber-500/25 hover:bg-amber-500/10",
      onClick: () => onNavigate("queue"),
    },
    {
      icon: Clock,
      label: t("modules.timesheets"),
      sublabel: loading ? "…" : `${workers.length} ${t("modules.workersTracked")}`,
      iconBg: "bg-sky-500/10",
      iconColor: "text-sky-600",
      accent: "hover:border-sky-500/25 hover:bg-sky-500/10",
      onClick: () => setTimesheetsOpen(true),
    },
    {
      icon: FileText,
      label: t("modules.myDocs"),
      sublabel: t("modules.professionalDocs"),
      iconBg: "bg-white/[0.06]",
      iconColor: "text-gray-600",
      accent: "hover:border-white/[0.1] hover:bg-white/[0.06]",
      onClick: () => onNavigate("docs"),
    },
    {
      icon: Users,
      label: t("modules.professionalDirectory"),
      sublabel: loading ? "…" : `${workers.length} deployed · ${activeSites} sites`,
      iconBg: "bg-indigo-500/10",
      iconColor: "text-indigo-600",
      accent: "hover:border-indigo-500/25 hover:bg-indigo-500/10",
      onClick: () => onNavigate("workers"),
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="px-4 py-5 space-y-6 pb-28 relative"
    >
      {/* Legal Search */}
      <LegalSearchBar />

      {/* KPI strip — live */}
      <div className="space-y-3">
        <div className="flex items-center justify-between ml-1">
          <h2 className="text-[10px] font-heading font-bold uppercase tracking-widest text-muted-foreground section-line section-line-indigo">{t("home.overview")}</h2>
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
          {!isLive && !loading && <span className="text-[9px] text-amber-600 font-bold">{t("home.cached")}</span>}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="premium-card rounded-2xl p-3.5 text-center">
            <div className="text-2xl font-black font-heading text-foreground">{loading ? "…" : workers.length}</div>
            <div className="text-[10px] text-muted-foreground font-medium mt-0.5 leading-tight">{t("home.deployedProfessionals")}</div>
          </div>
          <div className="premium-card rounded-2xl p-3.5 text-center">
            <div className="text-2xl font-black font-heading text-emerald-600">{loading ? "…" : `${complianceRate}%`}</div>
            <div className="text-[10px] text-muted-foreground font-medium mt-0.5 leading-tight">{t("home.complianceRate")}</div>
          </div>
          <div className="premium-card rounded-2xl p-3.5 text-center">
            <div className="text-2xl font-black font-heading text-red-600">{loading ? "…" : missingDocs}</div>
            <div className="text-[10px] text-muted-foreground font-medium mt-0.5 leading-tight">{t("home.docsMissing")}</div>
          </div>
        </div>

        <div className="flex gap-2">
          <div className="flex-1 premium-card rounded-xl p-3 flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            </div>
            <div className="text-xs font-medium text-slate-300 leading-tight">
              {loading ? "…" : compliant} {t("home.fullyCompliant")}
            </div>
          </div>
          <div className="flex-1 premium-card rounded-xl p-3 flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
              <FileWarning className="w-3.5 h-3.5 text-amber-600" />
            </div>
            <div className="text-xs font-medium text-slate-300 leading-tight">
              {loading ? "…" : expiring} {t("home.expiringSoon")}
            </div>
          </div>
          <div className="flex-1 premium-card rounded-xl p-3 flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
              <ShieldX className="w-3.5 h-3.5 text-red-600" />
            </div>
            <div className="text-xs font-medium text-slate-300 leading-tight">
              {loading ? "…" : nonCompliant} {t("home.nonCompliant")}
            </div>
          </div>
        </div>
      </div>

      {/* Compliance bar — live */}
      <div className="premium-card rounded-2xl p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span className="text-sm font-bold text-foreground">{t("home.complianceRate")}</span>
          </div>
          <span className="text-sm font-black text-emerald-600">{loading ? "…" : `${complianceRate}%`}</span>
        </div>
        <div className="h-2 w-full bg-white/[0.06] rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: loading ? "0%" : `${complianceRate}%` }}
            transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
            className={cn("h-full rounded-full", complianceRate >= 70 ? "bg-emerald-500" : complianceRate >= 40 ? "bg-amber-400" : "bg-red-500")}
          />
        </div>
        <div className="text-[11px] text-muted-foreground mt-1.5">
          {loading ? "Loading…" : `${compliant} of ${workers.length} professionals fully compliant · ${activeSites} ${t("home.activeSites")}`}
        </div>
      </div>

      {/* ── Document Health (EEJ-style bars) ─────────────────────────── */}
      <DocHealthWidget workers={workers} loading={loading} />

      {/* ── Regulatory Intelligence Widget ──────────────────────────── */}
      <RegulatoryWidget onNavigate={onNavigate} />

      {/* ── Review Queue (AI-generated docs awaiting approval) ──────── */}
      <ReviewQueueWidget onNavigate={onNavigate} />

      {/* ── Recruitment Link Share ────────────────────────────────── */}
      <RecruitmentShareWidget />

      {/* Tier 1 Platform Modules */}
      <div className="space-y-3">
        <div className="flex items-center justify-between ml-1">
          <h2 className="text-[10px] font-heading font-bold uppercase tracking-widest text-muted-foreground section-line section-line-indigo">{t("home.platformModules")}</h2>
          <span className="text-[9px] font-black bg-indigo-600 text-white px-2 py-0.5 rounded-full tracking-wide">{t("home.fullAccess")}</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {TIER1_MODULES.map((mod) => {
            const Icon = mod.icon;
            return (
              <button
                key={mod.label}
                onClick={mod.onClick}
                className={cn(
                  "premium-card rounded-2xl p-4 hover:scale-[1.01] flex items-center gap-3 text-left active:scale-[0.97] transition-all duration-200 hover:shadow-md group",
                  mod.accent,
                  (mod as any).full ? "col-span-2" : ""
                )}
              >
                <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105", mod.iconBg)}>
                  <Icon className={cn("w-5 h-5", mod.iconColor)} strokeWidth={2} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm text-white leading-tight">{mod.label}</div>
                  <div className="text-[11px] text-muted-foreground font-medium mt-0.5 truncate">{mod.sublabel}</div>
                  {(mod as any).badge && (
                    <span className={cn("inline-block text-[9px] font-black px-1.5 py-0.5 rounded-full mt-1 tracking-wide", (mod as any).badgeColor)}>
                      {(mod as any).badge}
                    </span>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-white/30 transition-colors shrink-0" />
              </button>
            );
          })}
        </div>
      </div>

      {/* All Tier Access — T2 / T3 / T4 / T5 screens */}
      <div className="space-y-3">
        <div className="flex items-center justify-between ml-1">
          <h2 className="text-[10px] font-heading font-bold uppercase tracking-widest text-muted-foreground section-line section-line-blue">{t("home.operationalAccess")}</h2>
          <span className="text-[9px] font-black bg-gray-700 text-white px-2 py-0.5 rounded-full tracking-wide">T2–T5</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {OPERATIONAL_MODULES.map((mod) => {
            const Icon = mod.icon;
            return (
              <button
                key={mod.label}
                onClick={mod.onClick}
                className={cn(
                  "premium-card rounded-2xl p-4 hover:scale-[1.01] flex items-center gap-3 text-left active:scale-[0.97] transition-all duration-200 hover:shadow-md group",
                  mod.accent
                )}
              >
                <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105", mod.iconBg)}>
                  <Icon className={cn("w-5 h-5", mod.iconColor)} strokeWidth={2} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm text-white leading-tight">{mod.label}</div>
                  <div className="text-[11px] text-muted-foreground font-medium mt-0.5 truncate">{mod.sublabel}</div>
                </div>
                <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-white/30 transition-colors shrink-0" />
              </button>
            );
          })}
        </div>
      </div>

      {/* Critical alert strip — live */}
      {!loading && alertCount > 0 && (
        <button
          onClick={() => onNavigate("alerts")}
          className="w-full bg-red-500/10 border border-red-500/25 rounded-2xl p-4 glow-red flex items-center gap-3 active:scale-[0.98] transition-all text-left"
        >
          <div className="w-9 h-9 rounded-xl bg-red-500/15 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-bold text-red-300">{alertCount} {t("home.complianceIssues")}</div>
            <div className="text-xs text-red-400/80 font-medium mt-0.5">
              {nonCompliant > 0 && `${nonCompliant} non-compliant`}
              {nonCompliant > 0 && expiring > 0 && " · "}
              {expiring > 0 && `${expiring} expiring soon`}
              {` — ${t("home.tapToView")}`}
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-red-400/60 shrink-0" />
        </button>
      )}

      {/* Sheets */}
      <TimesheetsSheet isOpen={timesheetsOpen} onClose={() => setTimesheetsOpen(false)} />
      <SiteDeploymentsSheet isOpen={sitesOpen} onClose={() => setSitesOpen(false)} workers={workers} />
      <LegalDossiersSheet isOpen={dossiersOpen} onClose={() => setDossiersOpen(false)} workers={workers} loading={loading} />
      <UDTSheet isOpen={udtOpen} onClose={() => setUdtOpen(false)} workers={workers} loading={loading} />
    </motion.div>
  );
}

// ═══ DOCUMENT HEALTH WIDGET ═════════════════════════════════════════════

function DocHealthWidget({ workers, loading }: { workers: any[]; loading: boolean }) {
  if (loading || workers.length === 0) return null;

  const total = workers.length;
  const compliant = workers.filter(w => w.status === "Compliant").length;
  const expiring = workers.filter(w => w.status === "Expiring Soon").length;
  const action = workers.filter(w => w.status === "Non-Compliant" || w.status === "Missing Docs").length;

  const pctCompliant = Math.round((compliant / total) * 100);
  const pctExpiring = Math.round((expiring / total) * 100);
  const pctAction = Math.round((action / total) * 100);

  return (
    <div className="premium-card rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <FileCheck className="w-4 h-4 text-emerald-500" />
        <span className="text-sm font-bold text-white">Document Health</span>
      </div>
      <div className="space-y-2.5">
        <HealthBar label="Cleared" pct={pctCompliant} color="bg-emerald-500" textColor="text-emerald-400" />
        <HealthBar label="Expiring Soon" pct={pctExpiring} color="bg-amber-400" textColor="text-amber-400" />
        <HealthBar label="Action Required" pct={pctAction} color="bg-red-500" textColor="text-red-400" />
      </div>
    </div>
  );
}

function HealthBar({ label, pct, color, textColor }: { label: string; pct: number; color: string; textColor: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-white/50">{label}</span>
        <span className={cn("text-[10px] font-bold", textColor)}>{pct}%</span>
      </div>
      <div className="h-1.5 w-full bg-white/[0.06] rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
          className={cn("h-full rounded-full", color)}
        />
      </div>
    </div>
  );
}

// ═══ REGULATORY INTELLIGENCE WIDGET ═════════════════════════════════════

function RegulatoryWidget({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const { data } = useQuery({
    queryKey: ["home-regulatory"],
    queryFn: async () => {
      try {
        const r = await fetch(`${API}api/regulatory/updates?limit=3`, { headers: authHeaders() });
        if (!r.ok) return { updates: [], critical: 0, warning: 0, affected: 0 };
        const d = await r.json();
        const updates = d.updates ?? [];
        return {
          updates,
          critical: updates.filter((u: any) => u.severity === "critical").length,
          warning: updates.filter((u: any) => u.severity === "warning" || u.severity === "high").length,
          affected: updates.reduce((s: number, u: any) => s + (u.workers_affected ?? 0), 0),
        };
      } catch { return { updates: [], critical: 0, warning: 0, affected: 0 }; }
    },
  });

  const { critical = 0, warning = 0, affected = 0, updates = [] } = data ?? {};

  return (
    <div className="premium-card rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-bold text-white">Regulatory Intelligence</span>
        </div>
        <button onClick={() => onNavigate("legal")} className="text-[9px] text-white/30 hover:text-white/50">View All</button>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="bg-red-500/10 rounded-xl p-2.5 text-center">
          <div className="text-lg font-black text-red-400">{critical}</div>
          <div className="text-[9px] text-white/30">Critical</div>
        </div>
        <div className="bg-amber-500/10 rounded-xl p-2.5 text-center">
          <div className="text-lg font-black text-amber-400">{warning}</div>
          <div className="text-[9px] text-white/30">Warning</div>
        </div>
        <div className="bg-blue-500/10 rounded-xl p-2.5 text-center">
          <div className="text-lg font-black text-blue-400">{affected}</div>
          <div className="text-[9px] text-white/30">Affected</div>
        </div>
      </div>
      {updates.length > 0 ? (
        <div className="space-y-1.5">
          {updates.slice(0, 2).map((u: any, i: number) => (
            <div key={i} className="text-[10px] text-white/40 bg-white/[0.03] rounded-lg px-3 py-2 flex items-center gap-2">
              <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", u.severity === "critical" ? "bg-red-400" : "bg-amber-400")} />
              <span className="truncate">{u.title ?? u.summary?.slice(0, 60) ?? "Update"}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[10px] text-white/20 text-center py-2">No recent updates</p>
      )}
    </div>
  );
}

// ═══ REVIEW QUEUE WIDGET (AI-generated docs awaiting approval) ══════════

function ReviewQueueWidget({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const { data } = useQuery({
    queryKey: ["home-review-queue"],
    queryFn: async () => {
      try {
        const r = await fetch(`${API}api/v1/vault/docs/stats`, { headers: authHeaders() });
        if (!r.ok) return { drafts: 0, approved: 0, sent: 0 };
        return r.json();
      } catch { return { drafts: 0, approved: 0, sent: 0 }; }
    },
  });

  const { drafts = 0, approved = 0, sent = 0 } = data ?? {};
  if (drafts === 0 && approved === 0 && sent === 0) return null;

  return (
    <button onClick={() => onNavigate("legalstatus")} className="w-full premium-card rounded-2xl p-4 text-left active:scale-[0.98] transition-transform">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-violet-400" />
          <span className="text-sm font-bold text-white">Lawyer Review Queue</span>
        </div>
        <ChevronRight className="w-4 h-4 text-white/20" />
      </div>
      <div className="flex items-center gap-3 mt-2.5">
        {drafts > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-xs text-amber-400 font-bold">{drafts} drafts</span>
          </div>
        )}
        {approved > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-xs text-emerald-400 font-bold">{approved} approved</span>
          </div>
        )}
        {sent > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-400" />
            <span className="text-xs text-blue-400 font-bold">{sent} sent</span>
          </div>
        )}
      </div>
    </button>
  );
}

// ═══ RECRUITMENT SHARE WIDGET ═══════════════════════════════════════════

function RecruitmentShareWidget() {
  const [copied, setCopied] = useState(false);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const formUrl = `${origin}/api/public/apply/form`;

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="premium-card rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-[#C41E18]" />
          <span className="text-sm font-bold text-white">Recruitment Link</span>
          <span className="text-[8px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-bold">PUBLIC</span>
        </div>
      </div>
      <p className="text-[10px] text-white/30 mb-3">Share on Facebook, LinkedIn, or WhatsApp to receive job applications</p>
      <div className="flex items-center gap-1.5 bg-white/[0.04] rounded-lg p-2 mb-3">
        <code className="text-[9px] text-white/50 flex-1 truncate">{formUrl}</code>
        <button onClick={() => copy(formUrl)}
          className={cn("px-2.5 py-1 rounded-lg text-[9px] font-bold shrink-0 active:scale-95", copied ? "bg-emerald-500/20 text-emerald-400" : "bg-[#C41E18] text-white")}>
          {copied ? "✓ Copied" : "Copy"}
        </button>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        <button onClick={() => copy(`🔧 We're hiring! Apply here: ${formUrl}`)}
          className="py-2 rounded-lg bg-blue-600/15 text-blue-400 text-[9px] font-bold active:scale-95">Facebook</button>
        <button onClick={() => copy(`Hiring welders! Apply: ${formUrl}`)}
          className="py-2 rounded-lg bg-emerald-600/15 text-emerald-400 text-[9px] font-bold active:scale-95">WhatsApp</button>
        <button onClick={() => { window.open(formUrl, "_blank"); }}
          className="py-2 rounded-lg bg-white/[0.06] text-white/50 text-[9px] font-bold active:scale-95">Preview</button>
      </div>
    </div>
  );
}
