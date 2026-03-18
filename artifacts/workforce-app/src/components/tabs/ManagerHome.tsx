import {
  AlertCircle, AlertTriangle, ShieldX, CheckCircle2, Lock,
  Clock, Scale, FileSignature, Stethoscope, Users,
  LayoutGrid, MapPin, FileText,
  ChevronRight,
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
  onClick?: () => void;
}

function ModuleCard({ icon: Icon, label, sublabel, iconBg, iconColor, accent, full, onClick }: ModuleCardProps) {
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
      </div>
      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-400 transition-colors shrink-0" />
    </button>
  );
}

interface ManagerHomeProps {
  onNavigate: (tab: string) => void;
}

export function ManagerHome({ onNavigate }: ManagerHomeProps) {
  const LEGAL_MODULES: ModuleCardProps[] = [
    {
      icon: Clock,
      label: "Timesheets & Hours",
      sublabel: "142 hrs logged this month",
      iconBg: "bg-blue-50",
      iconColor: "text-blue-600",
      accent: "hover:border-blue-200 hover:bg-blue-50/20",
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
    },
    {
      icon: Users,
      label: "Professional Directory",
      sublabel: "5 deployed · 4 active sites",
      iconBg: "bg-indigo-50",
      iconColor: "text-indigo-600",
      accent: "hover:border-indigo-200 hover:bg-indigo-50/20",
      full: true,
      onClick: () => onNavigate("workers"),
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
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="px-4 py-5 space-y-6 pb-6"
    >
      {/* Financial firewall notice */}
      <div className="bg-violet-50 border border-violet-200 rounded-2xl p-3.5 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
          <Lock className="w-4 h-4 text-violet-600" />
        </div>
        <div>
          <div className="text-xs font-bold text-violet-800">Financial Firewall Active</div>
          <div className="text-[11px] text-violet-600/80 font-medium">ZUS & Payroll ledgers are restricted to Tier 1 (Executive Board) only.</div>
        </div>
      </div>

      {/* Legal Platform Modules */}
      <div className="space-y-3">
        <div className="flex items-center justify-between ml-1">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Platform Modules</h2>
          <span className="text-[9px] font-black bg-violet-600 text-white px-2 py-0.5 rounded-full tracking-wide">LEGAL ACCESS</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {LEGAL_MODULES.map((mod) => (
            <ModuleCard key={mod.label} {...mod} />
          ))}
        </div>
      </div>

      {/* Operational access — T3 / T4 / T5 inherited */}
      <div className="space-y-3">
        <div className="flex items-center justify-between ml-1">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Operational Access</h2>
          <span className="text-[9px] font-black bg-gray-700 text-white px-2 py-0.5 rounded-full tracking-wide">T3–T5</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {OPERATIONAL_MODULES.map((mod) => (
            <ModuleCard key={mod.label} {...mod} />
          ))}
        </div>
      </div>

      {/* Legality alerts */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 ml-1">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Legality Alerts</h2>
          <span className="bg-red-100 text-red-700 text-[10px] font-bold px-1.5 py-0.5 rounded-md">3</span>
        </div>
        <p className="text-xs text-muted-foreground ml-1 -mt-2">Deployed professionals requiring immediate attention</p>

        <div className="space-y-3">
          <div className="bg-white rounded-2xl border-l-4 border-l-amber-400 border border-border shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-500" />
                <span className="font-bold text-sm text-foreground">TRC Expiring Soon</span>
              </div>
              <span className="bg-amber-50 text-amber-700 text-[10px] font-bold px-2 py-1 rounded-md">1 professional</span>
            </div>
            <div className="flex items-center justify-between py-2 border-t border-gray-100">
              <div>
                <div className="text-sm font-semibold">Tomasz Nowak</div>
                <div className="text-xs text-muted-foreground">Steel Fixer · Site B – Kraków East</div>
              </div>
              <div className="text-sm font-bold text-amber-600">24 days</div>
            </div>
            <button className="text-amber-600 text-xs font-semibold mt-2 hover:underline active:opacity-70 transition-opacity">
              View Dossier →
            </button>
          </div>

          <div className="bg-white rounded-2xl border-l-4 border-l-red-500 border border-border shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                <span className="font-bold text-sm text-foreground">Missing TRC Certificate</span>
              </div>
              <span className="bg-red-50 text-red-700 text-[10px] font-bold px-2 py-1 rounded-md">1 professional</span>
            </div>
            <div className="flex items-center justify-between py-2 border-t border-gray-100">
              <div>
                <div className="text-sm font-semibold">Piotr Wiśniewski</div>
                <div className="text-xs text-muted-foreground">Welder · Site A – Warsaw North</div>
              </div>
              <div className="text-sm font-bold text-red-600">Overdue</div>
            </div>
            <button className="text-red-600 text-xs font-semibold mt-2 hover:underline active:opacity-70 transition-opacity">
              View Dossier →
            </button>
          </div>

          <div className="bg-white rounded-2xl border-l-4 border-l-red-500 border border-border shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <ShieldX className="w-4 h-4 text-red-500" />
                <span className="font-bold text-sm text-foreground">PESEL Verification Failed</span>
              </div>
              <span className="bg-red-50 text-red-700 text-[10px] font-bold px-2 py-1 rounded-md">1 professional</span>
            </div>
            <div className="flex items-center justify-between py-2 border-t border-gray-100">
              <div>
                <div className="text-sm font-semibold">Kamil Wróbel</div>
                <div className="text-xs text-muted-foreground">Scaffolder · Site B – Kraków East</div>
              </div>
              <div className="text-sm font-bold text-red-600">Verify Now</div>
            </div>
            <button className="text-red-600 text-xs font-semibold mt-2 hover:underline active:opacity-70 transition-opacity">
              View Dossier →
            </button>
          </div>
        </div>
      </div>

      {/* All clear */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 ml-1">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">All Clear</h2>
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <div>
              <div className="text-sm font-bold text-emerald-900">Badania Lekarskie</div>
              <div className="text-xs text-emerald-700/80 font-medium">All medical certificates valid</div>
            </div>
          </div>
          <div className="text-[10px] text-emerald-700 font-semibold bg-emerald-100/60 px-2 py-1 rounded-md">
            Next: Jun 2026
          </div>
        </div>
      </div>
    </motion.div>
  );
}
