import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Shield, AlertTriangle, CheckCircle2, Play, TrendingUp } from "lucide-react";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

interface Prediction { id: string; worker_name: string; risk_type: string; risk_description: string; predicted_fine_min: string; predicted_fine_max: string; probability: string; priority: string; due_date: string | null; }
interface Summary { activeRisks: number; outstandingFines: number; criticalRisks: number; resolvedRisks: number; finesPrevented: number; }

const PRIORITY_STYLES: Record<string, { bg: string; text: string }> = {
  critical: { bg: "bg-red-500/10 border-red-500/20", text: "text-red-400" },
  high:     { bg: "bg-amber-500/10 border-amber-500/20", text: "text-amber-400" },
  medium:   { bg: "bg-blue-500/10 border-blue-500/20", text: "text-blue-400" },
};

export default function FinesPrevention() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fmtEur = (n: number) => n.toLocaleString("en", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

  const { data: summary } = useQuery({
    queryKey: ["fines-summary"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/fines/summary`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<Summary>;
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["fines-predictions"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/fines/predictions`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ predictions: Prediction[] }>;
    },
  });

  const scanMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/fines/scan`, { method: "POST", headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: (data) => {
      toast({ description: `Scanned ${data.scanned} workers: ${data.risksFound} risks, ${data.critical} critical` });
      queryClient.invalidateQueries({ queryKey: ["fines-predictions", "fines-summary"] });
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/fines/predictions/${id}/resolve`, { method: "PATCH", headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => { toast({ description: "Risk resolved" }); queryClient.invalidateQueries({ queryKey: ["fines-predictions", "fines-summary"] }); },
  });

  const predictions = data?.predictions ?? [];
  const s = summary ?? { activeRisks: 0, outstandingFines: 0, criticalRisks: 0, resolvedRisks: 0, finesPrevented: 0 };

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Shield className="w-7 h-7 text-[#B8860B]" />
          <h1 className="text-3xl font-bold text-white">Fines Prevention Engine</h1>
        </div>
        <p className="text-gray-400">Predictive risk detection — prevent PIP fines before they happen</p>
      </div>

      {/* Hero: fines prevented */}
      <div className="bg-gradient-to-r from-[#B8860B]/20 to-[#996F00]/10 border border-[#B8860B]/30 rounded-2xl p-8 mb-6 text-center">
        <p className="text-xs text-[#B8860B] font-bold uppercase tracking-[0.2em] mb-2">Total Fines Prevented</p>
        <p className="text-5xl font-black text-[#B8860B]">{fmtEur(s.finesPrevented)}</p>
        <p className="text-sm text-slate-400 mt-2">{s.resolvedRisks} risks resolved</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
          <p className="text-xs text-gray-400 font-mono uppercase mb-1">Critical Risks</p>
          <p className="text-2xl font-bold text-red-400">{s.criticalRisks}</p>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
          <p className="text-xs text-gray-400 font-mono uppercase mb-1">Active Risks</p>
          <p className="text-2xl font-bold text-amber-400">{s.activeRisks}</p>
        </div>
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
          <p className="text-xs text-gray-400 font-mono uppercase mb-1">Outstanding</p>
          <p className="text-xl font-bold text-red-400">{fmtEur(s.outstandingFines)}</p>
        </div>
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
          <p className="text-xs text-gray-400 font-mono uppercase mb-1">Prevented</p>
          <p className="text-xl font-bold text-emerald-400">{fmtEur(s.finesPrevented)}</p>
        </div>
      </div>

      <div className="flex justify-end mb-4">
        <button onClick={() => scanMutation.mutate()} disabled={scanMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-[#C41E18] text-white rounded-lg text-sm font-bold hover:bg-[#a51914] disabled:opacity-50">
          {scanMutation.isPending ? <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : <Play className="w-4 h-4" />}
          Scan All Workers
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-[#C41E18] border-t-transparent rounded-full" /></div>
      ) : predictions.length === 0 ? (
        <div className="text-center py-20 text-slate-500"><Shield className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="text-lg font-semibold">No active risks — all clear</p></div>
      ) : (
        <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 bg-slate-800/50">
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase">Priority</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase">Worker</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase">Risk</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase">Est. Fine</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase">Prob.</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase">Due</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {predictions.map(p => {
                const ps = PRIORITY_STYLES[p.priority] || PRIORITY_STYLES.medium;
                return (
                  <tr key={p.id} className="border-b border-slate-800 hover:bg-slate-800/40">
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${ps.bg} ${ps.text}`}>
                        {p.priority === "critical" && <AlertTriangle className="w-2.5 h-2.5 inline mr-1" />}
                        {p.priority.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-white">{p.worker_name}</td>
                    <td className="px-4 py-3 text-xs text-slate-300 max-w-[200px] truncate">{p.risk_description}</td>
                    <td className="px-4 py-3 text-xs font-mono text-red-400">{fmtEur(Number(p.predicted_fine_min))} — {fmtEur(Number(p.predicted_fine_max))}</td>
                    <td className="px-4 py-3 text-xs font-bold font-mono text-amber-400">{Number(p.probability)}%</td>
                    <td className="px-4 py-3 text-xs text-slate-400 font-mono">{p.due_date ? new Date(p.due_date).toLocaleDateString("en-GB") : "—"}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => resolveMutation.mutate(p.id)} disabled={resolveMutation.isPending}
                        className="px-2 py-1 bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 rounded text-[10px] font-bold hover:bg-emerald-600/30 disabled:opacity-50">
                        <CheckCircle2 className="w-3 h-3 inline mr-1" />Resolve
                      </button>
                    </td>
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
