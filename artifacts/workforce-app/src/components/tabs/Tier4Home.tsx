import { useState } from "react";
import {
  FileCheck, FileX, FileQuestion, Clock,
  UserPlus, MapPin, Stethoscope, Users,
  AlertCircle, ChevronRight, Loader2, RefreshCw,
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useWorkers } from "@/hooks/useWorkers";
import { AddProfessionalSheet } from "@/components/AddProfessionalSheet";
import { TimesheetsSheet } from "@/components/TimesheetsSheet";
import { SiteDeploymentsSheet } from "@/components/SiteDeploymentsSheet";

interface OpModule {
  icon: React.ElementType;
  label: string;
  sublabel: string;
  iconBg: string;
  iconColor: string;
  border: string;
  onClick?: () => void;
}

const docStatusStyle = {
  "Missing":      { icon: FileQuestion, color: "text-gray-400",    bg: "bg-gray-50",    pill: "bg-gray-100 text-gray-600 border-gray-200" },
  "Expiring Soon":{ icon: AlertCircle,  color: "text-amber-500",   bg: "bg-amber-50",   pill: "bg-amber-50 text-amber-700 border-amber-200" },
  "Non-Compliant":{ icon: FileX,        color: "text-red-500",      bg: "bg-red-50",     pill: "bg-red-50 text-red-700 border-red-200" },
  "Compliant":    { icon: FileCheck,    color: "text-emerald-500",  bg: "bg-emerald-50", pill: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};

export function Tier4Home() {
  const { workers, loading, isLive } = useWorkers();
  const [addOpen, setAddOpen]       = useState(false);
  const [timesheetsOpen, setTimesheetsOpen] = useState(false);
  const [sitesOpen, setSitesOpen]   = useState(false);

  const OPERATIONAL_MODULES: OpModule[] = [
    {
      icon: UserPlus,
      label: "Add Professional",
      sublabel: "Register & onboard",
      iconBg: "bg-emerald-50",
      iconColor: "text-emerald-600",
      border: "hover:border-emerald-200 hover:bg-emerald-50/20",
      onClick: () => setAddOpen(true),
    },
    {
      icon: Clock,
      label: "Timesheets & Hours",
      sublabel: workers.length > 0 ? `${workers.length} workers tracked` : "Loading…",
      iconBg: "bg-amber-50",
      iconColor: "text-amber-600",
      border: "hover:border-amber-200 hover:bg-amber-50/20",
      onClick: () => setTimesheetsOpen(true),
    },
    {
      icon: Stethoscope,
      label: "UDT & Badania Lekarskie",
      sublabel: `${workers.filter(w => w.status === "Expiring Soon").length} renewals pending`,
      iconBg: "bg-teal-50",
      iconColor: "text-teal-600",
      border: "hover:border-teal-200 hover:bg-teal-50/20",
    },
    {
      icon: MapPin,
      label: "Site Deployments",
      sublabel: `${new Set(workers.map(w => w.workplace).filter(Boolean)).size} active sites`,
      iconBg: "bg-blue-50",
      iconColor: "text-blue-600",
      border: "hover:border-blue-200 hover:bg-blue-50/20",
      onClick: () => setSitesOpen(true),
    },
  ];

  // Workers needing attention: Non-Compliant, Expiring Soon, Missing Docs
  const alertWorkers = workers.filter(w =>
    w.status === "Non-Compliant" ||
    w.status === "Expiring Soon" ||
    w.status === "Missing Docs"
  ).slice(0, 10);

  const missingCount    = workers.filter(w => w.status === "Missing Docs").length;
  const expiringCount   = workers.filter(w => w.status === "Expiring Soon").length;
  const nonCompliant    = workers.filter(w => w.status === "Non-Compliant").length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="px-4 py-5 space-y-6 pb-28 relative"
    >
      {/* Shared workspace badge */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
          <Users className="w-4 h-4 text-emerald-700" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold text-emerald-900">Shared Operational Workspace</div>
          <div className="text-[11px] text-emerald-700/80 font-medium">
            Full read/write access to Deployed Professional profiles &amp; document queues — shared with Tech Ops.
            {!isLive && <span className="ml-1 text-amber-600">· Using cached data</span>}
          </div>
        </div>
        {loading && <Loader2 className="w-4 h-4 text-emerald-600 animate-spin shrink-0" />}
      </div>

      {/* Compliance summary strip */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white rounded-2xl border shadow-sm p-3 text-center">
          <div className="text-xl font-black text-red-600">{nonCompliant}</div>
          <div className="text-[10px] text-muted-foreground font-medium mt-0.5 leading-tight">Non-<br/>Compliant</div>
        </div>
        <div className="bg-white rounded-2xl border shadow-sm p-3 text-center">
          <div className="text-xl font-black text-amber-600">{expiringCount}</div>
          <div className="text-[10px] text-muted-foreground font-medium mt-0.5 leading-tight">Expiring<br/>Soon</div>
        </div>
        <div className="bg-white rounded-2xl border shadow-sm p-3 text-center">
          <div className="text-xl font-black text-gray-600">{missingCount}</div>
          <div className="text-[10px] text-muted-foreground font-medium mt-0.5 leading-tight">Missing<br/>Docs</div>
        </div>
      </div>

      {/* Operational modules grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between ml-1">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Operational Modules</h2>
          <span className="text-[9px] font-black bg-emerald-600 text-white px-2 py-0.5 rounded-full tracking-wide">T3 · T4 ACCESS</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {OPERATIONAL_MODULES.map((mod) => {
            const Icon = mod.icon;
            return (
              <button
                key={mod.label}
                onClick={mod.onClick}
                className={`bg-white rounded-2xl border shadow-sm p-4 flex items-center gap-3 text-left active:scale-[0.97] transition-all duration-150 hover:shadow-md group ${mod.border}`}
              >
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 ${mod.iconBg}`}>
                  <Icon className={`w-5 h-5 ${mod.iconColor}`} strokeWidth={2} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm text-foreground leading-tight">{mod.label}</div>
                  <div className="text-[11px] text-muted-foreground font-medium mt-0.5 truncate">{mod.sublabel}</div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-400 shrink-0" />
              </button>
            );
          })}
        </div>
      </div>

      {/* Document queue — workers needing attention */}
      <div className="space-y-3">
        <div className="flex items-center justify-between ml-1">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Needs Attention</h2>
          <span className="text-[9px] font-black bg-red-500 text-white px-2 py-0.5 rounded-full tracking-wide">
            {alertWorkers.length} workers
          </span>
        </div>

        {loading ? (
          <div className="bg-white rounded-2xl border shadow-sm p-6 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : alertWorkers.length === 0 ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 text-center">
            <FileCheck className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
            <p className="text-sm font-bold text-emerald-700">All workers compliant</p>
            <p className="text-xs text-emerald-600 mt-0.5">No documents need immediate attention.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border shadow-sm divide-y divide-gray-50 overflow-hidden">
            {alertWorkers.map((w) => {
              const style = docStatusStyle[w.status as keyof typeof docStatusStyle] ?? docStatusStyle["Missing"];
              const StatusIcon = style.icon;
              return (
                <div key={w.id} className="p-3.5 flex items-center gap-3">
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border", style.bg)}>
                    <StatusIcon className={cn("w-5 h-5", style.color)} strokeWidth={2} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-foreground leading-tight truncate">{w.name}</div>
                    <div className="text-xs text-muted-foreground">{w.trade} · {w.workplace ?? "No site"}</div>
                  </div>
                  <span className={cn("text-[10px] font-bold px-2 py-1 rounded-full border whitespace-nowrap shrink-0", style.pill)}>
                    {w.status}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Sheets */}
      <AddProfessionalSheet
        isOpen={addOpen}
        onClose={() => setAddOpen(false)}
        accentColor="emerald"
      />
      <TimesheetsSheet isOpen={timesheetsOpen} onClose={() => setTimesheetsOpen(false)} />
      <SiteDeploymentsSheet isOpen={sitesOpen} onClose={() => setSitesOpen(false)} workers={workers} />
    </motion.div>
  );
}
