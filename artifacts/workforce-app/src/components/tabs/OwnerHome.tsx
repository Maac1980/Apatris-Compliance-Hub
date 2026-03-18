import {
  Users, ShieldCheck, AlertTriangle, FileWarning, ShieldX,
  Receipt, Clock, Scale, FileSignature, Stethoscope,
  LayoutGrid, MapPin, ClipboardList, FileText,
  ChevronRight, Bell,
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface ModuleCardProps {
  icon: React.ElementType;
  label: string;
  sublabel?: string;
  iconBg: string;
  iconColor: string;
  accent: string;
  full?: boolean;
  badge?: string;
  badgeColor?: string;
  onClick?: () => void;
}

function ModuleCard({ icon: Icon, label, sublabel, iconBg, iconColor, accent, full, badge, badgeColor, onClick }: ModuleCardProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "bg-white rounded-2xl border shadow-sm p-4 flex items-center gap-3 text-left active:scale-[0.97] transition-all duration-150 hover:shadow-md group",
        accent,
        full ? "col-span-2" : ""
      )}
    >
      <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105", iconBg)}>
        <Icon className={cn("w-5 h-5", iconColor)} strokeWidth={2} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-sm text-foreground leading-tight">{label}</div>
        {sublabel && <div className="text-[11px] text-muted-foreground font-medium mt-0.5 truncate">{sublabel}</div>}
        {badge && (
          <span className={cn("inline-block text-[9px] font-black px-1.5 py-0.5 rounded-full mt-1 tracking-wide", badgeColor)}>
            {badge}
          </span>
        )}
      </div>
      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-400 transition-colors shrink-0" />
    </button>
  );
}

interface OwnerHomeProps {
  onNavigate: (tab: string) => void;
}

