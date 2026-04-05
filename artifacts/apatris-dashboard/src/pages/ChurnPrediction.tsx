import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { UserMinus, AlertTriangle, Play, CheckCircle2 } from "lucide-react";
import { authHeaders, BASE } from "@/lib/api";


interface Prediction { id: string; worker_name: string; churn_probability: number; risk_level: string; signals: any; recommended_action: string; predicted_leave_date: string | null; }

const RISK_STYLES: Record<string, { bg: string; text: string }> = {
  critical: { bg: "bg-red-500/10 border-red-500/20", text: "text-red-400" },
  high:     { bg: "bg-amber-500/10 border-amber-500/20", text: "text-amber-400" },
  medium:   { bg: "bg-blue-500/10 border-blue-500/20", text: "text-blue-400" },
  low:      { bg: "bg-slate-500/10 border-slate-500/20", text: "text-slate-400" },
};

export default function ChurnPrediction() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: summary } = useQuery({
    queryKey: ["churn-summary"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/churn/summary`, { headers: authHeaders() });
      if (!res.ok) return { critical: 0, high: 0, medium: 0, low: 0, total: 0 };
      return res.json();
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["churn-predictions"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/churn/predictions`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ predictions: Prediction[] }>;
    },
  });

  const scanMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/churn/scan`, { method: "POST", headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: (d) => { toast({ description: `Scanned ${d.scanned}: ${d.atRisk} at risk, ${d.critical} critical` }); queryClient.invalidateQueries({ queryKey: ["churn-predictions", "churn-summary"] }); },
  });

  const resolveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/churn/predictions/${id}/resolve`, { method: "PATCH", headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => { toast({ description: "Resolved" }); queryClient.invalidateQueries({ queryKey: ["churn-predictions", "churn-summary"] }); },
  });

  const predictions = data?.predictions ?? [];
  const s = summary ?? { critical: 0, high: 0, medium: 0, low: 0, total: 0 };

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <UserMinus className="w-7 h-7 text-[#C41E18]" />
          <h1 className="text-3xl font-bold text-white">Churn Prediction</h1>
        </div>
        <p className="text-gray-400">Predict which workers are likely to leave — take action early</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <div className="bg-slate-800 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">At Risk</p><p className="text-2xl font-bold text-white">{s.total}</p></div>
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">Critical</p><p className="text-2xl font-bold text-red-400">{s.critical}</p></div>
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">High</p><p className="text-2xl font-bold text-amber-400">{s.high}</p></div>
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">Medium</p><p className="text-2xl font-bold text-blue-400">{s.medium}</p></div>
        <div className="bg-slate-500/10 border border-slate-500/20 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">Low</p><p className="text-2xl font-bold text-slate-400">{s.low}</p></div>
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
        <div className="text-center py-20 text-slate-500"><UserMinus className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="text-lg font-semibold">No churn risks detected</p></div>
      ) : (
        <div className="space-y-3">
          {predictions.map(p => {
            const rs = RISK_STYLES[p.risk_level] || RISK_STYLES.low;
            const parsedSigs = typeof p.signals === "string" ? (() => { try { return JSON.parse(p.signals); } catch { return []; } })() : p.signals;
            const sigs = Array.isArray(parsedSigs) ? parsedSigs : [];
            return (
              <div key={p.id} className={`rounded-xl border p-4 ${rs.bg}`}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      {p.risk_level === "critical" && <AlertTriangle className="w-4 h-4 text-red-400" />}
                      <p className="text-sm font-bold text-white">{p.worker_name}</p>
                    </div>
                    <p className={`text-xs font-bold ${rs.text}`}>{p.risk_level.toUpperCase()} — {p.churn_probability}% probability</p>
                  </div>
                  {p.predicted_leave_date && <p className="text-[10px] text-slate-500 font-mono">Est. leave: {new Date(p.predicted_leave_date).toLocaleDateString("en-GB")}</p>}
                </div>

                {/* Signals */}
                <div className="space-y-1 mb-3">
                  {sigs.map((sig: any, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <AlertTriangle className="w-3 h-3 text-amber-400 mt-0.5 flex-shrink-0" />
                      <span className="text-slate-300">{sig.detail}</span>
                      <span className="text-slate-600 font-mono ml-auto">+{sig.weight}%</span>
                    </div>
                  ))}
                </div>

                {/* Action */}
                <div className="bg-slate-900/50 rounded-lg p-3 mb-3">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Recommended Action</p>
                  <p className="text-xs text-white">{p.recommended_action}</p>
                </div>

                <button onClick={() => resolveMutation.mutate(p.id)} disabled={resolveMutation.isPending}
                  className="px-3 py-1.5 bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-bold hover:bg-emerald-600/30 disabled:opacity-50">
                  <CheckCircle2 className="w-3 h-3 inline mr-1" />Resolve
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
