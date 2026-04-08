/**
 * RiskForecast — shows predicted risks for a worker in the side panel.
 */

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { authHeaders, BASE } from "@/lib/api";
import { AlertTriangle, Clock, Shield, ChevronRight } from "lucide-react";

const SEV_STYLE: Record<string, { bg: string; text: string; dot: string }> = {
  CRITICAL: { bg: "bg-red-500/10", text: "text-red-400", dot: "bg-red-400" },
  HIGH: { bg: "bg-orange-500/10", text: "text-orange-400", dot: "bg-orange-400" },
  MEDIUM: { bg: "bg-amber-500/10", text: "text-amber-400", dot: "bg-amber-400" },
  LOW: { bg: "bg-emerald-500/10", text: "text-emerald-400", dot: "bg-emerald-400" },
};

export function RiskForecast({ workerId }: { workerId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["worker-risk", workerId],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/v1/risk/worker/${workerId}`, { headers: authHeaders() });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!workerId,
  });

  if (isLoading) return null;
  if (!data || !data.predictedRisks?.length) return null;

  const risks = data.predictedRisks ?? [];

  return (
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-amber-500/10 flex items-center gap-2">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
        <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">Upcoming Risks</span>
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400">{risks.length}</span>
      </div>
      <div className="px-4 py-2.5 space-y-1.5">
        {risks.slice(0, 6).map((r: any, i: number) => {
          const s = SEV_STYLE[r.severity] ?? SEV_STYLE.MEDIUM;
          return (
            <div key={i} className="flex items-start gap-2 text-[11px]">
              <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${s.dot}`} />
              <div className="flex-1">
                <span className={`font-semibold ${s.text}`}>{r.description}</span>
                {r.preventionActions?.[0] && (
                  <p className="text-[10px] text-slate-500 mt-0.5">→ {r.preventionActions[0]}</p>
                )}
              </div>
              {r.daysUntilImpact > 0 && (
                <span className="text-[10px] font-mono text-slate-500 flex-shrink-0">{r.daysUntilImpact}d</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
