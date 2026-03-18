import { useState } from "react";
import {
  AlertCircle, AlertTriangle, CheckCircle2, Lock,
  Clock, Scale, FileSignature, Stethoscope, Users,
  LayoutGrid, MapPin, FileText, Loader2,
  ChevronRight,
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useWorkers } from "@/hooks/useWorkers";
import { TimesheetsSheet } from "@/components/TimesheetsSheet";
import { SiteDeploymentsSheet } from "@/components/SiteDeploymentsSheet";
import { LegalDossiersSheet } from "@/components/LegalDossiersSheet";

interface ManagerHomeProps {
  onNavigate: (tab: string) => void;
}

const statusPill: Record<string, string> = {
  "Compliant":       "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Expiring Soon":   "bg-amber-50 text-amber-700 border-amber-200",
  "Non-Compliant":   "bg-red-50 text-red-700 border-red-200",
  "Missing Docs":    "bg-gray-100 text-gray-600 border-gray-200",
};

export function ManagerHome({ onNavigate }: ManagerHomeProps) {
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
      label: "Timesheets & Hours",
      sublabel: loading ? "Loading…" : `${workers.length} workers tracked`,
      iconBg: "bg-blue-50",
      iconColor: "text-blue-600",
      accent: "hover:border-blue-200 hover:bg-blue-50/20",
      onClick: () => setTimesheetsOpen(true),
    },
    {
      icon: Scale,
      label: "PIP / Legal Dossiers",
      sublabel: loading ? "…" : `${nonCompliant} issues active`,
      iconBg: "bg-violet-50",
      iconColor: "text-violet-600",
      accent: "hover:border-violet-200 hover:bg-violet-50/20",
      onClick: () => setDossiersOpen(true),
    },
    {
      icon: FileSignature,
      label: "B2B Contracts",
      sublabel: "View worker contracts",
      iconBg: "bg-emerald-50",
      iconColor: "text-emerald-600",
      accent: "hover:border-emerald-200 hover:bg-emerald-50/20",
      onClick: () => onNavigate("workers"),
    },
    {
      icon: Stethoscope,
      label: "UDT & Badania Lekarskie",
      sublabel: loading ? "…" : `${expiring} renewals pending`,
      iconBg: "bg-teal-50",
      iconColor: "text-teal-600",
      accent: "hover:border-teal-200 hover:bg-teal-50/20",
      onClick: () => onNavigate("alerts"),
    },
    {
      icon: Users,
      label: "Professional Directory",
      sublabel: loading ? "Loading…" : `${workers.length} deployed · ${activeSites} active sites`,
      iconBg: "bg-indigo-50",
      iconColor: "text-indigo-600",
      accent: "hover:border-indigo-200 hover:bg-indigo-50/20",
      full: true,
      onClick: () => onNavigate("workers"),
    },
  ];

  const OPERATIONAL_MODULES = [
    {
      icon: LayoutGrid,
      label: "Workspace",
      sublabel: "Active ops · Site assignments",
      iconBg: "bg-blue-50",
      iconColor: "text-blue-600",
      accent: "hover:border-blue-200 hover:bg-blue-50/20",
      onClick: () => onNavigate("workspace"),
    },
    {
      icon: MapPin,
      label: "Site Monitor",
      sublabel: loading ? "…" : `${activeSites} active sites`,
      iconBg: "bg-emerald-50",
      iconColor: "text-emerald-600",
      accent: "hover:border-emerald-200 hover:bg-emerald-50/20",
      onClick: () => setSitesOpen(true),
    },
    {
      icon: Clock,
      label: "Timesheets",
      sublabel: "All workforce hours",
      iconBg: "bg-sky-50",
      iconColor: "text-sky-600",
      accent: "hover:border-sky-200 hover:bg-sky-50/20",
      onClick: () => setTimesheetsOpen(true),
    },
    {
      icon: FileText,
      label: "Doc Queue",
      sublabel: "Review & approve docs",
      iconBg: "bg-gray-50",
      iconColor: "text-gray-600",
      accent: "hover:border-gray-200 hover:bg-gray-50/20",
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
      {/* Financial firewall notice */}
      <div className="bg-violet-50 border border-violet-200 rounded-2xl p-3.5 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
          <Lock className="w-4 h-4 text-violet-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold text-violet-800">Financial Firewall Active</div>
          <div className="text-[11px] text-violet-600/80 font-medium">
            ZUS & Payroll ledgers are restricted to Tier 1 (Executive Board) only.
            {!isLive && !loading && <span className="ml-1 text-amber-600">· Using cached data</span>}
          </div>
        </div>
        {loading && <Loader2 className="w-4 h-4 text-violet-500 animate-spin shrink-0" />}
      </div>

      {/* Compliance summary */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white rounded-2xl border shadow-sm p-3 text-center">
          <div className="text-xl font-black text-emerald-600">{loading ? "…" : compliant}</div>
          <div className="text-[10px] text-muted-foreground font-medium mt-0.5 leading-tight">Fully<br/>Compliant</div>
        </div>
        <div className="bg-white rounded-2xl border shadow-sm p-3 text-center">
          <div className="text-xl font-black text-amber-600">{loading ? "…" : expiring}</div>
          <div className="text-[10px] text-muted-foreground font-medium mt-0.5 leading-tight">Expiring<br/>Soon</div>
        </div>
        <div className="bg-white rounded-2xl border shadow-sm p-3 text-center">
          <div className="text-xl font-black text-red-600">{loading ? "…" : nonCompliant}</div>
          <div className="text-[10px] text-muted-foreground font-medium mt-0.5 leading-tight">Non-<br/>Compliant</div>
        </div>
      </div>

      {/* Legal Platform Modules */}
      <div className="space-y-3">
        <div className="flex items-center justify-between ml-1">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Platform Modules</h2>
          <span className="text-[9px] font-black bg-violet-600 text-white px-2 py-0.5 rounded-full tracking-wide">LEGAL ACCESS</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {LEGAL_MODULES.map((mod) => {
            const Icon = mod.icon;
            return (
              <button
                key={mod.label}
                onClick={mod.onClick}
                className={cn(
                  "bg-white rounded-2xl border shadow-sm p-4 flex items-center gap-3 text-left active:scale-[0.97] transition-all duration-150 hover:shadow-md group",
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
                <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-400 transition-colors shrink-0" />
              </button>
            );
          })}
        </div>
      </div>

      {/* Operational access — T3 / T4 / T5 inherited */}
      <div className="space-y-3">
        <div className="flex items-center justify-between ml-1">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Operational Access</h2>
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
                  "bg-white rounded-2xl border shadow-sm p-4 flex items-center gap-3 text-left active:scale-[0.97] transition-all duration-150 hover:shadow-md group",
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
                <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-400 transition-colors shrink-0" />
              </button>
            );
          })}
        </div>
      </div>

      {/* Live compliance alerts */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 ml-1">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Legality Alerts</h2>
          {urgentWorkers.length > 0 && (
            <span className="bg-red-100 text-red-700 text-[10px] font-bold px-1.5 py-0.5 rounded-md">{urgentWorkers.length}</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground ml-1 -mt-2">Deployed professionals requiring immediate legal attention</p>

        {loading ? (
          <div className="bg-white rounded-2xl border shadow-sm p-6 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : urgentWorkers.length === 0 ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 text-center">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
            <p className="text-sm font-bold text-emerald-700">All workers compliant</p>
            <p className="text-xs text-emerald-600 mt-0.5">No legal actions required at this time.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {urgentWorkers.map((w) => {
              const isRed = w.status === "Non-Compliant" || w.status === "Missing Docs";
              return (
                <button
                  key={w.id}
                  onClick={() => onNavigate("workers")}
                  className="w-full bg-white rounded-2xl border-l-4 border border-border shadow-sm p-4 text-left hover:shadow-md active:scale-[0.98] transition-all"
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
                  <div className="flex items-center justify-between border-t border-gray-100 pt-2">
                    <div>
                      <div className="text-sm font-semibold text-foreground">{w.name}</div>
                      <div className="text-xs text-muted-foreground">{w.specialization} · {w.workplace || "No site"}</div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
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
