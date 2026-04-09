/**
 * SystemHealth — shows silent failures, fallbacks, and staleness across all subsystems.
 * Compact indicator for dashboard header area.
 */

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authHeaders, BASE } from "@/lib/api";
import { Activity, CheckCircle2, AlertTriangle, XOctagon, Clock, ChevronDown, ChevronUp } from "lucide-react";

const STATUS_STYLE: Record<string, { icon: typeof CheckCircle2; color: string; bg: string }> = {
  OK:       { icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  WARNING:  { icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-500/10" },
  FAILED:   { icon: XOctagon, color: "text-red-400", bg: "bg-red-500/10" },
  STALE:    { icon: Clock, color: "text-orange-400", bg: "bg-orange-500/10" },
  DISABLED: { icon: Clock, color: "text-slate-500", bg: "bg-slate-700/50" },
  UNKNOWN:  { icon: Clock, color: "text-slate-500", bg: "bg-slate-700/50" },
};

const OVERALL_STYLE: Record<string, { color: string; bg: string; label: string }> = {
  HEALTHY:   { color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20", label: "All Systems OK" },
  DEGRADED:  { color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20", label: "Warnings" },
  UNHEALTHY: { color: "text-red-400", bg: "bg-red-500/10 border-red-500/20", label: "Issues Detected" },
};

export function SystemHealth() {
  const [expanded, setExpanded] = useState(false);

  const { data } = useQuery({
    queryKey: ["system-health"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/v1/system/health`, { headers: authHeaders() });
      if (!res.ok) return null;
      return res.json();
    },
    refetchInterval: 60_000,
  });

  if (!data) return null;

  const overall = OVERALL_STYLE[data.overall] ?? OVERALL_STYLE.HEALTHY;
  const subsystems = data.subsystems ?? [];
  const issues = subsystems.filter((s: any) => s.status !== "OK" && s.status !== "DISABLED");

  return (
    <div className={`rounded-lg border ${overall.bg} overflow-hidden`}>
      <button onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs">
        <div className="flex items-center gap-2">
          <Activity className={`w-3.5 h-3.5 ${overall.color}`} />
          <span className={`font-bold ${overall.color}`}>{overall.label}</span>
          {issues.length > 0 && (
            <span className="text-[10px] text-slate-500">({issues.length} issue{issues.length > 1 ? "s" : ""})</span>
          )}
        </div>
        {expanded ? <ChevronUp className="w-3 h-3 text-slate-500" /> : <ChevronDown className="w-3 h-3 text-slate-500" />}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-1.5 border-t border-slate-700/30 pt-2">
          {subsystems.map((s: any) => {
            const st = STATUS_STYLE[s.status] ?? STATUS_STYLE.UNKNOWN;
            const Icon = st.icon;
            return (
              <div key={s.name} className="flex items-start gap-2 text-[11px]">
                <Icon className={`w-3 h-3 mt-0.5 flex-shrink-0 ${st.color}`} />
                <div className="flex-1">
                  <span className={`font-semibold ${st.color}`}>{s.name}</span>
                  <p className="text-slate-500 text-[10px]">{s.detail}</p>
                </div>
              </div>
            );
          })}
          <p className="text-[9px] text-slate-600 font-mono pt-1">
            Updated: {new Date(data.timestamp).toLocaleTimeString("en-GB")}
          </p>
        </div>
      )}
    </div>
  );
}
