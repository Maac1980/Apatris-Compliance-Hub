import React from "react";
import { useQuery } from "@tanstack/react-query";
import { authHeaders, BASE } from "@/lib/api";
import { AlertTriangle, Shield, Clock, Users } from "lucide-react";

const SEV_STYLE: Record<string, { text: string; bg: string }> = {
  CRITICAL: { text: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
  HIGH: { text: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20" },
  MEDIUM: { text: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
  LOW: { text: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
};

export default function RiskOverview() {
  const { data, isLoading } = useQuery({
    queryKey: ["risk-overview"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/v1/risk/overview`, { headers: authHeaders() });
      if (!res.ok) return null;
      return res.json();
    },
    refetchInterval: 60_000,
  });

  if (isLoading) return <div className="p-6 min-h-screen bg-background flex justify-center pt-20"><div className="animate-spin w-8 h-8 border-2 border-[#C41E18] border-t-transparent rounded-full" /></div>;

  const d = data ?? { totalWorkers: 0, atRisk7Days: 0, atRisk30Days: 0, criticalIssues: 0, riskDistribution: {}, topRisks: [] };

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <AlertTriangle className="w-7 h-7 text-[#C41E18]" />
          <h1 className="text-3xl font-bold text-white">Risk Overview</h1>
        </div>
        <p className="text-gray-400">Predictive compliance risk across all workers</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <Card label="Total Workers" value={d.totalWorkers} color="text-white" bg="bg-slate-800" />
        <Card label="At Risk (7d)" value={d.atRisk7Days} color="text-red-400" bg="bg-red-500/10 border border-red-500/20" />
        <Card label="At Risk (30d)" value={d.atRisk30Days} color="text-orange-400" bg="bg-orange-500/10 border border-orange-500/20" />
        <Card label="Critical" value={d.criticalIssues} color="text-red-400" bg="bg-red-900/20 border border-red-800/30" />
        <Card label="High" value={d.riskDistribution?.HIGH ?? 0} color="text-orange-400" bg="bg-orange-500/10 border border-orange-500/20" />
      </div>

      {/* Risk distribution */}
      <div className="grid grid-cols-4 gap-2 mb-6">
        {(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).map(sev => {
          const s = SEV_STYLE[sev];
          return (
            <div key={sev} className={`rounded-xl border p-3 text-center ${s.bg}`}>
              <p className={`text-2xl font-bold ${s.text}`}>{d.riskDistribution?.[sev] ?? 0}</p>
              <p className="text-[10px] text-slate-400 uppercase font-bold">{sev}</p>
            </div>
          );
        })}
      </div>

      {/* Top risks */}
      <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Top Risks</h2>
      {(d.topRisks ?? []).length === 0 ? (
        <div className="text-center py-10 text-slate-500">
          <Shield className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No critical or high risks detected</p>
        </div>
      ) : (
        <div className="space-y-2">
          {(d.topRisks ?? []).map((r: any, i: number) => {
            const s = SEV_STYLE[r.severity] ?? SEV_STYLE.MEDIUM;
            return (
              <div key={i} className={`rounded-xl border p-3 flex items-center gap-3 ${s.bg}`}>
                <AlertTriangle className={`w-4 h-4 ${s.text} flex-shrink-0`} />
                <div className="flex-1">
                  <p className="text-sm font-bold text-white">{r.workerName}</p>
                  <p className={`text-xs ${s.text}`}>{r.description}</p>
                </div>
                <div className="text-right">
                  <span className={`text-xs font-bold ${s.text}`}>{r.severity}</span>
                  {r.daysUntilImpact > 0 && <p className="text-[10px] text-slate-500 font-mono">{r.daysUntilImpact}d</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Card({ label, value, color, bg }: { label: string; value: number; color: string; bg: string }) {
  return (
    <div className={`rounded-xl p-3 ${bg}`}>
      <p className="text-[10px] text-gray-400 font-mono uppercase mb-0.5">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