export function OwnerHome({ onNavigate }: OwnerHomeProps) {
  const TIER1_MODULES: ModuleCardProps[] = [
    {
      icon: Receipt,
      label: "ZUS & Payroll",
      sublabel: "March 2026 · PLN 42,800",
      iconBg: "bg-indigo-50",
      iconColor: "text-indigo-600",
      accent: "hover:border-indigo-200 hover:bg-indigo-50/20",
      badge: "TIER 1 ONLY",
      badgeColor: "bg-indigo-600 text-white",
      onClick: () => onNavigate("payroll"),
    },
    {
      icon: Bell,
      label: "Compliance Alerts",
      sublabel: "3 active alerts",
      iconBg: "bg-red-50",
      iconColor: "text-red-600",
      accent: "hover:border-red-200 hover:bg-red-50/20",
      onClick: () => onNavigate("alerts"),
    },
    {
      icon: Scale,
      label: "PIP / Legal Dossiers",
      sublabel: "5 active dossiers",
      iconBg: "bg-violet-50",
      iconColor: "text-violet-600",
      accent: "hover:border-violet-200 hover:bg-violet-50/20",
    },
    {
      icon: FileSignature,
      label: "B2B Contracts",
      sublabel: "2 active · All signed",
      iconBg: "bg-emerald-50",
      iconColor: "text-emerald-600",
      accent: "hover:border-emerald-200 hover:bg-emerald-50/20",
    },
    {
      icon: Stethoscope,
      label: "UDT & Badania Lekarskie",
      sublabel: "Next renewal: Jun 2026",
      iconBg: "bg-teal-50",
      iconColor: "text-teal-600",
      accent: "hover:border-teal-200 hover:bg-teal-50/20",
      full: true,
    },
  ];

  const OPERATIONAL_MODULES: ModuleCardProps[] = [
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
      sublabel: "4 active sites",
      iconBg: "bg-emerald-50",
      iconColor: "text-emerald-600",
      accent: "hover:border-emerald-200 hover:bg-emerald-50/20",
      onClick: () => onNavigate("sites"),
    },
    {
      icon: ClipboardList,
      label: "Doc Queue",
      sublabel: "Pending approvals",
      iconBg: "bg-amber-50",
      iconColor: "text-amber-600",
      accent: "hover:border-amber-200 hover:bg-amber-50/20",
      onClick: () => onNavigate("queue"),
    },
    {
      icon: Clock,
      label: "Timesheets",
      sublabel: "142 hrs this month",
      iconBg: "bg-sky-50",
      iconColor: "text-sky-600",
      accent: "hover:border-sky-200 hover:bg-sky-50/20",
      onClick: () => onNavigate("timesheet"),
    },
    {
      icon: FileText,
      label: "My Docs",
      sublabel: "Professional documents",
      iconBg: "bg-gray-50",
      iconColor: "text-gray-600",
      accent: "hover:border-gray-200 hover:bg-gray-50/20",
      onClick: () => onNavigate("docs"),
    },
    {
      icon: Users,
      label: "Professional Directory",
      sublabel: "5 deployed · 4 active sites",
      iconBg: "bg-indigo-50",
      iconColor: "text-indigo-600",
      accent: "hover:border-indigo-200 hover:bg-indigo-50/20",
      onClick: () => onNavigate("workers"),
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="px-4 py-5 space-y-6 pb-6"
    >
      {/* KPI strip */}
      <div className="space-y-3">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Overview</h2>

        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white rounded-xl border shadow-sm p-3 text-center">
            <div className="text-xl font-black text-foreground">5</div>
            <div className="text-[10px] text-muted-foreground font-medium mt-0.5 leading-tight">Deployed<br/>Professionals</div>
          </div>
          <div className="bg-white rounded-xl border shadow-sm p-3 text-center">
            <div className="text-xl font-black text-emerald-600">60%</div>
            <div className="text-[10px] text-muted-foreground font-medium mt-0.5 leading-tight">Compliance<br/>Rate</div>
          </div>
          <div className="bg-white rounded-xl border shadow-sm p-3 text-center">
            <div className="text-xl font-black text-red-600">2</div>
            <div className="text-[10px] text-muted-foreground font-medium mt-0.5 leading-tight">Docs<br/>Missing</div>
          </div>
        </div>

        <div className="flex gap-2">
          <div className="flex-1 bg-white rounded-xl border p-3 flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            </div>
            <div className="text-xs font-medium text-foreground leading-tight">3 fully<br/>compliant</div>
          </div>
          <div className="flex-1 bg-white rounded-xl border p-3 flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
              <FileWarning className="w-3.5 h-3.5 text-amber-600" />
            </div>
            <div className="text-xs font-medium text-foreground leading-tight">1 expiring<br/>soon</div>
          </div>
          <div className="flex-1 bg-white rounded-xl border p-3 flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
              <ShieldX className="w-3.5 h-3.5 text-red-600" />
            </div>
            <div className="text-xs font-medium text-foreground leading-tight">1 PESEL<br/>alert</div>
          </div>
        </div>
      </div>

      {/* Compliance bar */}
      <div className="bg-white rounded-2xl border shadow-sm p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span className="text-sm font-bold text-foreground">Compliance Rate</span>
          </div>
          <span className="text-sm font-black text-emerald-600">60%</span>
        </div>
        <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: "60%" }}
            transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
            className="h-full bg-emerald-500 rounded-full"
          />
        </div>
        <div className="text-[11px] text-muted-foreground mt-1.5">3 of 5 professionals fully compliant · 4 active sites</div>
      </div>

      {/* Tier 1 Platform Modules */}
      <div className="space-y-3">
        <div className="flex items-center justify-between ml-1">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Platform Modules</h2>
          <span className="text-[9px] font-black bg-indigo-600 text-white px-2 py-0.5 rounded-full tracking-wide">FULL ACCESS</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {TIER1_MODULES.map((mod) => (
            <ModuleCard key={mod.label} {...mod} />
          ))}
        </div>
      </div>

      {/* All Tier Access — T2 / T3 / T4 / T5 screens */}
      <div className="space-y-3">
        <div className="flex items-center justify-between ml-1">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Operational Access</h2>
          <span className="text-[9px] font-black bg-gray-700 text-white px-2 py-0.5 rounded-full tracking-wide">T2–T5</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {OPERATIONAL_MODULES.map((mod) => (
            <ModuleCard key={mod.label} {...mod} />
          ))}
        </div>
      </div>

      {/* Critical alert strip */}
      <button
        onClick={() => onNavigate("alerts")}
        className="w-full bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-3 active:scale-[0.98] transition-all text-left"
      >
        <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
          <AlertTriangle className="w-5 h-5 text-red-600" />
        </div>
        <div className="flex-1">
          <div className="text-sm font-bold text-red-800">2 Critical Compliance Issues</div>
          <div className="text-xs text-red-600/80 font-medium mt-0.5">Missing TRC · PESEL unverified — tap to view</div>
        </div>
        <ChevronRight className="w-4 h-4 text-red-400 shrink-0" />
      </button>
    </motion.div>
  );
}
