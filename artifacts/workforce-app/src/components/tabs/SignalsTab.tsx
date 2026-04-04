import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Radio, CheckCircle2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

const API = import.meta.env.VITE_API_URL ?? "";

interface Signal { id: string; signal_type: string; country: string; signal_strength: string; description: string; recommended_action: string; }

export function SignalsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: summary } = useQuery({
    queryKey: ["signals-summary"],
    queryFn: async () => { const r = await fetch(`${API}api/signals/summary`, { headers: authHeaders() }); if (!r.ok) return { total: 0, critical: 0 }; return r.json(); },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["signals"],
    queryFn: async () => { const r = await fetch(`${API}api/signals`, { headers: authHeaders() }); if (!r.ok) return { signals: [] }; return r.json() as Promise<{ signals: Signal[] }>; },
  });

  const ackMutation = useMutation({
    mutationFn: async (id: string) => { const r = await fetch(`${API}api/signals/${id}/acknowledge`, { method: "PATCH", headers: authHeaders() }); if (!r.ok) throw new Error("Failed"); return r.json(); },
    onSuccess: () => { toast({ description: "Acknowledged" }); queryClient.invalidateQueries({ queryKey: ["signals", "signals-summary"] }); },
  });

  const signals = data?.signals ?? [];

  return (
    <div className="p-4 min-h-full overflow-y-auto pb-24 bg-[#0c0c0e]">
      <div className="flex items-center gap-2 mb-3"><Radio className="w-5 h-5 text-[#C41E18]" /><h2 className="text-lg font-bold text-white">Signals</h2></div>

      <div className="flex gap-2 mb-4">
        <div className="flex-1 px-3 py-2 bg-slate-500/10 border border-slate-500/20 rounded-xl text-center">
          <p className="text-lg font-black text-white">{summary?.total ?? 0}</p>
          <p className="text-[9px] text-white/40 uppercase font-bold">Active</p>
        </div>
        <div className="flex-1 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-xl text-center">
          <p className="text-lg font-black text-red-400">{summary?.critical ?? 0}</p>
          <p className="text-[9px] text-red-400/60 uppercase font-bold">Critical</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><div className="animate-spin w-6 h-6 border-2 border-[#C41E18] border-t-transparent rounded-full" /></div>
      ) : signals.length === 0 ? (
        <div className="text-center py-16 text-white/30"><Radio className="w-10 h-10 mx-auto mb-2 opacity-30" /><p className="text-sm font-semibold">No signals</p></div>
      ) : (
        <div className="space-y-2">
          {signals.map(s => (
            <div key={s.id} className={cn("rounded-2xl border p-3.5",
              s.signal_strength === "critical" ? "bg-red-500/5 border-red-500/15" :
              s.signal_strength === "high" ? "bg-amber-500/5 border-amber-500/15" :
              "bg-white/[0.03] border-white/[0.06]"
            )}>
              <div className="flex items-center gap-1.5 mb-1">
                {s.signal_strength === "critical" && <AlertTriangle className="w-3 h-3 text-red-400" />}
                <span className={cn("text-[9px] font-bold uppercase", s.signal_strength === "critical" ? "text-red-400" : s.signal_strength === "high" ? "text-amber-400" : "text-blue-400")}>{s.signal_strength}</span>
                <span className="text-[9px] text-white/20 font-mono ml-auto">{s.country} · {s.signal_type.replace("_", " ")}</span>
              </div>
              <p className="text-[10px] text-white/60 line-clamp-2 mb-1">{s.description}</p>
              {s.recommended_action && <p className="text-[9px] text-emerald-400/60 italic mb-2">{s.recommended_action}</p>}
              <button onClick={() => ackMutation.mutate(s.id)}
                className="flex items-center gap-1 px-2 py-1 bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 rounded-lg text-[9px] font-bold active:scale-95">
                <CheckCircle2 className="w-3 h-3" />ACK
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
