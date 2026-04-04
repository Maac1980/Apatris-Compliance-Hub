import { useQuery } from "@tanstack/react-query";
import { Zap, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

const API = import.meta.env.VITE_API_URL ?? "";

export function DeploymentTab() {
  const { data: stats } = useQuery({ queryKey: ["deployment-stats"], queryFn: async () => { const r = await fetch(`${API}api/deployments/stats`, { headers: authHeaders() }); if (!r.ok) return {}; return r.json(); } });
  const { data, isLoading } = useQuery({ queryKey: ["deployments"], queryFn: async () => { const r = await fetch(`${API}api/deployments`, { headers: authHeaders() }); if (!r.ok) return { deployments: [] }; return r.json(); } });

  const s = stats ?? {};
  const deployments = data?.deployments ?? [];

  return (
    <div className="p-4 min-h-full overflow-y-auto pb-24 bg-[#0c0c0e]">
      <div className="flex items-center gap-2 mb-3"><Zap className="w-5 h-5 text-[#B8860B]" /><h2 className="text-lg font-bold text-white">Deployments</h2></div>
      <div className="flex gap-2 mb-4">
        <div className="flex-1 px-3 py-2 bg-[#B8860B]/10 border border-[#B8860B]/20 rounded-xl text-center"><p className="text-lg font-black text-[#B8860B]">{s.avgMinutes ?? 0}m</p><p className="text-[9px] text-[#B8860B]/60 uppercase font-bold">Avg Time</p></div>
        <div className="flex-1 px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-center"><p className="text-lg font-black text-emerald-400">{s.slaPercentage ?? 0}%</p><p className="text-[9px] text-emerald-400/60 uppercase font-bold">SLA Met</p></div>
        <div className="flex-1 px-3 py-2 bg-slate-500/10 border border-slate-500/20 rounded-xl text-center"><p className="text-lg font-black text-white">{s.totalDeployments ?? 0}</p><p className="text-[9px] text-white/40 uppercase font-bold">Total</p></div>
      </div>
      {isLoading ? <div className="flex justify-center py-16"><div className="animate-spin w-6 h-6 border-2 border-[#B8860B] border-t-transparent rounded-full" /></div> : (
        <div className="space-y-2">
          {deployments.slice(0, 10).map((d: any) => (
            <div key={d.id} className={cn("rounded-2xl border p-3.5", d.sla_met ? "bg-emerald-500/5 border-emerald-500/15" : "bg-amber-500/5 border-amber-500/15")}>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-bold text-white truncate">{d.worker_name || "—"}</p>
                <span className={cn("text-sm font-black font-mono", d.sla_met ? "text-emerald-400" : "text-amber-400")}>{Number(d.total_minutes).toFixed(1)}m</span>
              </div>
              <p className="text-[10px] text-white/40">{d.company_name || ""}</p>
              <span className={cn("text-[9px] font-bold", d.sla_met ? "text-emerald-400" : "text-amber-400")}>{d.sla_met ? "SLA MET ✓" : "EXCEEDED"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
