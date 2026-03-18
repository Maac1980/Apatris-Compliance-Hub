import { useState } from "react";
import {
  AlertCircle, AlertTriangle, ShieldX, ShieldAlert,
  CheckCircle2, Clock, FileX, ChevronRight, X, Bell,
  RefreshCw, PhoneCall,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
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
  action: string;
  actionColor: string;
}

const INITIAL_ALERTS: AlertItem[] = [
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
    action: "Request Upload",
    actionColor: "text-red-600",
  },
  {
    id: "a2",
    severity: "critical",
    icon: ShieldX,
    title: "PESEL Verification Failed",
    name: "Kamil Wróbel",
    role: "Scaffolder",
    site: "Site B – Kraków East",
    detail: "Action Required",
    detailColor: "text-red-600",
    action: "Verify Identity",
    actionColor: "text-red-600",
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
    action: "Schedule Renewal",
    actionColor: "text-red-600",
  },
  {
    id: "a4",
    severity: "critical",
    icon: FileX,
    title: "TRC & Medical Expired",
    name: "Serhiy Melnyk",
    role: "Steel Fixer",
    site: "Site D – Wrocław South",
    detail: "Oct 2025",
    detailColor: "text-red-600",
    action: "Schedule Renewal",
    actionColor: "text-red-600",
  },
  {
    id: "a5",
    severity: "critical",
    icon: ShieldX,
    title: "PESEL Missing & ZUS Unregistered",
    name: "Serhiy Melnyk",
    role: "Steel Fixer",
    site: "Site D – Wrocław South",
    detail: "ZUS Risk",
    detailColor: "text-red-600",
    action: "Register ZUS",
    actionColor: "text-red-600",
  },
  {
    id: "a6",
    severity: "warning",
    icon: AlertCircle,
    title: "TRC Expiring in 24 Days",
    name: "Tomasz Nowak",
    role: "Steel Fixer",
    site: "Site B – Kraków East",
    detail: "24 days",
    detailColor: "text-amber-600",
    action: "Arrange Renewal",
    actionColor: "text-amber-600",
  },
  {
    id: "a7",
    severity: "warning",
    icon: AlertCircle,
    title: "TRC Expiring in 35 Days",
    name: "Bogdan Szymański",
    role: "Steel Fixer",
    site: "Site C – Gdańsk Port",
    detail: "35 days",
    detailColor: "text-amber-600",
    action: "Arrange Renewal",
    actionColor: "text-amber-600",
  },
  {
    id: "a8",
    severity: "warning",
    icon: Clock,
    title: "Passport Expiring in 20 Days",
    name: "Jan Kowalczyk",
    role: "Welder",
    site: "Site A – Warsaw North",
    detail: "20 days",
    detailColor: "text-amber-600",
    action: "Request Renewal",
    actionColor: "text-amber-600",
  },
  {
    id: "a9",
    severity: "warning",
    icon: AlertCircle,
    title: "UDT Certificate Missing",
    name: "Rafał Lewandowski",
    role: "Pipe Fitter",
    site: "Site D – Wrocław South",
    detail: "Required",
    detailColor: "text-amber-600",
    action: "Upload Now",
    actionColor: "text-amber-600",
  },
];

const severityConfig = {
  critical: {
    border:    "border-l-red-500",
    badge:     "bg-red-50 text-red-700 border border-red-200",
    iconColor: "text-red-500",
    actionBtn: "bg-red-50 text-red-700 border border-red-200 hover:bg-red-100",
  },
  warning: {
    border:    "border-l-amber-400",
    badge:     "bg-amber-50 text-amber-700 border border-amber-200",
    iconColor: "text-amber-500",
    actionBtn: "bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100",
  },
  info: {
    border:    "border-l-blue-400",
    badge:     "bg-blue-50 text-blue-700 border border-blue-200",
    iconColor: "text-blue-500",
    actionBtn: "bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100",
  },
};

