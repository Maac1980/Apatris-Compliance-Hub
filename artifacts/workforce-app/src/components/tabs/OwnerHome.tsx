import { useState } from "react";
import {
  Users, ShieldCheck, AlertTriangle, FileWarning, ShieldX,
  Receipt, Clock, Scale, FileSignature, Stethoscope,
  LayoutGrid, MapPin, ClipboardList, FileText,
  ChevronRight, Bell, Loader2,
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useWorkers } from "@/hooks/useWorkers";
import { TimesheetsSheet } from "@/components/TimesheetsSheet";
import { SiteDeploymentsSheet } from "@/components/SiteDeploymentsSheet";
import { LegalDossiersSheet } from "@/components/LegalDossiersSheet";
import { UDTSheet } from "@/components/UDTSheet";

interface OwnerHomeProps {
  onNavigate: (tab: string) => void;
}

export function OwnerHome({ onNavigate }: OwnerHomeProps) {
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
      label: "ZUS & Payroll",
      sublabel: "March 2026 · Full ledger",
      iconBg: "bg-indigo-500/10",
      iconColor: "text-indigo-600",
      accent: "hover:border-indigo-500/25 hover:bg-indigo-500/10",
      badge: "TIER 1 ONLY",
      badgeColor: "bg-indigo-600 text-white",
      onClick: () => onNavigate("payroll"),
    },
    {
      icon: Bell,
      label: "Compliance Alerts",
      sublabel: loading ? "…" : `${alertCount} active alerts`,
      iconBg: "bg-red-500/10",
      iconColor: "text-red-600",
      accent: "hover:border-red-500/25 hover:bg-red-500/10",
      onClick: () => onNavigate("alerts"),
    },
    {
      icon: Scale,
      label: "PIP / Legal Dossiers",
      sublabel: loading ? "…" : `${nonCompliant + missingDocs} issues active`,
      iconBg: "bg-violet-500/10",
      iconColor: "text-violet-600",
      accent: "hover:border-violet-500/25 hover:bg-violet-500/10",
      onClick: () => setDossiersOpen(true),
    },
    {
      icon: FileSignature,
      label: "B2B Contracts",
      sublabel: loading ? "…" : `${workers.length} workers · Active contracts`,
      iconBg: "bg-emerald-500/10",
      iconColor: "text-emerald-600",
      accent: "hover:border-emerald-500/25 hover:bg-emerald-500/10",
      onClick: () => onNavigate("workers"),
    },
    {
      icon: Stethoscope,
      label: "UDT & Badania Lekarskie",
      sublabel: loading ? "…" : `${expiring} renewals pending`,
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
      label: "Workspace",
      sublabel: "Active ops · Site assignments",
      iconBg: "bg-blue-500/10",
      iconColor: "text-blue-600",
      accent: "hover:border-blue-500/25 hover:bg-blue-500/10",
      onClick: () => onNavigate("workspace"),
    },
    {
      icon: MapPin,
      label: "Site Monitor",
      sublabel: loading ? "…" : `${activeSites} active sites`,
      iconBg: "bg-emerald-500/10",
      iconColor: "text-emerald-600",
      accent: "hover:border-emerald-500/25 hover:bg-emerald-500/10",
      onClick: () => setSitesOpen(true),
    },
    {
      icon: ClipboardList,
      label: "Doc Queue",
      sublabel: "Pending approvals",
      iconBg: "bg-amber-500/10",
      iconColor: "text-amber-600",
      accent: "hover:border-amber-500/25 hover:bg-amber-500/10",
      onClick: () => onNavigate("queue"),
    },
    {
      icon: Clock,
      label: "Timesheets",
      sublabel: loading ? "…" : `${workers.length} workers tracked`,
      iconBg: "bg-sky-500/10",
      iconColor: "text-sky-600",
      accent: "hover:border-sky-500/25 hover:bg-sky-500/10",
      onClick: () => setTimesheetsOpen(true),
    },
    {
      icon: FileText,
      label: "My Docs",
      sublabel: "Professional documents",
      iconBg: "bg-white/[0.06]",
      iconColor: "text-gray-600",
      accent: "hover:border-white/[0.1] hover:bg-white/[0.06]",
      onClick: () => onNavigate("docs"),
    },
    {
      icon: Users,
      label: "Professional Directory",
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
      {/* KPI strip — live */}
      <div className="space-y-3">
        <div className="flex items-center justify-between ml-1">
          <h2 className="text-[10px] font-heading font-bold uppercase tracking-widest text-muted-foreground section-line section-line-indigo">Overview</h2>
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
          {!isLive && !loading && <span className="text-[9px] text-amber-600 font-bold">cached</span>}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="premium-card rounded-2xl p-3.5 text-center">
            <div className="text-2xl font-black font-heading text-foreground">{loading ? "…" : workers.length}</div>
            <div className="text-[10px] text-muted-foreground font-medium mt-0.5 leading-tight">Deployed<br/>Professionals</div>
          </div>
          <div className="premium-card rounded-2xl p-3.5 text-center">
            <div className="text-2xl font-black font-heading text-emerald-600">{loading ? "…" : `${complianceRate}%`}</div>
            <div className="text-[10px] text-muted-foreground font-medium mt-0.5 leading-tight">Compliance<br/>Rate</div>
          </div>
          <div className="premium-card rounded-2xl p-3.5 text-center">
            <div className="text-2xl font-black font-heading text-red-600">{loading ? "…" : missingDocs}</div>
            <div className="text-[10px] text-muted-foreground font-medium mt-0.5 leading-tight">Docs<br/>Missing</div>
          </div>
        </div>

        <div className="flex gap-2">
          <div className="flex-1 premium-card rounded-xl p-3 flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            </div>
            <div className="text-xs font-medium text-foreground leading-tight">
              {loading ? "…" : compliant} fully<br/>compliant
            </div>
          </div>
          <div className="flex-1 premium-card rounded-xl p-3 flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
              <FileWarning className="w-3.5 h-3.5 text-amber-600" />
            </div>
            <div className="text-xs font-medium text-foreground leading-tight">
              {loading ? "…" : expiring} expiring<br/>soon
            </div>
          </div>
          <div className="flex-1 premium-card rounded-xl p-3 flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
              <ShieldX className="w-3.5 h-3.5 text-red-600" />
            </div>
            <div className="text-xs font-medium text-foreground leading-tight">
              {loading ? "…" : nonCompliant} non-<br/>compliant
            </div>
          </div>
        </div>
      </div>

      {/* Compliance bar — live */}
      <div className="premium-card rounded-2xl p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span className="text-sm font-bold text-foreground">Compliance Rate</span>
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
          {loading ? "Loading…" : `${compliant} of ${workers.length} professionals fully compliant · ${activeSites} active sites`}
        </div>
      </div>

      {/* Tier 1 Platform Modules */}
      <div className="space-y-3">
        <div className="flex items-center justify-between ml-1">
          <h2 className="text-[10px] font-heading font-bold uppercase tracking-widest text-muted-foreground section-line section-line-indigo">Platform Modules</h2>
          <span className="text-[9px] font-black bg-indigo-600 text-white px-2 py-0.5 rounded-full tracking-wide">FULL ACCESS</span>
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
                  <div className="font-bold text-sm text-foreground leading-tight">{mod.label}</div>
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
          <h2 className="text-[10px] font-heading font-bold uppercase tracking-widest text-muted-foreground section-line section-line-blue">Operational Access</h2>
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
                  <div className="font-bold text-sm text-foreground leading-tight">{mod.label}</div>
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
            <div className="text-sm font-bold text-red-300">{alertCount} Compliance Issues</div>
            <div className="text-xs text-red-400/80 font-medium mt-0.5">
              {nonCompliant > 0 && `${nonCompliant} non-compliant`}
              {nonCompliant > 0 && expiring > 0 && " · "}
              {expiring > 0 && `${expiring} expiring soon`}
              {" — tap to view"}
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
