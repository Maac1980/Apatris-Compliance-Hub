import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Scale, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

const API = import.meta.env.VITE_API_URL ?? "";

interface Update { id: string; title: string; summary: string; impact_level: string; source: string; status: string; affected_workers_estimate: number; }

export function LegalTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: summary } = useQuery({
    queryKey: ["legal-summary"],
    queryFn: async () => {
      const res = await fetch(`${API}api/legal/summary`, { headers: authHeaders() });
      if (!res.ok) return { totalUnread: 0, unread: { critical: 0, high: 0 } };
      return res.json();
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["legal-updates"],
    queryFn: async () => {
      const res = await fetch(`${API}api/legal/updates`, { headers: authHeaders() });
      if (!res.ok) return { updates: [] };
      return res.json() as Promise<{ updates: Update[] }>;
    },
  });

  const ackMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${API}api/legal/updates/${id}/acknowledge`, { method: "PATCH", headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => { toast({ description: "Acknowledged" }); queryClient.invalidateQueries({ queryKey: ["legal-updates", "legal-summary"] }); },
  });

  const updates = data?.updates ?? [];

  return (
    <div className="p-4 min-h-full overflow-y-auto pb-24 bg-[#0c0c0e]">
      <div className="flex items-center gap-2 mb-3">
        <Scale className="w-5 h-5 text-[#C41E18]" />
        <h2 className="text-lg font-bold text-white">Legal Updates</h2>
      </div>

      <div className="flex gap-2 mb-4">
        <div className="flex-1 px-3 py-2 bg-slate-500/10 border border-slate-500/20 rounded-xl text-center">
          <p className="text-lg font-black text-white">{summary?.totalUnread ?? 0}</p>
          <p className="text-[9px] text-white/40 uppercase font-bold">Unread</p>
        </div>
        <div className="flex-1 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-xl text-center">
          <p className="text-lg font-black text-red-400">{summary?.unread?.critical ?? 0}</p>
          <p className="text-[9px] text-red-400/60 uppercase font-bold">Critical</p>
        </div>
        <div className="flex-1 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-center">
          <p className="text-lg font-black text-amber-400">{summary?.unread?.high ?? 0}</p>
          <p className="text-[9px] text-amber-400/60 uppercase font-bold">High</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><div className="animate-spin w-6 h-6 border-2 border-[#C41E18] border-t-transparent rounded-full" /></div>
      ) : updates.length === 0 ? (
        <div className="text-center py-16 text-white/30"><Scale className="w-10 h-10 mx-auto mb-2 opacity-30" /><p className="text-sm font-semibold">No updates</p></div>
      ) : (
        <div className="space-y-2">
          {updates.map(u => (
            <div key={u.id} className={cn("rounded-2xl border p-3.5",
              u.impact_level === "critical" ? "bg-red-500/5 border-red-500/15" :
              u.impact_level === "high" ? "bg-amber-500/5 border-amber-500/15" :
              "bg-white/[0.03] border-white/[0.06]"
            )}>
              <div className="flex items-center gap-1.5 mb-1">
                {u.impact_level === "critical" && <AlertTriangle className="w-3 h-3 text-red-400" />}
                <span className={cn("text-[9px] font-bold uppercase",
                  u.impact_level === "critical" ? "text-red-400" : u.impact_level === "high" ? "text-amber-400" : "text-blue-400"
                )}>{u.impact_level}</span>
                <span className="text-[9px] text-white/20 font-mono ml-auto">{u.source}</span>
              </div>
              <p className="text-xs font-bold text-white mb-1">{u.title}</p>
              <p className="text-[10px] text-white/40 line-clamp-2 mb-2">{u.summary}</p>
              {u.status === "unread" && (
                <button onClick={() => ackMutation.mutate(u.id)}
                  className="flex items-center gap-1 px-2 py-1 bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 rounded-lg text-[9px] font-bold active:scale-95">
                  <CheckCircle2 className="w-3 h-3" />Acknowledge
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
