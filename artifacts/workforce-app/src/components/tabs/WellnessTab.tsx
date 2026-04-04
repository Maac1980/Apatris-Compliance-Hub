import { useQuery } from "@tanstack/react-query";
import { Heart, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

const API = import.meta.env.VITE_API_URL ?? "";

export function WellnessTab() {
  const { data: summary } = useQuery({ queryKey: ["wellness-summary"], queryFn: async () => { const r = await fetch(`${API}api/wellness/summary`, { headers: authHeaders() }); if (!r.ok) return {}; return r.json(); } });
  const { data, isLoading } = useQuery({ queryKey: ["wellness-scores"], queryFn: async () => { const r = await fetch(`${API}api/wellness/scores`, { headers: authHeaders() }); if (!r.ok) return { scores: [] }; return r.json(); } });

  const scores = (data?.scores ?? []).sort((a: any, b: any) => a.wellness_score - b.wellness_score);
  const s = summary ?? {};

  return (
    <div className="p-4 min-h-full overflow-y-auto pb-24 bg-[#0c0c0e]">
      <div className="flex items-center gap-2 mb-3"><Heart className="w-5 h-5 text-[#C41E18]" /><h2 className="text-lg font-bold text-white">Wellness</h2></div>

      <div className="flex gap-2 mb-4">
        <div className="flex-1 px-3 py-2 bg-slate-500/10 border border-slate-500/20 rounded-xl text-center">
          <p className={cn("text-lg font-black", (s.avgScore ?? 0) >= 70 ? "text-emerald-400" : (s.avgScore ?? 0) >= 40 ? "text-amber-400" : "text-red-400")}>{s.avgScore ?? 0}</p>
          <p className="text-[9px] text-white/40 uppercase font-bold">Avg Score</p>
        </div>
        <div className="flex-1 px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-center">
          <p className="text-lg font-black text-emerald-400">{s.healthy ?? 0}</p>
          <p className="text-[9px] text-emerald-400/60 uppercase font-bold">Healthy</p>
        </div>
        <div className="flex-1 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-xl text-center">
          <p className="text-lg font-black text-red-400">{s.atRisk ?? 0}</p>
          <p className="text-[9px] text-red-400/60 uppercase font-bold">At Risk</p>
        </div>
      </div>

      {isLoading ? <div className="flex justify-center py-16"><div className="animate-spin w-6 h-6 border-2 border-[#C41E18] border-t-transparent rounded-full" /></div> : scores.length === 0 ? (
        <div className="text-center py-16 text-white/30"><Heart className="w-10 h-10 mx-auto mb-2 opacity-30" /><p className="text-sm font-semibold">No data</p></div>
      ) : (
        <div className="space-y-2">
          {scores.map((w: any) => (
            <div key={w.id} className={cn("rounded-2xl border p-3.5 flex items-center gap-3",
              w.wellness_score >= 70 ? "bg-emerald-500/5 border-emerald-500/15" : w.wellness_score >= 40 ? "bg-amber-500/5 border-amber-500/15" : "bg-red-500/5 border-red-500/15"
            )}>
              <div className={cn("w-10 h-10 rounded-full flex items-center justify-center text-xs font-black text-white",
                w.wellness_score >= 70 ? "bg-emerald-500" : w.wellness_score >= 40 ? "bg-amber-500" : "bg-red-500"
              )}>{w.wellness_score}</div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-white truncate">{w.worker_name}</p>
                <p className="text-[9px] text-white/40">Net: {Number(w.net_salary).toLocaleString("pl")} · Save: {Number(w.estimated_savings).toLocaleString("pl")} PLN</p>
              </div>
              {w.wellness_score < 30 && <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
