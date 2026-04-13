import { useState } from "react";
import {
  AlertCircle, AlertTriangle, CheckCircle2, Lock,
  Clock, Scale, FileSignature, Stethoscope, Users,
  LayoutGrid, MapPin, FileText, Loader2,
  ChevronRight,
} from "lucide-react";
import { LegalSearchBar } from "@/components/LegalSearchBar";
import { RecruitmentShare } from "@/components/RecruitmentShare";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useWorkers } from "@/hooks/useWorkers";
import { TimesheetsSheet } from "@/components/TimesheetsSheet";
import { SiteDeploymentsSheet } from "@/components/SiteDeploymentsSheet";
import { LegalDossiersSheet } from "@/components/LegalDossiersSheet";

interface ManagerHomeProps {
  onNavigate: (tab: string) => void;
}

const statusPill: Record<string, string> = {
  "Compliant":       "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
  "Expiring Soon":   "bg-amber-500/10 text-amber-400 border-amber-500/25",
  "Non-Compliant":   "bg-red-500/10 text-red-400 border-red-500/25",
  "Missing Docs":    "bg-white/[0.06] text-gray-600 border-white/[0.1]",
};

export function ManagerHome({ onNavigate }: ManagerHomeProps) {
  const { t } = useTranslation();
  const { workers, loading, isLive } = useWorkers();
  const [timesheetsOpen, setTimesheetsOpen] = useState(false);
  const [sitesOpen, setSitesOpen]           = useState(false);
  const [dossiersOpen, setDossiersOpen]     = useState(false);

  const compliant    = workers.filter(w => w.status === "Compliant").length;
  const expiring     = workers.filter(w => w.status === "Expiring Soon").length;
  const nonCompliant = workers.filter(w => w.status === "Non-Compliant" || w.status === "Missing Docs").length;
  const activeSites  = new Set(workers.map(w => w.workplace).filter(Boolean)).size;

  const urgentWorkers = workers
    .filter(w => w.status === "Non-Compliant" || w.status === "Missing Docs" || w.status === "Expiring Soon")
    .slice(0, 8);

  const LEGAL_MODULES = [
    {
      icon: Clock,
      label: t("modules.timesheets"),
      sublabel: loading ? "Loading…" : `${workers.length} ${t("modules.workersTracked")}`,
      iconBg: "bg-blue-500/10",
      iconColor: "text-blue-600",
      accent: "hover:border-blue-500/25 hover:bg-blue-500/10",
      onClick: () => setTimesheetsOpen(true),
    },
    {
      icon: Scale,
      label: t("modules.pipLegalDossiers"),
      sublabel: loading ? "…" : `${nonCompliant} ${t("modules.issuesActive")}`,
      iconBg: "bg-violet-500/10",
      iconColor: "text-violet-600",
      accent: "hover:border-violet-500/25 hover:bg-violet-500/10",
      onClick: () => setDossiersOpen(true),
    },
    {
      icon: FileSignature,
      label: t("modules.b2bContracts"),
      sublabel: t("manager.viewContracts"),
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
      onClick: () => onNavigate("alerts"),
    },
    {
      icon: Users,
      label: t("modules.professionalDirectory"),
      sublabel: loading ? "Loading…" : `${workers.length} deployed · ${activeSites} ${t("home.activeSites")}`,
      iconBg: "bg-indigo-500/10",
      iconColor: "text-indigo-600",
      accent: "hover:border-indigo-500/25 hover:bg-indigo-500/10",
      full: true,
      onClick: () => onNavigate("workers"),
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
      icon: Clock,
      label: t("modules.timesheets"),
      sublabel: t("modules.allWorkforceHours"),
      iconBg: "bg-sky-500/10",
      iconColor: "text-sky-600",
      accent: "hover:border-sky-500/25 hover:bg-sky-500/10",
      onClick: () => setTimesheetsOpen(true),
    },
    {
      icon: FileText,
      label: t("modules.docQueue"),
      sublabel: t("modules.reviewApproveDocs"),
      iconBg: "bg-white/[0.06]",
      iconColor: "text-gray-600",
      accent: "hover:border-white/[0.1] hover:bg-white/[0.06]",
      onClick: () => onNavigate("queue"),
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

      <RecruitmentShare />

      {/* Financial firewall notice */}
      <div className="bg-violet-500/10 border border-violet-500/25 rounded-2xl p-3.5 flex items-center gap-3 shadow-sm shadow-violet-500/5">
        <div className="w-8 h-8 rounded-lg bg-violet-500/15 flex items-center justify-center shrink-0">
          <Lock className="w-4 h-4 text-violet-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold text-violet-300">{t("manager.financialFirewall")}</div>
          <div className="text-[11px] text-violet-400/80 font-medium">
            {t("manager.financialFirewallDesc")}
            {!isLive && !loading && <span className="ml-1 text-amber-600">· {t("manager.usingCachedData")}</span>}
          </div>
        </div>
        {loading && <Loader2 className="w-4 h-4 text-violet-500 animate-spin shrink-0" />}
      </div>

      {/* Compliance summary */}
      <div className="grid grid-cols-3 gap-2">
        <div className="premium-card rounded-2xl p-3.5 text-center">
          <div className="text-2xl font-black font-heading text-emerald-600">{loading ? "…" : compliant}</div>
          <div className="text-[10px] text-muted-foreground font-medium mt-0.5 leading-tight">{t("home.fullyCompliant")}</div>
        </div>
        <div className="premium-card rounded-2xl p-3.5 text-center">
          <div className="text-2xl font-black font-heading text-amber-600">{loading ? "…" : expiring}</div>
          <div className="text-[10px] text-muted-foreground font-medium mt-0.5 leading-tight">{t("home.expiringSoon")}</div>
        </div>
        <div className="premium-card rounded-2xl p-3.5 text-center">
          <div className="text-2xl font-black font-heading text-red-600">{loading ? "…" : nonCompliant}</div>
          <div className="text-[10px] text-muted-foreground font-medium mt-0.5 leading-tight">{t("home.nonCompliant")}</div>
        </div>
      </div>

      {/* Legal Platform Modules */}
      <div className="space-y-3">
        <div className="flex items-center justify-between ml-1">
          <h2 className="text-[10px] font-bold font-heading uppercase tracking-widest text-muted-foreground">{t("home.platformModules")}</h2>
          <span className="text-[9px] font-black bg-violet-600 text-white px-2 py-0.5 rounded-full tracking-wide">{t("manager.legalAccess")}</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {LEGAL_MODULES.map((mod) => {
            const Icon = mod.icon;
            return (
              <button
                key={mod.label}
                onClick={mod.onClick}
                className={cn(
                  "premium-card rounded-2xl p-4 hover:scale-[1.01] flex items-center gap-3 text-left active:scale-[0.97] transition-all duration-150 hover:shadow-md group",
                  mod.accent,
                  (mod as any).full ? "col-span-2" : ""
                )}
              >
                <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform", mod.iconBg)}>
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

      {/* Operational access — T3 / T4 / T5 inherited */}
      <div className="space-y-3">
        <div className="flex items-center justify-between ml-1">
          <h2 className="text-[10px] font-bold font-heading uppercase tracking-widest text-muted-foreground">{t("home.operationalAccess")}</h2>
          <span className="text-[9px] font-black bg-gray-700 text-white px-2 py-0.5 rounded-full tracking-wide">T3–T5</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {OPERATIONAL_MODULES.map((mod) => {
            const Icon = mod.icon;
            return (
              <button
                key={mod.label}
                onClick={mod.onClick}
                className={cn(
                  "premium-card rounded-2xl p-4 hover:scale-[1.01] flex items-center gap-3 text-left active:scale-[0.97] transition-all duration-150 hover:shadow-md group",
                  mod.accent
                )}
              >
                <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform", mod.iconBg)}>
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

      {/* Live compliance alerts */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 ml-1">
          <h2 className="text-[10px] font-bold font-heading uppercase tracking-widest text-muted-foreground">{t("manager.legalityAlerts")}</h2>
          {urgentWorkers.length > 0 && (
            <span className="bg-red-500/15 text-red-400 text-[10px] font-bold px-1.5 py-0.5 rounded-md">{urgentWorkers.length}</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground ml-1 -mt-2">{t("manager.legalAttention")}</p>

        {loading ? (
          <div className="premium-card rounded-2xl p-6 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : urgentWorkers.length === 0 ? (
          <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-2xl p-5 text-center glow-emerald">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
            <p className="text-sm font-bold text-emerald-400">{t("manager.allWorkersCompliant")}</p>
            <p className="text-xs text-emerald-500/70 mt-0.5">{t("manager.noLegalActions")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {urgentWorkers.map((w) => {
              const isRed = w.status === "Non-Compliant" || w.status === "Missing Docs";
              return (
                <button
                  key={w.id}
                  onClick={() => onNavigate("workers")}
                  className="w-full premium-card rounded-2xl border-l-4 p-4 text-left hover:shadow-md active:scale-[0.98] transition-all"
                  style={{ borderLeftColor: isRed ? "#ef4444" : "#f59e0b" }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {isRed
                        ? <AlertTriangle className="w-4 h-4 text-red-500" />
                        : <AlertCircle className="w-4 h-4 text-amber-500" />}
                      <span className="font-bold text-sm text-foreground">{w.status}</span>
                    </div>
                    <span className={cn(
                      "text-[10px] font-bold px-2 py-1 rounded-full border",
                      statusPill[w.status] ?? statusPill["Missing Docs"]
                    )}>
                      {w.daysUntilExpiry < 999 ? `${w.daysUntilExpiry}d` : "Immediate"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-white/[0.06] pt-2">
                    <div>
                      <div className="text-sm font-semibold text-foreground">{w.name}</div>
                      <div className="text-xs text-muted-foreground">{w.specialization} · {w.workplace || "No site"}</div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-white/20 shrink-0" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Sheets */}
      <TimesheetsSheet isOpen={timesheetsOpen} onClose={() => setTimesheetsOpen(false)} />
      <SiteDeploymentsSheet isOpen={sitesOpen} onClose={() => setSitesOpen(false)} workers={workers} />
      <LegalDossiersSheet isOpen={dossiersOpen} onClose={() => setDossiersOpen(false)} workers={workers} loading={loading} />
    </motion.div>
  );
}
