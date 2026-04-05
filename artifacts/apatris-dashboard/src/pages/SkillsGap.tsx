import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Award, Play, TrendingUp, Users, AlertTriangle } from "lucide-react";
import { authHeaders, BASE } from "@/lib/api";


interface Gap { id: string; skill_name: string; certification_name: string; demand_level: string; current_pool_count: number; shortage_count: number; avg_premium_rate: string; recommendation: string; }
interface Rec { certification: string; skill: string; shortage: number; premiumPerHour: number; estimatedMonthlyRevenue: number; demandLevel: string; }

const DEMAND_STYLES: Record<string, { bg: string; text: string }> = {
  critical: { bg: "bg-red-500/10 border-red-500/20", text: "text-red-400" },
  high: { bg: "bg-amber-500/10 border-amber-500/20", text: "text-amber-400" },
  medium: { bg: "bg-blue-500/10 border-blue-500/20", text: "text-blue-400" },
  low: { bg: "bg-emerald-500/10 border-emerald-500/20", text: "text-emerald-400" },
};

export default function SkillsGap() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: gapData, isLoading } = useQuery({
    queryKey: ["skills-gaps"],
    queryFn: async () => { const r = await fetch(`${import.meta.env.BASE_URL}api/skills/gaps`, { headers: authHeaders() }); if (!r.ok) throw new Error("Failed"); return r.json() as Promise<{ gaps: Gap[] }>; },
  });

  const { data: recData } = useQuery({
    queryKey: ["skills-recs"],
    queryFn: async () => { const r = await fetch(`${import.meta.env.BASE_URL}api/skills/recommendations`, { headers: authHeaders() }); if (!r.ok) return { recommendations: [] }; return r.json() as Promise<{ recommendations: Rec[] }>; },
  });

  const analyseMutation = useMutation({
    mutationFn: async () => { const r = await fetch(`${import.meta.env.BASE_URL}api/skills/analyse`, { method: "POST", headers: authHeaders() }); if (!r.ok) throw new Error("Failed"); return r.json(); },
    onSuccess: (d) => { toast({ description: `Analysed ${d.analysed} skills, ${d.totalWorkers} workers, ${d.totalDemand} demand` }); queryClient.invalidateQueries({ queryKey: ["skills-gaps", "skills-recs"] }); },
  });

  const gaps = gapData?.gaps ?? [];
  const recs = recData?.recommendations ?? [];
  const fmtEur = (n: number) => `€${n.toLocaleString("en", { maximumFractionDigits: 0 })}`;
  const totalShortage = gaps.reduce((s, g) => s + g.shortage_count, 0);
  const totalRevOpp = recs.reduce((s, r) => s + r.estimatedMonthlyRevenue, 0);

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2"><Award className="w-7 h-7 text-[#C41E18]" /><h1 className="text-3xl font-bold text-white">Skills Gap Analysis</h1></div>
        <p className="text-gray-400">AI-powered workforce skills vs demand analysis</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">Total Shortage</p><p className="text-2xl font-bold text-red-400">{totalShortage}</p></div>
        <div className="bg-[#B8860B]/10 border border-[#B8860B]/20 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">Revenue Opportunity</p><p className="text-xl font-bold text-[#B8860B]">{fmtEur(totalRevOpp)}/mo</p></div>
        <div className="bg-slate-800 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">Skills Tracked</p><p className="text-2xl font-bold text-white">{gaps.length}</p></div>
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">Critical Gaps</p><p className="text-2xl font-bold text-red-400">{gaps.filter(g => g.demand_level === "critical").length}</p></div>
      </div>

      {/* Top recommendations */}
      {recs.length > 0 && (
        <div className="bg-[#B8860B]/10 border border-[#B8860B]/20 rounded-xl p-4 mb-6">
          <h3 className="text-sm font-bold text-[#B8860B] mb-3 flex items-center gap-2"><TrendingUp className="w-4 h-4" />Top Certifications to Invest In</h3>
          <div className="space-y-2">
            {recs.map((r, i) => (
              <div key={i} className="flex items-center justify-between bg-slate-900/50 rounded-lg p-3">
                <div>
                  <p className="text-sm font-bold text-white">{r.certification}</p>
                  <p className="text-[10px] text-slate-400">Shortage: {r.shortage} workers · +€{r.premiumPerHour}/h premium</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-[#B8860B] font-mono">{fmtEur(r.estimatedMonthlyRevenue)}/mo</p>
                  <span className={`text-[9px] font-bold ${DEMAND_STYLES[r.demandLevel]?.text || "text-slate-400"}`}>{r.demandLevel.toUpperCase()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end mb-4">
        <button onClick={() => analyseMutation.mutate()} disabled={analyseMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-[#C41E18] text-white rounded-lg text-sm font-bold hover:bg-[#a51914] disabled:opacity-50">
          {analyseMutation.isPending ? <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : <Play className="w-4 h-4" />}
          Run Analysis
        </button>
      </div>

      {/* Skills gap table */}
      {isLoading ? <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-[#C41E18] border-t-transparent rounded-full" /></div> : gaps.length === 0 ? (
        <div className="text-center py-20 text-slate-500"><Award className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="text-lg font-semibold">No skills data</p><p className="text-sm mt-1">Click "Run Analysis" to scan</p></div>
      ) : (
        <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-700 bg-slate-800/50">
              <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase">Skill / Certification</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase">Demand</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase">Pool</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase">Shortage</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase">Premium</th>
            </tr></thead>
            <tbody>
              {gaps.map(g => {
                const ds = DEMAND_STYLES[g.demand_level] || DEMAND_STYLES.low;
                return (
                  <tr key={g.id} className="border-b border-slate-800 hover:bg-slate-800/40">
                    <td className="px-4 py-3"><p className="font-medium text-white">{g.skill_name}</p><p className="text-[10px] text-slate-500">{g.certification_name}</p></td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${ds.bg} ${ds.text}`}>{g.demand_level.toUpperCase()}</span></td>
                    <td className="px-4 py-3 text-white font-mono">{g.current_pool_count}</td>
                    <td className="px-4 py-3"><span className={`font-mono font-bold ${g.shortage_count > 0 ? "text-red-400" : "text-emerald-400"}`}>{g.shortage_count}</span></td>
                    <td className="px-4 py-3 text-[#B8860B] font-mono font-bold">+€{Number(g.avg_premium_rate)}/h</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
