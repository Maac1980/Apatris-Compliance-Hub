import React from "react";
import { useQuery } from "@tanstack/react-query";
import { authHeaders, BASE } from "@/lib/api";
import { Brain, AlertTriangle, TrendingUp, TrendingDown, Minus, MapPin, Shield, Zap } from "lucide-react";

const SEV: Record<string, { text: string; bg: string }> = {
  CRITICAL: { text: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
  HIGH: { text: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20" },
  MEDIUM: { text: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
  LOW: { text: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
};

export default function IntelligenceDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["intelligence-overview"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/v1/intelligence/overview`, { headers: authHeaders() });
      if (!res.ok) return null;
      return res.json();
    },
  });

  if (isLoading) return <div className="p-6 min-h-screen bg-background flex justify-center pt-20"><div className="animate-spin w-8 h-8 border-2 border-[#C41E18] border-t-transparent rounded-full" /></div>;

  const d = data ?? { riskPatterns: [], rejectionInsights: [], voivodeshipInsights: [], systemicIssues: [], summary: {} };

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2"><Brain className="w-7 h-7 text-[#C41E18]" /><h1 className="text-3xl font-bold text-white">Intelligence Dashboard</h1></div>
        <p className="text-gray-400">Cross-worker patterns, trends, and systemic insights</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <div className="rounded-xl p-3 bg-slate-800"><p className="text-[10px] text-gray-400 uppercase">Workers at Risk</p><p className="text-xl font-bold text-white">{d.summary?.atRisk ?? 0}</p></div>
        <div className="rounded-xl p-3 bg-red-500/10 border border-red-500/20"><p className="text-[10px] text-gray-400 uppercase">Critical Patterns</p><p className="text-xl font-bold text-red-400">{d.summary?.criticalPatterns ?? 0}</p></div>
        <div className="rounded-xl p-3 bg-slate-800"><p className="text-[10px] text-gray-400 uppercase">Systemic Issues</p><p className="text-xl font-bold text-orange-400">{d.systemicIssues?.length ?? 0}</p></div>
        <div className="rounded-xl p-3 bg-blue-500/10 border border-blue-500/20"><p className="text-[10px] text-gray-400 uppercase">Top Action</p><p className="text-xs font-bold text-blue-400 mt-1">{d.summary?.topAction ?? "—"}</p></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Risk Patterns */}
        <div>
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3"><AlertTriangle className="w-3.5 h-3.5 inline mr-1" />Risk Patterns</h2>
          {(d.riskPatterns ?? []).length === 0 ? <Empty text="No risk patterns detected" /> : (
            <div className="space-y-2">
              {(d.riskPatterns ?? []).map((p: any, i: number) => {
                const s = SEV[p.severity] ?? SEV.MEDIUM;
                return (
                  <div key={i} className={`rounded-xl border p-3 ${s.bg}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-bold ${s.text}`}>{p.description}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${s.text}`}>{p.count}</span>
                    </div>
                    <p className="text-[10px] text-slate-400">{p.impact}</p>
                    <p className="text-[10px] text-slate-500 mt-1">→ {p.recommendedAction}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Rejection Insights */}
        <div>
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3"><Shield className="w-3.5 h-3.5 inline mr-1" />Rejection Patterns</h2>
          {(d.rejectionInsights ?? []).length === 0 ? <Empty text="No rejection data yet" /> : (
            <div className="space-y-2">
              {(d.rejectionInsights ?? []).map((r: any, i: number) => (
                <div key={i} className="rounded-xl border border-slate-700 bg-slate-800/50 p-3 flex items-center gap-3">
                  <div className="flex-1">
                    <p className="text-xs font-bold text-white">{r.category}</p>
                    <p className="text-[10px] text-slate-400">{r.percentage}% of all rejections ({r.count})</p>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] font-bold">
                    {r.trend === "up" ? <><TrendingUp className="w-3 h-3 text-red-400" /><span className="text-red-400">+{r.trendPercent}%</span></> :
                     r.trend === "down" ? <><TrendingDown className="w-3 h-3 text-emerald-400" /><span className="text-emerald-400">{r.trendPercent}%</span></> :
                     <><Minus className="w-3 h-3 text-slate-500" /><span className="text-slate-500">stable</span></>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Voivodeship Insights */}
        <div>
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3"><MapPin className="w-3.5 h-3.5 inline mr-1" />Voivodeship Intelligence</h2>
          {(d.voivodeshipInsights ?? []).length === 0 ? <Empty text="No voivodeship data yet" /> : (
            <div className="space-y-2">
              {(d.voivodeshipInsights ?? []).map((v: any, i: number) => (
                <div key={i} className="rounded-xl border border-slate-700 bg-slate-800/50 p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-white">{v.voivodeship}</span>
                    <span className="text-[10px] text-slate-500">{v.totalCases} cases</span>
                  </div>
                  <div className="flex gap-3 text-[10px]">
                    <span className="text-emerald-400">✓{v.approvedCount}</span>
                    <span className="text-red-400">✗{v.rejectedCount}</span>
                    <span className="text-blue-400">⏳{v.pendingCount}</span>
                    <span className="text-slate-400">Rej: {v.rejectionRate}%</span>
                    {v.avgProcessingDays && <span className="text-slate-400">{v.avgProcessingDays}d avg</span>}
                  </div>
                  {v.topIssue && <p className="text-[10px] text-amber-400 mt-1">Top issue: {v.topIssue}</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Systemic Issues */}
        <div>
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3"><Zap className="w-3.5 h-3.5 inline mr-1" />Systemic Issues</h2>
          {(d.systemicIssues ?? []).length === 0 ? <Empty text="No systemic issues detected" /> : (
            <div className="space-y-2">
              {(d.systemicIssues ?? []).map((s: any, i: number) => {
                const sv = SEV[s.severity] ?? SEV.HIGH;
                return (
                  <div key={i} className={`rounded-xl border p-3 ${sv.bg}`}>
                    <p className={`text-xs font-bold ${sv.text}`}>{s.description}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{s.impact}</p>
                    <p className="text-[10px] text-slate-500 mt-1">→ {s.action}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-6 text-center text-slate-500 text-sm">{text}</div>;
}
