import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Heart, Play, AlertTriangle } from "lucide-react";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

function scoreColor(s: number) { return s >= 70 ? "text-emerald-400" : s >= 40 ? "text-amber-400" : "text-red-400"; }
function scoreBg(s: number) { return s >= 70 ? "bg-emerald-500" : s >= 40 ? "bg-amber-500" : "bg-red-500"; }

export default function FinancialWellness() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: summary } = useQuery({ queryKey: ["wellness-summary"], queryFn: async () => { const r = await fetch(`${import.meta.env.BASE_URL}api/wellness/summary`, { headers: authHeaders() }); if (!r.ok) return {}; return r.json(); } });
  const { data, isLoading } = useQuery({ queryKey: ["wellness-scores"], queryFn: async () => { const r = await fetch(`${import.meta.env.BASE_URL}api/wellness/scores`, { headers: authHeaders() }); if (!r.ok) throw new Error("Failed"); return r.json(); } });

  const calcMutation = useMutation({
    mutationFn: async () => { const r = await fetch(`${import.meta.env.BASE_URL}api/wellness/calculate`, { method: "POST", headers: authHeaders() }); if (!r.ok) throw new Error("Failed"); return r.json(); },
    onSuccess: (d) => { toast({ description: `Calculated ${d.calculated} workers` }); queryClient.invalidateQueries({ queryKey: ["wellness-scores", "wellness-summary"] }); },
  });

  const s = summary ?? {};
  const scores = (data?.scores ?? []).sort((a: any, b: any) => a.wellness_score - b.wellness_score);
  const fmtPln = (n: number) => `${n.toLocaleString("pl")} PLN`;

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2"><Heart className="w-7 h-7 text-[#C41E18]" /><h1 className="text-3xl font-bold text-white">Financial Wellness</h1></div>
        <p className="text-gray-400">Worker financial health scores — savings, ZUS, advances, stability</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-slate-800 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">Avg Score</p><p className={`text-2xl font-bold ${scoreColor(s.avgScore ?? 0)}`}>{s.avgScore ?? 0}/100</p></div>
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">Healthy (70+)</p><p className="text-2xl font-bold text-emerald-400">{s.healthy ?? 0}</p></div>
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">At Risk (&lt;30)</p><p className="text-2xl font-bold text-red-400">{s.atRisk ?? 0}</p></div>
        <div className="bg-slate-800 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">Total</p><p className="text-2xl font-bold text-white">{s.total ?? 0}</p></div>
      </div>

      <div className="flex justify-end mb-4">
        <button onClick={() => calcMutation.mutate()} disabled={calcMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-[#C41E18] text-white rounded-lg text-sm font-bold hover:bg-[#a51914] disabled:opacity-50">
          {calcMutation.isPending ? <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : <Play className="w-4 h-4" />}Calculate
        </button>
      </div>

      {isLoading ? <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-[#C41E18] border-t-transparent rounded-full" /></div> : scores.length === 0 ? (
        <div className="text-center py-20 text-slate-500"><Heart className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="text-lg font-semibold">No wellness data</p></div>
      ) : (
        <div className="space-y-2">
          {scores.map((w: any) => (
            <div key={w.id} className="bg-slate-900 border border-slate-700 rounded-xl p-4 flex items-center gap-4">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-black text-white ${scoreBg(w.wellness_score)}`}>{w.wellness_score}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white">{w.worker_name}</p>
                <div className="flex gap-3 text-[10px] text-slate-500">
                  <span>Net: {fmtPln(Number(w.net_salary))}</span>
                  <span>ZUS: {fmtPln(Number(w.zus_contributions))}</span>
                  <span>Savings: {fmtPln(Number(w.estimated_savings))}</span>
                  {Number(w.advances_taken) > 0 && <span className="text-amber-400">Adv: {fmtPln(Number(w.advances_taken))}</span>}
                </div>
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden mt-1">
                  <div className={`h-full rounded-full ${scoreBg(w.wellness_score)}`} style={{ width: `${w.wellness_score}%` }} />
                </div>
              </div>
              {w.wellness_score < 30 && <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
