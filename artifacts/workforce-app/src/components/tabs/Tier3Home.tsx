import {
  UserPlus, ShieldCheck, MapPin, Wrench,
  AlertCircle, Users, Clock, Stethoscope,
  ChevronRight,
} from "lucide-react";
import { motion } from "framer-motion";

interface OpModule {
  icon: React.ElementType;
  label: string;
  sublabel: string;
  iconBg: string;
  iconColor: string;
  border: string;
}

const OPERATIONAL_MODULES: OpModule[] = [
  {
    icon: UserPlus,
    label: "Add Professional",
    sublabel: "Register & onboard",
    iconBg: "bg-blue-50",
    iconColor: "text-blue-600",
    border: "hover:border-blue-200 hover:bg-blue-50/20",
  },
  {
    icon: Clock,
    label: "Timesheets & Hours",
    sublabel: "142 hrs logged",
    iconBg: "bg-amber-50",
    iconColor: "text-amber-600",
    border: "hover:border-amber-200 hover:bg-amber-50/20",
  },
  {
    icon: Stethoscope,
    label: "UDT & Badania Lekarskie",
    sublabel: "Next: Jun 2026",
    iconBg: "bg-teal-50",
    iconColor: "text-teal-600",
    border: "hover:border-teal-200 hover:bg-teal-50/20",
  },
  {
    icon: MapPin,
    label: "Site Deployments",
    sublabel: "3 active sites",
    iconBg: "bg-emerald-50",
    iconColor: "text-emerald-600",
    border: "hover:border-emerald-200 hover:bg-emerald-50/20",
  },
];

export function Tier3Home() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="px-4 py-5 space-y-6 pb-6"
    >
      {/* Shared workspace badge */}
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3.5 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
          <Users className="w-4 h-4 text-blue-700" />
        </div>
        <div>
          <div className="text-xs font-bold text-blue-900">Shared Operational Workspace</div>
          <div className="text-[11px] text-blue-700/80 font-medium">
            Full read/write access to Deployed Professional profiles &amp; document queues — shared with Compliance Coordinators.
          </div>
        </div>
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

      {/* KPI strip */}
      <div className="space-y-2">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Deployment Overview</h2>
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white rounded-xl border shadow-sm p-3 text-center">
            <div className="text-xl font-black text-blue-600">5</div>
            <div className="text-[10px] text-muted-foreground font-medium mt-0.5 leading-tight">Deployed<br/>Pros</div>
          </div>
          <div className="bg-white rounded-xl border shadow-sm p-3 text-center">
            <div className="text-xl font-black text-emerald-600">3</div>
            <div className="text-[10px] text-muted-foreground font-medium mt-0.5 leading-tight">Active<br/>Sites</div>
          </div>
          <div className="bg-white rounded-xl border shadow-sm p-3 text-center">
            <div className="text-xl font-black text-amber-600">142</div>
            <div className="text-[10px] text-muted-foreground font-medium mt-0.5 leading-tight">Hours<br/>Logged</div>
          </div>
        </div>
      </div>

      {/* Pending actions */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 ml-1">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Pending Technical Actions</h2>
          <span className="bg-red-100 text-red-700 text-[10px] font-bold px-1.5 py-0.5 rounded-md">3</span>
        </div>

        <div className="bg-white rounded-2xl border shadow-sm divide-y divide-gray-50">
          <div className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
              <AlertCircle className="w-4 h-4 text-red-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-foreground">TRC Certificate Missing</div>
              <div className="text-xs text-muted-foreground">Piotr Wiśniewski · Site A – Warsaw North</div>
            </div>
            <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-1 rounded-md border border-red-200 shrink-0">Urgent</span>
          </div>

          <div className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
              <AlertCircle className="w-4 h-4 text-amber-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-foreground">TRC Renewal Needed</div>
              <div className="text-xs text-muted-foreground">Tomasz Nowak · Site B – Kraków East</div>
            </div>
            <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-md border border-amber-200 shrink-0">24 days</span>
          </div>

          <div className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
              <Wrench className="w-4 h-4 text-amber-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-foreground">UDT Revalidation</div>
              <div className="text-xs text-muted-foreground">Kamil Wróbel · Site B – Kraków East</div>
            </div>
            <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-md border border-amber-200 shrink-0">Pending</span>
          </div>
        </div>
      </div>

      {/* UDT check CTA */}
      <button className="w-full bg-white border border-blue-200 rounded-2xl p-4 flex items-center justify-between shadow-sm hover:bg-blue-50/30 active:scale-[0.98] transition-all">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-blue-600" />
          </div>
          <div className="text-left">
            <div className="text-sm font-bold text-foreground">Run UDT Compliance Sweep</div>
            <div className="text-xs text-muted-foreground">Verify all certifications across 3 sites</div>
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-blue-400" />
      </button>
    </motion.div>
  );
}
