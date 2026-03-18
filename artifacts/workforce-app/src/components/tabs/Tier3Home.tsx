import { useState } from "react";
import {
  UserPlus, ShieldCheck, MapPin, Wrench,
  AlertCircle, Users, Clock, Stethoscope,
  ChevronRight, Loader2,
} from "lucide-react";
import { motion } from "framer-motion";
import { useWorkers } from "@/hooks/useWorkers";
import { AddProfessionalSheet } from "@/components/AddProfessionalSheet";
import { TimesheetsSheet } from "@/components/TimesheetsSheet";
import { SiteDeploymentsSheet } from "@/components/SiteDeploymentsSheet";
import { UDTSheet } from "@/components/UDTSheet";

export function Tier3Home() {
  const { workers, loading, isLive } = useWorkers();
  const [addOpen, setAddOpen]               = useState(false);
  const [timesheetsOpen, setTimesheetsOpen] = useState(false);
  const [sitesOpen, setSitesOpen]           = useState(false);
  const [udtOpen, setUdtOpen]               = useState(false);

  const expiringCount   = workers.filter(w => w.status === "Expiring Soon").length;
  const activeSites     = new Set(workers.map(w => w.workplace).filter(Boolean)).size;

  const OPERATIONAL_MODULES = [
    {
      icon: UserPlus,
      label: "Add Professional",
      sublabel: "Register & onboard",
      iconBg: "bg-blue-50",
      iconColor: "text-blue-600",
      border: "hover:border-blue-200 hover:bg-blue-50/20",
      onClick: () => setAddOpen(true),
    },
    {
      icon: Clock,
      label: "Timesheets & Hours",
      sublabel: loading ? "Loading…" : `${workers.length} workers tracked`,
      iconBg: "bg-amber-50",
      iconColor: "text-amber-600",
      border: "hover:border-amber-200 hover:bg-amber-50/20",
      onClick: () => setTimesheetsOpen(true),
    },
    {
      icon: Stethoscope,
      label: "UDT & Badania Lekarskie",
      sublabel: loading ? "…" : `${expiringCount} renewals pending`,
      iconBg: "bg-teal-50",
      iconColor: "text-teal-600",
      border: "hover:border-teal-200 hover:bg-teal-50/20",
      onClick: () => setUdtOpen(true),
    },
    {
      icon: MapPin,
      label: "Site Deployments",
      sublabel: loading ? "…" : `${activeSites} active sites`,
      iconBg: "bg-emerald-50",
      iconColor: "text-emerald-600",
      border: "hover:border-emerald-200 hover:bg-emerald-50/20",
      onClick: () => setSitesOpen(true),
    },
  ];

  // Workers needing attention — non-compliant or expiring
  const alertWorkers = workers.filter(
    w => w.status === "Non-Compliant" ||
         w.status === "Expiring Soon" ||
         w.status === "Missing Docs"
  ).slice(0, 5);

  const statusColor: Record<string, { bg: string; icon: string; pill: string }> = {
    "Non-Compliant": { bg: "bg-red-50",    icon: "text-red-500",    pill: "bg-red-50 text-red-700 border-red-200" },
    "Expiring Soon": { bg: "bg-amber-50",  icon: "text-amber-500",  pill: "bg-amber-50 text-amber-700 border-amber-200" },
    "Missing Docs":  { bg: "bg-gray-100",  icon: "text-gray-400",   pill: "bg-gray-100 text-gray-600 border-gray-200" },
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="px-4 py-5 space-y-6 pb-28 relative"
    >
      {/* Shared workspace badge */}
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3.5 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
          <Users className="w-4 h-4 text-blue-700" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold text-blue-900">Shared Operational Workspace</div>
          <div className="text-[11px] text-blue-700/80 font-medium">
            Full read/write access to Deployed Professional profiles &amp; document queues — shared with Compliance Coordinators.
            {!isLive && !loading && <span className="ml-1 text-amber-600">· Using cached data</span>}
          </div>
        </div>
        {loading && <Loader2 className="w-4 h-4 text-blue-600 animate-spin shrink-0" />}
      </div>

      {/* Operational modules grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between ml-1">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Operational Modules</h2>
          <span className="text-[9px] font-black bg-blue-600 text-white px-2 py-0.5 rounded-full tracking-wide">T3 · T4 ACCESS</span>
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
                  <div className="text-[11px] text-muted-foreground font-medium mt-0.5">{mod.sublabel}</div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-400 shrink-0" />
              </button>
            );
          })}
        </div>
      </div>

      {/* KPI strip — live data */}
      <div className="space-y-2">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Deployment Overview</h2>
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white rounded-xl border shadow-sm p-3 text-center">
            <div className="text-xl font-black text-blue-600">{loading ? "…" : workers.length}</div>
            <div className="text-[10px] text-muted-foreground font-medium mt-0.5 leading-tight">Deployed<br/>Pros</div>
          </div>
          <div className="bg-white rounded-xl border shadow-sm p-3 text-center">
            <div className="text-xl font-black text-emerald-600">{loading ? "…" : activeSites}</div>
            <div className="text-[10px] text-muted-foreground font-medium mt-0.5 leading-tight">Active<br/>Sites</div>
          </div>
          <div className="bg-white rounded-xl border shadow-sm p-3 text-center">
            <div className="text-xl font-black text-amber-600">{loading ? "…" : expiringCount}</div>
            <div className="text-[10px] text-muted-foreground font-medium mt-0.5 leading-tight">Renewals<br/>Needed</div>
          </div>
        </div>
      </div>

      {/* Pending technical actions — live */}
      {alertWorkers.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 ml-1">
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Pending Technical Actions</h2>
            <span className="bg-red-100 text-red-700 text-[10px] font-bold px-1.5 py-0.5 rounded-md">{alertWorkers.length}</span>
          </div>

          <div className="bg-white rounded-2xl border shadow-sm divide-y divide-gray-50">
            {alertWorkers.map((w) => {
              const style = statusColor[w.status] ?? statusColor["Missing Docs"];
              return (
                <div key={w.id} className="p-4 flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${style.bg}`}>
                    <AlertCircle className={`w-4 h-4 ${style.icon}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-foreground truncate">{w.name}</div>
                    <div className="text-xs text-muted-foreground">{w.trade} · {w.workplace ?? "No site"}</div>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-md border whitespace-nowrap shrink-0 ${style.pill}`}>
                    {w.status}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* UDT check CTA */}
      <button
        onClick={() => setSitesOpen(true)}
        className="w-full bg-white border border-blue-200 rounded-2xl p-4 flex items-center justify-between shadow-sm hover:bg-blue-50/30 active:scale-[0.98] transition-all"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-blue-600" />
          </div>
          <div className="text-left">
            <div className="text-sm font-bold text-foreground">View Site Deployments</div>
            <div className="text-xs text-muted-foreground">
              {loading ? "Loading…" : `${workers.length} professionals across ${activeSites} sites`}
            </div>
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-blue-400" />
      </button>

      {/* Sheets */}
      <AddProfessionalSheet isOpen={addOpen} onClose={() => setAddOpen(false)} accentColor="blue" />
      <TimesheetsSheet isOpen={timesheetsOpen} onClose={() => setTimesheetsOpen(false)} />
      <SiteDeploymentsSheet isOpen={sitesOpen} onClose={() => setSitesOpen(false)} workers={workers} />
      <UDTSheet isOpen={udtOpen} onClose={() => setUdtOpen(false)} workers={workers} loading={loading} />
    </motion.div>
  );
}
