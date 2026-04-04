import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ShieldAlert, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

const API = import.meta.env.VITE_API_URL ?? "";
const TYPE_LABELS: Record<string, string> = { ghost_worker: "Ghost Worker", duplicate_document: "Dup Document", payroll_anomaly: "Payroll Spike", duplicate_bank: "Dup Bank", advance_abuse: "Advance Abuse" };

interface Alert { id: string; alert_type: string; severity: string; description: string; worker_name: string | null; }

export function FraudTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: summary } = useQuery({
    queryKey: ["fraud-summary"],
    queryFn: async () => { const r = await fetch(`${API}api/fraud/summary`, { headers: authHeaders() }); if (!r.ok) return { totalActive: 0, critical: 0, resolved: 0 }; return r.json(); },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["fraud-alerts"],
    queryFn: async () => { const r = await fetch(`${API}api/fraud/alerts`, { headers: authHeaders() }); if (!r.ok) return { alerts: [] }; return r.json() as Promise<{ alerts: Alert[] }>; },
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ id, resolution }: { id: string; resolution: string }) => { const r = await fetch(`${API}api/fraud/alerts/${id}/resolve`, { method: "PATCH", headers: authHeaders(), body: JSON.stringify({ resolution }) }); if (!r.ok) throw new Error("Failed"); return r.json(); },
    onSuccess: () => { toast({ description: "Resolved" }); queryClient.invalidateQueries({ queryKey: ["fraud-alerts", "fraud-summary"] }); },
  });

  const alerts = data?.alerts ?? [];

  return (
    <div className="p-4 min-h-full overflow-y-auto pb-24 bg-[#0c0c0e]">
      <div className="flex items-center gap-2 mb-3">
        <ShieldAlert className="w-5 h-5 text-[#C41E18]" />
        <h2 className="text-lg font-bold text-white">Fraud Detection</h2>
      </div>

      <div className="flex gap-2 mb-4">
        <div className="flex-1 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-xl text-center">
          <p className="text-lg font-black text-red-400">{summary?.critical ?? 0}</p>
          <p className="text-[9px] text-red-400/60 uppercase font-bold">Critical</p>
        </div>
        <div className="flex-1 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-center">
          <p className="text-lg font-black text-amber-400">{summary?.totalActive ?? 0}</p>
          <p className="text-[9px] text-amber-400/60 uppercase font-bold">Active</p>
        </div>
        <div className="flex-1 px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-center">
          <p className="text-lg font-black text-emerald-400">{summary?.resolved ?? 0}</p>
          <p className="text-[9px] text-emerald-400/60 uppercase font-bold">Resolved</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><div className="animate-spin w-6 h-6 border-2 border-[#C41E18] border-t-transparent rounded-full" /></div>
      ) : alerts.length === 0 ? (
        <div className="text-center py-16 text-white/30"><ShieldAlert className="w-10 h-10 mx-auto mb-2 opacity-30" /><p className="text-sm font-semibold">No fraud alerts</p></div>
      ) : (
        <div className="space-y-2">
          {alerts.map(a => (
            <div key={a.id} className={cn("rounded-2xl border p-3.5",
              a.severity === "critical" ? "bg-red-500/5 border-red-500/15" : a.severity === "high" ? "bg-amber-500/5 border-amber-500/15" : "bg-white/[0.03] border-white/[0.06]"
            )}>
              <div className="flex items-center gap-1.5 mb-1">
                {a.severity === "critical" && <AlertTriangle className="w-3 h-3 text-red-400" />}
                <span className={cn("text-[9px] font-bold uppercase", a.severity === "critical" ? "text-red-400" : a.severity === "high" ? "text-amber-400" : "text-blue-400")}>{a.severity}</span>
                <span className="text-[9px] text-white/20 font-mono ml-auto">{TYPE_LABELS[a.alert_type] || a.alert_type}</span>
              </div>
              <p className="text-[10px] text-white/60 line-clamp-2">{a.description}</p>
              <div className="flex gap-2 mt-2">
                <button onClick={() => resolveMutation.mutate({ id: a.id, resolution: "false_positive" })}
                  className="px-2 py-1 bg-white/5 text-white/40 rounded text-[9px] font-bold active:scale-95">False +</button>
                <button onClick={() => resolveMutation.mutate({ id: a.id, resolution: "confirmed_fraud" })}
                  className="px-2 py-1 bg-red-500/15 text-red-400 rounded text-[9px] font-bold active:scale-95">Confirm</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
