import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { TrendingUp, Brain, ArrowUp, ArrowDown, Minus, Search } from "lucide-react";
import { authHeaders, BASE } from "@/lib/api";


const ROLES = ["TIG Welder", "MIG Welder", "MAG Welder", "MMA Welder", "Electrician", "Scaffolder", "Forklift Operator", "Fabricator"];
const COUNTRIES = [
  { code: "PL", name: "Poland" }, { code: "NL", name: "Netherlands" }, { code: "BE", name: "Belgium" },
  { code: "LT", name: "Lithuania" }, { code: "SK", name: "Slovakia" }, { code: "CZ", name: "Czech Republic" }, { code: "RO", name: "Romania" },
];

interface Comparison {
  workerId: string; name: string; role: string; site: string; country: string;
  currentRate: number; marketAvg: number; difference: number; percentDiff: number; status: string;
}

export default function SalaryBenchmark() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [role, setRole] = useState("TIG Welder");
  const [country, setCountry] = useState("PL");
  const [prediction, setPrediction] = useState<any>(null);

  const { data: compData, isLoading } = useQuery({
    queryKey: ["salary-compare-all"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/salary/compare-all`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ comparisons: Comparison[]; underpaid: number; overpaid: number; atMarket: number }>;
    },
  });

  const predictMutation = useMutation({
    mutationFn: async (body: Record<string, string>) => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/salary/predict`, { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: (data) => { setPrediction(data.prediction); toast({ description: `Market rate: ${data.prediction.avgRate} EUR/h` }); queryClient.invalidateQueries({ queryKey: ["salary-benchmarks"] }); },
    onError: (err) => { toast({ description: err instanceof Error ? err.message : "Failed", variant: "destructive" }); },
  });

  const comparisons = compData?.comparisons ?? [];
  const fmtEur = (n: number) => `€${n.toFixed(2)}`;

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <TrendingUp className="w-7 h-7 text-[#C41E18]" />
          <h1 className="text-3xl font-bold text-white">Salary Prediction AI</h1>
        </div>
        <p className="text-gray-400">AI-powered market rate analysis across 7 EU countries</p>
      </div>

      {/* AI Prediction form */}
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 mb-6">
        <h3 className="text-sm font-bold text-white mb-3">Predict Market Rate</h3>
        <div className="flex flex-wrap gap-3 mb-3">
          <select value={role} onChange={e => setRole(e.target.value)}
            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#C41E18]">
            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <select value={country} onChange={e => setCountry(e.target.value)}
            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#C41E18]">
            {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
          <button onClick={() => predictMutation.mutate({ roleType: role, country })} disabled={predictMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-[#C41E18] text-white rounded-lg text-sm font-bold hover:bg-[#a51914] disabled:opacity-50">
            {predictMutation.isPending ? <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : <Brain className="w-4 h-4" />}
            Predict
          </button>
        </div>

        {prediction && (
          <div className="bg-slate-800 rounded-lg p-4 grid grid-cols-3 gap-4">
            <div><p className="text-xs text-slate-500">Min Rate</p><p className="text-lg font-bold text-white font-mono">{fmtEur(prediction.minRate)}/h</p></div>
            <div><p className="text-xs text-slate-500">Average</p><p className="text-lg font-bold text-emerald-400 font-mono">{fmtEur(prediction.avgRate)}/h</p></div>
            <div><p className="text-xs text-slate-500">Max Rate</p><p className="text-lg font-bold text-white font-mono">{fmtEur(prediction.maxRate)}/h</p></div>
            <div className="col-span-3"><p className="text-xs text-slate-400">{prediction.recommendation}</p></div>
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
          <p className="text-xs text-gray-400 font-mono uppercase mb-1">Underpaid</p>
          <p className="text-2xl font-bold text-red-400">{compData?.underpaid ?? 0}</p>
        </div>
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
          <p className="text-xs text-gray-400 font-mono uppercase mb-1">At Market</p>
          <p className="text-2xl font-bold text-emerald-400">{compData?.atMarket ?? 0}</p>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
          <p className="text-xs text-gray-400 font-mono uppercase mb-1">Overpaid</p>
          <p className="text-2xl font-bold text-amber-400">{compData?.overpaid ?? 0}</p>
        </div>
      </div>

      {/* Comparison table */}
      {isLoading ? (
        <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-[#C41E18] border-t-transparent rounded-full" /></div>
      ) : (
        <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 bg-slate-800/50">
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase">Worker</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase">Role</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase">Country</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase">Current</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase">Market</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase">Diff</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase">Status</th>
              </tr>
            </thead>
            <tbody>
              {comparisons.map(c => (
                <tr key={c.workerId} className="border-b border-slate-800 hover:bg-slate-800/40">
                  <td className="px-4 py-3 font-medium text-white">{c.name}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{c.role}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs font-mono">{c.country}</td>
                  <td className="px-4 py-3 text-white font-mono text-xs">{fmtEur(c.currentRate)}/h</td>
                  <td className="px-4 py-3 text-slate-300 font-mono text-xs">{fmtEur(c.marketAvg)}/h</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-bold font-mono flex items-center gap-1 ${c.percentDiff > 0 ? "text-amber-400" : c.percentDiff < 0 ? "text-red-400" : "text-emerald-400"}`}>
                      {c.percentDiff > 0 ? <ArrowUp className="w-3 h-3" /> : c.percentDiff < 0 ? <ArrowDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                      {c.percentDiff > 0 ? "+" : ""}{c.percentDiff}%
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                      c.status === "underpaid" ? "bg-red-500/10 text-red-400 border-red-500/20" :
                      c.status === "overpaid" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                      "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    }`}>{c.status === "market_rate" ? "MARKET" : c.status.toUpperCase()}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
