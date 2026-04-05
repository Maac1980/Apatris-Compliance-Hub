import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { BarChart3, Play, AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";
import { authHeaders, BASE } from "@/lib/api";


interface Margin { id: string; company_name: string; worker_name: string; revenue: string; worker_cost: string; housing_cost: string; admin_cost: string; gross_margin: string; gross_margin_pct: string; flag: string; }

const FLAG_STYLES: Record<string, { bg: string; text: string }> = {
  healthy: { bg: "bg-emerald-500/10 border-emerald-500/20", text: "text-emerald-400" },
  warning: { bg: "bg-amber-500/10 border-amber-500/20", text: "text-amber-400" },
  critical: { bg: "bg-red-500/10 border-red-500/20", text: "text-red-400" },
  losing_money: { bg: "bg-red-900/20 border-red-800/30", text: "text-red-300" },
};

export default function MarginAnalysis() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fmtEur = (n: number) => `€${n.toLocaleString("en", { maximumFractionDigits: 0 })}`;

  const { data: summary } = useQuery({
    queryKey: ["margins-summary"],
    queryFn: async () => { const r = await fetch(`${import.meta.env.BASE_URL}api/margins/summary`, { headers: authHeaders() }); if (!r.ok) return {}; return r.json(); },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["margins"],
    queryFn: async () => { const r = await fetch(`${import.meta.env.BASE_URL}api/margins`, { headers: authHeaders() }); if (!r.ok) throw new Error("Failed"); return r.json() as Promise<{ margins: Margin[] }>; },
  });

  const calcMutation = useMutation({
    mutationFn: async () => { const r = await fetch(`${import.meta.env.BASE_URL}api/margins/calculate`, { method: "POST", headers: authHeaders(), body: JSON.stringify({}) }); if (!r.ok) throw new Error("Failed"); return r.json(); },
    onSuccess: (d) => { toast({ description: `Calculated ${d.calculated} margins` }); queryClient.invalidateQueries({ queryKey: ["margins", "margins-summary"] }); },
  });

  const s = summary ?? {};
  const margins = data?.margins ?? [];

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2"><BarChart3 className="w-7 h-7 text-[#C41E18]" /><h1 className="text-3xl font-bold text-white">Margin Optimisation</h1></div>
        <p className="text-gray-400">Revenue vs cost per worker per client — find losing contracts</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">Avg Margin</p><p className="text-2xl font-bold text-emerald-400">{s.avgMargin ?? 0}%</p></div>
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">Healthy</p><p className="text-2xl font-bold text-emerald-400">{s.healthy ?? 0}</p></div>
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">Warning</p><p className="text-2xl font-bold text-amber-400">{s.warning ?? 0}</p></div>
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">Critical</p><p className="text-2xl font-bold text-red-400">{s.critical ?? 0}</p></div>
        <div className="bg-red-900/20 border border-red-800/30 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">Losing Money</p><p className="text-2xl font-bold text-red-300">{s.losing ?? 0}</p></div>
      </div>

      {/* Best / worst */}
      {(s.bestClients?.length > 0 || s.worstClients?.length > 0) && (
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-4">
            <h3 className="text-sm font-bold text-emerald-400 mb-2 flex items-center gap-1"><TrendingUp className="w-3 h-3" />Best Clients</h3>
            {(s.bestClients ?? []).map((c: any) => <p key={c.name} className="text-xs text-slate-300">{c.name}: <span className="text-emerald-400 font-mono font-bold">{c.margin}%</span></p>)}
          </div>
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-4">
            <h3 className="text-sm font-bold text-red-400 mb-2 flex items-center gap-1"><TrendingDown className="w-3 h-3" />Worst Clients</h3>
            {(s.worstClients ?? []).map((c: any) => <p key={c.name} className="text-xs text-slate-300">{c.name}: <span className={`font-mono font-bold ${c.margin < 0 ? "text-red-400" : "text-amber-400"}`}>{c.margin}%</span></p>)}
          </div>
        </div>
      )}

      <div className="flex justify-end mb-4">
        <button onClick={() => calcMutation.mutate()} disabled={calcMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-[#C41E18] text-white rounded-lg text-sm font-bold hover:bg-[#a51914] disabled:opacity-50">
          {calcMutation.isPending ? <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : <Play className="w-4 h-4" />}Calculate Margins
        </button>
      </div>

      {isLoading ? <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-[#C41E18] border-t-transparent rounded-full" /></div> : margins.length === 0 ? (
        <div className="text-center py-20 text-slate-500"><BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="text-lg font-semibold">No margin data</p></div>
      ) : (
        <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-700 bg-slate-800/50">
              <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase">Client</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase">Worker</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase">Revenue</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase">Cost</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase">Margin</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase">%</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase">Flag</th>
            </tr></thead>
            <tbody>
              {margins.map(m => {
                const fs = FLAG_STYLES[m.flag] || FLAG_STYLES.healthy;
                const totalCost = Number(m.worker_cost) + Number(m.housing_cost) + Number(m.admin_cost);
                return (
                  <tr key={m.id} className={`border-b border-slate-800 ${m.flag === "losing_money" ? "bg-red-900/10" : ""}`}>
                    <td className="px-4 py-3 text-white text-xs">{m.company_name || "—"}</td>
                    <td className="px-4 py-3 text-slate-300 text-xs">{m.worker_name}</td>
                    <td className="px-4 py-3 text-emerald-400 font-mono text-xs">{fmtEur(Number(m.revenue))}</td>
                    <td className="px-4 py-3 text-slate-400 font-mono text-xs">{fmtEur(totalCost)}</td>
                    <td className="px-4 py-3 font-mono text-xs font-bold"><span className={Number(m.gross_margin) >= 0 ? "text-emerald-400" : "text-red-400"}>{fmtEur(Number(m.gross_margin))}</span></td>
                    <td className="px-4 py-3 font-mono text-xs font-bold"><span className={fs.text}>{Number(m.gross_margin_pct).toFixed(1)}%</span></td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${fs.bg} ${fs.text}`}>{m.flag === "losing_money" ? "LOSING" : m.flag.toUpperCase()}</span></td>
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
