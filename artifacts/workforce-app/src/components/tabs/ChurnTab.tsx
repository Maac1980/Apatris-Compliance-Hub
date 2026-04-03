import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UserMinus, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

const API = import.meta.env.VITE_API_URL ?? "";

interface Prediction { id: string; worker_name: string; churn_probability: number; risk_level: string; signals: any; recommended_action: string; }

export function ChurnTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: summary } = useQuery({
    queryKey: ["churn-summary"],
    queryFn: async () => {
      const res = await fetch(`${API}api/churn/summary`, { headers: authHeaders() });
      if (!res.ok) return { critical: 0, high: 0, total: 0 };
      return res.json();
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["churn-predictions"],
    queryFn: async () => {
      const res = await fetch(`${API}api/churn/predictions`, { headers: authHeaders() });
      if (!res.ok) return { predictions: [] };
      return res.json() as Promise<{ predictions: Prediction[] }>;
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${API}api/churn/predictions/${id}/resolve`, { method: "PATCH", headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => { toast({ description: "Resolved" }); queryClient.invalidateQueries({ queryKey: ["churn-predictions", "churn-summary"] }); },
  });

  const predictions = data?.predictions ?? [];

  return (
    <div className="p-4 min-h-full overflow-y-auto pb-24 bg-[#0c0c0e]">
      <div className="flex items-center gap-2 mb-3">
        <UserMinus className="w-5 h-5 text-[#C41E18]" />
        <h2 className="text-lg font-bold text-white">Churn Risk</h2>
      </div>

      <div className="flex gap-2 mb-4">
        <div className="flex-1 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-xl text-center">
          <p className="text-lg font-black text-red-400">{summary?.critical ?? 0}</p>
          <p className="text-[9px] text-red-400/60 uppercase font-bold">Critical</p>
        </div>
        <div className="flex-1 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-center">
          <p className="text-lg font-black text-amber-400">{summary?.high ?? 0}</p>
          <p className="text-[9px] text-amber-400/60 uppercase font-bold">High</p>
        </div>
        <div className="flex-1 px-3 py-2 bg-slate-500/10 border border-slate-500/20 rounded-xl text-center">
          <p className="text-lg font-black text-white">{summary?.total ?? 0}</p>
          <p className="text-[9px] text-white/40 uppercase font-bold">Total</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><div className="animate-spin w-6 h-6 border-2 border-[#C41E18] border-t-transparent rounded-full" /></div>
      ) : predictions.length === 0 ? (
        <div className="text-center py-16 text-white/30"><UserMinus className="w-10 h-10 mx-auto mb-2 opacity-30" /><p className="text-sm font-semibold">No churn risks</p></div>
      ) : (
        <div className="space-y-2">
          {predictions.map(p => {
            const sigs = typeof p.signals === "string" ? JSON.parse(p.signals) : (p.signals || []);
            return (
              <div key={p.id} className={cn("rounded-2xl border p-3.5",
                p.risk_level === "critical" ? "bg-red-500/5 border-red-500/15" :
                p.risk_level === "high" ? "bg-amber-500/5 border-amber-500/15" :
                "bg-white/[0.03] border-white/[0.06]"
              )}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    {p.risk_level === "critical" && <AlertTriangle className="w-3 h-3 text-red-400" />}
                    <p className="text-xs font-bold text-white">{p.worker_name}</p>
                  </div>
                  <span className={cn("text-xs font-black font-mono",
                    p.risk_level === "critical" ? "text-red-400" : p.risk_level === "high" ? "text-amber-400" : "text-blue-400"
                  )}>{p.churn_probability}%</span>
                </div>
                {sigs.slice(0, 2).map((sig: any, i: number) => (
                  <p key={i} className="text-[9px] text-white/40 flex items-center gap-1"><AlertTriangle className="w-2 h-2 text-amber-500" />{sig.detail}</p>
                ))}
                <p className="text-[9px] text-white/30 mt-1 italic">{p.recommended_action}</p>
                <button onClick={() => resolveMutation.mutate(p.id)}
                  className="mt-2 flex items-center gap-1 px-2 py-1 bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 rounded-lg text-[9px] font-bold active:scale-95">
                  <CheckCircle2 className="w-3 h-3" />Resolve
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
