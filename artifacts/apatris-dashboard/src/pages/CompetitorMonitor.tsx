import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Eye, Play, ArrowUp, ArrowDown, Minus } from "lucide-react";
import { authHeaders, BASE } from "@/lib/api";


interface CompIntel { country: string; role_type: string; their_rate: string; our_rate: string; status: string; recommendation: string; }
const COUNTRIES = [{ code: "", name: "All" }, { code: "PL", name: "Poland" }, { code: "NL", name: "Netherlands" }, { code: "BE", name: "Belgium" }, { code: "LT", name: "Lithuania" }];

export default function CompetitorMonitor() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [country, setCountry] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["competitor-summary"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/competitors/summary`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const scanMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/competitors/scan`, { method: "POST", headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: (d) => { toast({ description: `Scanned ${d.scanned} data points across ${d.countries} countries` }); queryClient.invalidateQueries({ queryKey: ["competitor-summary"] }); },
    onError: (err) => { toast({ description: err instanceof Error ? err.message : "Failed", variant: "destructive" }); },
  });

  const comparisons = ((data?.comparisons ?? []) as CompIntel[]).filter(c => !country || c.country === country);
  const fmtEur = (n: number | string) => `€${Number(n).toFixed(2)}`;

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Eye className="w-7 h-7 text-[#C41E18]" />
          <h1 className="text-3xl font-bold text-white">Competitor Price Monitor</h1>
        </div>
        <p className="text-gray-400">AI-powered market rate intelligence across EU countries</p>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">Overpriced</p><p className="text-2xl font-bold text-amber-400">{data?.overpriced ?? 0}</p></div>
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">Competitive</p><p className="text-2xl font-bold text-emerald-400">{data?.competitive ?? 0}</p></div>
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">Underpriced</p><p className="text-2xl font-bold text-red-400">{data?.underpriced ?? 0}</p></div>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className="flex gap-1">
          {COUNTRIES.map(c => (
            <button key={c.code} onClick={() => setCountry(c.code)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold ${country === c.code ? "bg-[#C41E18] text-white" : "bg-slate-800 text-slate-400 hover:text-white"}`}>
              {c.name}
            </button>
          ))}
        </div>
        <button onClick={() => scanMutation.mutate()} disabled={scanMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-[#C41E18] text-white rounded-lg text-sm font-bold hover:bg-[#a51914] disabled:opacity-50 ml-auto">
          {scanMutation.isPending ? <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : <Play className="w-4 h-4" />}
          Scan Market
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-[#C41E18] border-t-transparent rounded-full" /></div>
      ) : comparisons.length === 0 ? (
        <div className="text-center py-20 text-slate-500"><Eye className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="text-lg font-semibold">No competitor data</p><p className="text-sm mt-1">Click "Scan Market" to gather intelligence</p></div>
      ) : (
        <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 bg-slate-800/50">
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase">Role</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase">Country</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase">Our Rate</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase">Market</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase">Diff</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase">Status</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase">Recommendation</th>
              </tr>
            </thead>
            <tbody>
              {comparisons.map((c, i) => {
                const our = Number(c.our_rate); const their = Number(c.their_rate);
                const diff = our - their; const pct = their > 0 ? Math.round((diff / their) * 100) : 0;
                return (
                  <tr key={i} className="border-b border-slate-800 hover:bg-slate-800/40">
                    <td className="px-4 py-3 font-medium text-white">{c.role_type}</td>
                    <td className="px-4 py-3 text-slate-400 font-mono text-xs">{c.country}</td>
                    <td className="px-4 py-3 text-white font-mono text-xs">{fmtEur(our)}/h</td>
                    <td className="px-4 py-3 text-slate-300 font-mono text-xs">{fmtEur(their)}/h</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-bold font-mono flex items-center gap-1 ${pct > 0 ? "text-amber-400" : pct < 0 ? "text-red-400" : "text-emerald-400"}`}>
                        {pct > 0 ? <ArrowUp className="w-3 h-3" /> : pct < 0 ? <ArrowDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                        {pct > 0 ? "+" : ""}{pct}%
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        c.status === "overpriced" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                        c.status === "underpriced" ? "bg-red-500/10 text-red-400 border-red-500/20" :
                        "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                      }`}>{c.status === "competitive" ? "COMPETITIVE" : c.status.toUpperCase()}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400 max-w-[200px] truncate">{c.recommendation}</td>
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
