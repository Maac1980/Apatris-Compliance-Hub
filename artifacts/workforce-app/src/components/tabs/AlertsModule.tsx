import {
  AlertCircle, AlertTriangle, ShieldX, ShieldAlert,
  CheckCircle2, Clock, FileX, ChevronRight
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface AlertItem {
  id: string;
  severity: "critical" | "warning" | "info";
  icon: React.ElementType;
  title: string;
  name: string;
  role: string;
  site: string;
  detail: string;
  detailColor: string;
}

const ALERTS: AlertItem[] = [
  {
    id: "a1",
    severity: "critical",
    icon: AlertTriangle,
    title: "Missing TRC Certificate",
    name: "Piotr Wiśniewski",
    role: "Welder",
    site: "Site A – Warsaw North",
    detail: "Overdue",
    detailColor: "text-red-600",
  },
  {
    id: "a2",
    severity: "critical",
    icon: ShieldX,
    title: "PESEL Verification Failed",
    name: "Kamil Wróbel",
    role: "Scaffolder",
    site: "Site B – Kraków East",
    detail: "Verify Now",
    detailColor: "text-red-600",
  },
  {
    id: "a3",
    severity: "critical",
    icon: FileX,
    title: "TRC Certificate Expired",
    name: "Kamil Wróbel",
    role: "Scaffolder",
    site: "Site B – Kraków East",
    detail: "Dec 2024",
    detailColor: "text-red-600",
  },
  {
    id: "a4",
    severity: "warning",
    icon: AlertCircle,
    title: "TRC Expiring Soon",
    name: "Tomasz Nowak",
    role: "Steel Fixer",
    site: "Site B – Kraków East",
    detail: "24 days",
    detailColor: "text-amber-600",
  },
  {
    id: "a5",
    severity: "warning",
    icon: Clock,
    title: "Medical Certificate Expiring",
    name: "Tomasz Nowak",
    role: "Steel Fixer",
    site: "Site B – Kraków East",
    detail: "42 days",
    detailColor: "text-amber-600",
  },
];

const severityConfig = {
  critical: { border: "border-l-red-500", badge: "bg-red-50 text-red-700", iconColor: "text-red-500" },
  warning: { border: "border-l-amber-400", badge: "bg-amber-50 text-amber-700", iconColor: "text-amber-500" },
  info: { border: "border-l-blue-400", badge: "bg-blue-50 text-blue-700", iconColor: "text-blue-500" },
};

export function AlertsModule() {
  const critical = ALERTS.filter(a => a.severity === "critical");
  const warnings = ALERTS.filter(a => a.severity === "warning");

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="px-4 py-5 space-y-5 pb-6"
    >
      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-center">
          <div className="text-2xl font-black text-red-600">{critical.length}</div>
          <div className="text-xs font-bold text-red-700 mt-1">Critical</div>
          <div className="text-[10px] text-red-500 font-medium">Immediate action</div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center">
          <div className="text-2xl font-black text-amber-600">{warnings.length}</div>
          <div className="text-xs font-bold text-amber-700 mt-1">Warnings</div>
          <div className="text-[10px] text-amber-500 font-medium">Action within 30 days</div>
        </div>
      </div>

      {/* Critical */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 ml-1">
          <ShieldAlert className="w-4 h-4 text-red-600" />
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Critical Issues</h2>
          <span className="bg-red-100 text-red-700 text-[10px] font-bold px-1.5 py-0.5 rounded-md">{critical.length}</span>
        </div>

        {critical.map(alert => {
          const cfg = severityConfig[alert.severity];
          const Icon = alert.icon;
          return (
            <div key={alert.id} className={cn("bg-white rounded-2xl border border-l-4 shadow-sm p-4", cfg.border)}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Icon className={cn("w-4 h-4", cfg.iconColor)} />
                  <span className="font-bold text-sm text-foreground">{alert.title}</span>
                </div>
                <span className={cn("text-[10px] font-bold px-2 py-1 rounded-md", cfg.badge)}>Critical</span>
              </div>
              <div className="flex items-center justify-between py-2 border-t border-gray-100">
                <div>
                  <div className="text-sm font-semibold">{alert.name}</div>
                  <div className="text-xs text-muted-foreground">{alert.role} · {alert.site}</div>
                </div>
                <div className={cn("text-sm font-bold", alert.detailColor)}>{alert.detail}</div>
              </div>
              <button className="text-red-600 text-xs font-semibold mt-2 hover:underline active:opacity-70 flex items-center gap-1">
                View Dossier <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Warnings */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 ml-1">
          <AlertCircle className="w-4 h-4 text-amber-600" />
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Warnings</h2>
          <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-1.5 py-0.5 rounded-md">{warnings.length}</span>
        </div>

        {warnings.map(alert => {
          const cfg = severityConfig[alert.severity];
          const Icon = alert.icon;
          return (
            <div key={alert.id} className={cn("bg-white rounded-2xl border border-l-4 shadow-sm p-4", cfg.border)}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Icon className={cn("w-4 h-4", cfg.iconColor)} />
                  <span className="font-bold text-sm text-foreground">{alert.title}</span>
                </div>
                <span className={cn("text-[10px] font-bold px-2 py-1 rounded-md", cfg.badge)}>Warning</span>
              </div>
              <div className="flex items-center justify-between py-2 border-t border-gray-100">
                <div>
                  <div className="text-sm font-semibold">{alert.name}</div>
                  <div className="text-xs text-muted-foreground">{alert.role} · {alert.site}</div>
                </div>
                <div className={cn("text-sm font-bold", alert.detailColor)}>{alert.detail}</div>
              </div>
              <button className="text-amber-600 text-xs font-semibold mt-2 hover:underline active:opacity-70 flex items-center gap-1">
                View Dossier <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          );
        })}
      </div>

      {/* All Clear */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center gap-3">
        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
        <div>
          <div className="text-sm font-bold text-emerald-900">Badania Lekarskie — All Clear</div>
          <div className="text-xs text-emerald-700/80">All medical certificates valid · Next expiry Jun 2026</div>
        </div>
      </div>
    </motion.div>
  );
}
