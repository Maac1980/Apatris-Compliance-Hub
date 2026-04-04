import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Radio, Play, CheckCircle2, AlertTriangle, TrendingUp, Zap } from "lucide-react";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

interface Signal { id: string; signal_type: string; country: string; role_type: string | null; signal_strength: string; description: string; recommended_action: string; detected_at: string; expires_at: string | null; }

const TYPE_LABELS: Record<string, { label: string; icon: typeof TrendingUp; color: string }> = {
  demand_surge: { label: "Demand Surge", icon: TrendingUp, color: "text-emerald-400 bg-emerald-500/10" },
  rate_increase: { label: "Rate Increase", icon: TrendingUp, color: "text-amber-400 bg-amber-500/10" },
  shortage: { label: "Shortage", icon: AlertTriangle, color: "text-red-400 bg-red-500/10" },
  regulation_change: { label: "Regulation", icon: Zap, color: "text-indigo-400 bg-indigo-500/10" },
  seasonal_peak: { label: "Seasonal Peak", icon: Radio, color: "text-blue-400 bg-blue-500/10" },
};

const STR_STYLES: Record<string, { bg: string; text: string }> = {
  critical: { bg: "bg-red-500/10 border-red-500/20", text: "text-red-400" },
  high: { bg: "bg-amber-500/10 border-amber-500/20", text: "text-amber-400" },
  medium: { bg: "bg-blue-500/10 border-blue-500/20", text: "text-blue-400" },
  low: { bg: "bg-slate-500/10 border-slate-500/20", text: "text-slate-400" },
};

export default function MarketSignals() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: summary } = useQuery({
    queryKey: ["signals-summary"],
    queryFn: async () => { const r = await fetch(`${import.meta.env.BASE_URL}api/signals/summary`, { headers: authHeaders() }); if (!r.ok) return { total: 0, critical: 0 }; return r.json(); },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["signals"],
    queryFn: async () => { const r = await fetch(`${import.meta.env.BASE_URL}api/signals`, { headers: authHeaders() }); if (!r.ok) throw new Error("Failed"); return r.json() as Promise<{ signals: Signal[] }>; },
  });

  const scanMutation = useMutation({
    mutationFn: async () => { const r = await fetch(`${import.meta.env.BASE_URL}api/signals/scan`, { method: "POST", headers: authHeaders() }); if (!r.ok) throw new Error("Failed"); return r.json(); },
    onSuccess: (d) => { toast({ description: `Scanned ${d.scanned}: ${d.found} signals, ${d.critical} critical` }); queryClient.invalidateQueries({ queryKey: ["signals", "signals-summary"] }); },
  });

  const ackMutation = useMutation({
    mutationFn: async (id: string) => { const r = await fetch(`${import.meta.env.BASE_URL}api/signals/${id}/acknowledge`, { method: "PATCH", headers: authHeaders() }); if (!r.ok) throw new Error("Failed"); return r.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["signals", "signals-summary"] }); },
  });

  const signals = data?.signals ?? [];

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2"><Radio className="w-7 h-7 text-[#C41E18]" /><h1 className="text-3xl font-bold text-white">Market Signals</h1></div>
        <p className="text-gray-400">AI-powered labour market intelligence — demand, shortages, regulations</p>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-slate-800 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">Active Signals</p><p className="text-2xl font-bold text-white">{summary?.total ?? 0}</p></div>
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">Critical</p><p className="text-2xl font-bold text-red-400">{summary?.critical ?? 0}</p></div>
        <div className="bg-slate-800 rounded-xl p-4">
          <button onClick={() => scanMutation.mutate()} disabled={scanMutation.isPending}
            className="flex items-center gap-2 text-sm font-bold text-[#C41E18]">
            {scanMutation.isPending ? <div className="animate-spin w-4 h-4 border-2 border-[#C41E18] border-t-transparent rounded-full" /> : <Play className="w-4 h-4" />}
            Scan Market
          </button>
        </div>
      </div>

      {isLoading ? <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-[#C41E18] border-t-transparent rounded-full" /></div> : signals.length === 0 ? (
        <div className="text-center py-20 text-slate-500"><Radio className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="text-lg font-semibold">No active signals</p><p className="text-sm mt-1">Click "Scan Market" to detect signals</p></div>
      ) : (
        <div className="space-y-3">
          {signals.map(s => {
            const type = TYPE_LABELS[s.signal_type] || TYPE_LABELS.demand_surge;
            const str = STR_STYLES[s.signal_strength] || STR_STYLES.medium;
            return (
              <div key={s.id} className={`rounded-xl border p-4 ${str.bg}`}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${type.color}`}>{type.label}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${str.bg} ${str.text}`}>{s.signal_strength.toUpperCase()}</span>
                      <span className="text-[10px] text-slate-500 font-mono">{s.country}{s.role_type ? ` · ${s.role_type}` : ""}</span>
                    </div>
                    <p className="text-sm font-bold text-white">{s.description}</p>
                  </div>
                  <button onClick={() => ackMutation.mutate(s.id)} className="px-2 py-1 bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 rounded text-[10px] font-bold flex-shrink-0">
                    <CheckCircle2 className="w-3 h-3 inline mr-1" />ACK
                  </button>
                </div>
                {s.recommended_action && (
                  <div className="bg-slate-900/50 rounded-lg p-2 mt-2">
                    <p className="text-[9px] text-slate-500 uppercase tracking-wider mb-0.5">Recommended Action</p>
                    <p className="text-xs text-slate-300">{s.recommended_action}</p>
                  </div>
                )}
                <p className="text-[9px] text-slate-600 font-mono mt-2">{new Date(s.detected_at).toLocaleDateString("en-GB")}{s.expires_at ? ` · Expires ${new Date(s.expires_at).toLocaleDateString("en-GB")}` : ""}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