export function AlertsModule() {
  const [alerts, setAlerts] = useState<AlertItem[]>(INITIAL_ALERTS);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visibleAlerts = alerts.filter(a => !dismissed.has(a.id));
  const critical = visibleAlerts.filter(a => a.severity === "critical");
  const warnings  = visibleAlerts.filter(a => a.severity === "warning");

  const handleDismiss = (id: string) => {
    setDismissed(prev => new Set([...prev, id]));
  };

  const handleAction = (alert: AlertItem) => {
    handleDismiss(alert.id);
  };

  const handleRestore = () => {
    setDismissed(new Set());
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="px-4 py-5 space-y-5 pb-8"
    >
      {/* Header summary cards */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-3.5 text-center">
          <div className="text-2xl font-black text-red-600">{critical.length}</div>
          <div className="text-[10px] font-bold text-red-700 mt-0.5">Critical</div>
          <div className="text-[9px] text-red-500 font-medium">Immediate</div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 text-center">
          <div className="text-2xl font-black text-amber-600">{warnings.length}</div>
          <div className="text-[10px] font-bold text-amber-700 mt-0.5">Warnings</div>
          <div className="text-[9px] text-amber-500 font-medium">30 days</div>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 text-center">
          <div className="text-2xl font-black text-emerald-600">{dismissed.size}</div>
          <div className="text-[10px] font-bold text-emerald-700 mt-0.5">Resolved</div>
          <div className="text-[9px] text-emerald-500 font-medium">Actioned</div>
        </div>
      </div>

      {/* Restore banner */}
      {dismissed.size > 0 && (
        <button
          onClick={handleRestore}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-dashed border-gray-300 text-xs font-semibold text-muted-foreground hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Restore {dismissed.size} resolved alert{dismissed.size > 1 ? "s" : ""}
        </button>
      )}

      {/* Critical section */}
      {critical.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 ml-1">
            <ShieldAlert className="w-4 h-4 text-red-600" />
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Critical Issues</h2>
            <span className="bg-red-100 text-red-700 text-[10px] font-bold px-1.5 py-0.5 rounded-md">{critical.length}</span>
          </div>

          <AnimatePresence>
            {critical.map(alert => {
              const cfg = severityConfig[alert.severity];
              const Icon = alert.icon;
              return (
                <motion.div
                  key={alert.id}
                  layout
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 30, height: 0, marginBottom: 0, padding: 0, overflow: "hidden" }}
                  transition={{ duration: 0.22 }}
                  className={cn("bg-white rounded-2xl border border-l-4 shadow-sm p-4", cfg.border)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <Icon className={cn("w-4 h-4 shrink-0", cfg.iconColor)} />
                      <span className="font-bold text-sm text-foreground leading-tight">{alert.title}</span>
                    </div>
                    <button
                      onClick={() => handleDismiss(alert.id)}
                      className="w-6 h-6 rounded-full flex items-center justify-center text-gray-300 hover:text-gray-500 hover:bg-gray-100 shrink-0 ml-2 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between py-2.5 border-t border-gray-100">
                    <div>
                      <div className="text-sm font-semibold">{alert.name}</div>
                      <div className="text-xs text-muted-foreground">{alert.role} · {alert.site}</div>
                    </div>
                    <div className={cn("text-sm font-bold shrink-0 ml-2", alert.detailColor)}>{alert.detail}</div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => handleAction(alert)}
                      className={cn("flex-1 flex items-center justify-center gap-1.5 h-8 rounded-xl text-[11px] font-bold transition-colors active:scale-95", cfg.actionBtn)}
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                      {alert.action}
                    </button>
                    <button
                      className="flex items-center justify-center gap-1 h-8 px-3 rounded-xl bg-gray-50 border text-gray-500 text-[11px] font-semibold hover:bg-gray-100 transition-colors active:scale-95"
                    >
                      <PhoneCall className="w-3 h-3" />
                      Call
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Warnings section */}
      {warnings.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 ml-1">
            <AlertCircle className="w-4 h-4 text-amber-600" />
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Warnings</h2>
            <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-1.5 py-0.5 rounded-md">{warnings.length}</span>
          </div>

          <AnimatePresence>
            {warnings.map(alert => {
              const cfg = severityConfig[alert.severity];
              const Icon = alert.icon;
              return (
                <motion.div
                  key={alert.id}
                  layout
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 30, height: 0, marginBottom: 0, padding: 0, overflow: "hidden" }}
                  transition={{ duration: 0.22 }}
                  className={cn("bg-white rounded-2xl border border-l-4 shadow-sm p-4", cfg.border)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <Icon className={cn("w-4 h-4 shrink-0", cfg.iconColor)} />
                      <span className="font-bold text-sm text-foreground leading-tight">{alert.title}</span>
                    </div>
                    <button
                      onClick={() => handleDismiss(alert.id)}
                      className="w-6 h-6 rounded-full flex items-center justify-center text-gray-300 hover:text-gray-500 hover:bg-gray-100 shrink-0 ml-2 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between py-2.5 border-t border-gray-100">
                    <div>
                      <div className="text-sm font-semibold">{alert.name}</div>
                      <div className="text-xs text-muted-foreground">{alert.role} · {alert.site}</div>
                    </div>
                    <div className={cn("text-sm font-bold shrink-0 ml-2", alert.detailColor)}>{alert.detail}</div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => handleAction(alert)}
                      className={cn("flex-1 flex items-center justify-center gap-1.5 h-8 rounded-xl text-[11px] font-bold transition-colors active:scale-95", cfg.actionBtn)}
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                      {alert.action}
                    </button>
                    <button
                      className="flex items-center justify-center gap-1 h-8 px-3 rounded-xl bg-gray-50 border text-gray-500 text-[11px] font-semibold hover:bg-gray-100 transition-colors active:scale-95"
                    >
                      <PhoneCall className="w-3 h-3" />
                      Call
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* All clear */}
      {critical.length === 0 && warnings.length === 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center py-16 text-center"
        >
          <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center mb-4">
            <CheckCircle2 className="w-8 h-8 text-emerald-500" />
          </div>
          <h3 className="text-sm font-bold text-foreground mb-1">All Alerts Resolved</h3>
          <p className="text-xs text-muted-foreground">No active issues. Great work keeping the team compliant.</p>
          {dismissed.size > 0 && (
            <button onClick={handleRestore} className="mt-4 text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" /> View {dismissed.size} resolved
            </button>
          )}
        </motion.div>
      )}

      {/* Info strip */}
      {(critical.length > 0 || warnings.length > 0) && (
        <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 flex items-center gap-3">
          <Bell className="w-5 h-5 text-gray-400 shrink-0" />
          <div>
            <div className="text-sm font-bold text-gray-700">Notifications active</div>
            <div className="text-xs text-muted-foreground">Alerts auto-sync from live worker profiles. Dismiss to mark as actioned.</div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
