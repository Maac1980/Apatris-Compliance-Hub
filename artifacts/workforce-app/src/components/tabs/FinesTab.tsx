import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Shield, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

const API = import.meta.env.VITE_API_URL ?? "";

interface Prediction { id: string; worker_name: string; risk_type: string; risk_description: string; predicted_fine_max: string; probability: string; priority: string; due_date: string | null; }

export function FinesTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fmtEur = (n: number) => n.toLocaleString("en", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

  const { data: summary } = useQuery({
    queryKey: ["fines-summary"],
    queryFn: async () => {
      const res = await fetch(`${API}api/fines/summary`, { headers: authHeaders() });
      if (!res.ok) return { finesPrevented: 0, activeRisks: 0, criticalRisks: 0 };
      return res.json();
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["fines-predictions"],
    queryFn: async () => {
      const res = await fetch(`${API}api/fines/predictions`, { headers: authHeaders() });
      if (!res.ok) return { predictions: [] };
      return res.json() as Promise<{ predictions: Prediction[] }>;
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${API}api/fines/predictions/${id}/resolve`, { method: "PATCH", headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => { toast({ description: "Resolved" }); queryClient.invalidateQueries({ queryKey: ["fines-predictions", "fines-summary"] }); },
  });

  const predictions = data?.predictions ?? [];

  return (
    <div className="p-4 min-h-full overflow-y-auto pb-24 bg-[#0c0c0e]">
      <div className="flex items-center gap-2 mb-3">
        <Shield className="w-5 h-5 text-[#B8860B]" />
        <h2 className="text-lg font-bold text-white">Fines Prevention</h2>
      </div>

      <div className="bg-[#B8860B]/15 border border-[#B8860B]/25 rounded-2xl p-4 text-center mb-4">
        <p className="text-[9px] text-[#B8860B] font-bold uppercase tracking-[0.2em] mb-1">Fines Prevented</p>
        <p className="text-2xl font-black text-[#B8860B]">{fmtEur(summary?.finesPrevented ?? 0)}</p>
      </div>

      <div className="flex gap-2 mb-4">
        <div className="flex-1 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-xl text-center">
          <p className="text-lg font-black text-red-400">{summary?.criticalRisks ?? 0}</p>
          <p className="text-[9px] text-red-400/60 uppercase font-bold">Critical</p>
        </div>
        <div className="flex-1 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-center">
          <p className="text-lg font-black text-amber-400">{summary?.activeRisks ?? 0}</p>
          <p className="text-[9px] text-amber-400/60 uppercase font-bold">Active</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><div className="animate-spin w-6 h-6 border-2 border-[#B8860B] border-t-transparent rounded-full" /></div>
      ) : predictions.length === 0 ? (
        <div className="text-center py-16 text-white/30"><Shield className="w-10 h-10 mx-auto mb-2 opacity-30" /><p className="text-sm font-semibold">All clear</p></div>
      ) : (
        <div className="space-y-2">
          {predictions.map(p => (
            <div key={p.id} className={cn("rounded-2xl border p-3.5",
              p.priority === "critical" ? "bg-red-500/5 border-red-500/15" :
              p.priority === "high" ? "bg-amber-500/5 border-amber-500/15" :
              "bg-white/[0.03] border-white/[0.06]"
            )}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  {p.priority === "critical" && <AlertTriangle className="w-3 h-3 text-red-400" />}
                  <p className="text-xs font-bold text-white">{p.worker_name}</p>
                </div>
                <span className={cn("text-[9px] font-bold uppercase",
                  p.priority === "critical" ? "text-red-400" : p.priority === "high" ? "text-amber-400" : "text-blue-400"
                )}>{p.priority}</span>
              </div>
              <p className="text-[10px] text-white/40 line-clamp-1">{p.risk_description}</p>
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs font-black text-red-400 font-mono">{fmtEur(Number(p.predicted_fine_max))}</span>
                <button onClick={() => resolveMutation.mutate(p.id)}
                  className="flex items-center gap-1 px-2 py-1 bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 rounded-lg text-[9px] font-bold active:scale-95">
                  <CheckCircle2 className="w-3 h-3" />Resolve
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
