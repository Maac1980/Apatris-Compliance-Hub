import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users, Brain, CheckCircle2, UserPlus, MapPin, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

const API = import.meta.env.VITE_API_URL ?? "";

interface JobRequest { id: string; role_type: string; company_name: string | null; location: string | null; workers_needed: number; status: string; match_count: string; }
interface Match { worker_id: string; worker_name: string; specialization: string | null; match_score: number; match_reasons: string[]; compliance_status: string; }

function scoreColor(s: number) { return s >= 80 ? "text-emerald-400" : s >= 60 ? "text-amber-400" : "text-red-400"; }

export function MatchingTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ["matching-requests"],
    queryFn: async () => {
      const res = await fetch(`${API}api/matching/requests`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ requests: JobRequest[] }>;
    },
  });

  const matchMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${API}api/matching/requests/${id}/match`, { method: "POST", headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: (data, id) => { setMatches(data.matches); setSelectedId(id); queryClient.invalidateQueries({ queryKey: ["matching-requests"] }); },
    onError: () => { toast({ description: "Matching failed", variant: "destructive" }); },
  });

  const assignMutation = useMutation({
    mutationFn: async ({ jobId, workerId, workerName }: { jobId: string; workerId: string; workerName: string }) => {
      const res = await fetch(`${API}api/matching/requests/${jobId}/assign`, {
        method: "PATCH", headers: authHeaders(), body: JSON.stringify({ workerId, workerName }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: (data) => { toast({ description: `${data.workerName} assigned` }); queryClient.invalidateQueries({ queryKey: ["matching-requests"] }); },
  });

  const requests = data?.requests ?? [];

  return (
    <div className="p-4 min-h-full overflow-y-auto pb-24 bg-[#0c0c0e]">
      <div className="flex items-center gap-2 mb-4">
        <Users className="w-5 h-5 text-[#C41E18]" />
        <h2 className="text-lg font-bold text-white">Worker Matching</h2>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><div className="animate-spin w-6 h-6 border-2 border-[#C41E18] border-t-transparent rounded-full" /></div>
      ) : requests.length === 0 ? (
        <div className="text-center py-16 text-white/30"><Users className="w-10 h-10 mx-auto mb-2 opacity-30" /><p className="text-sm font-semibold">No job requests</p></div>
      ) : (
        <div className="space-y-2">
          {requests.map(jr => (
            <div key={jr.id} className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-3.5">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-sm font-bold text-white">{jr.role_type}</p>
                <span className={cn("px-2 py-0.5 rounded-full text-[9px] font-bold",
                  jr.status === "filled" ? "text-emerald-400 bg-emerald-500/10" : jr.status === "matched" ? "text-amber-400 bg-amber-500/10" : "text-blue-400 bg-blue-500/10"
                )}>{jr.status.toUpperCase()}</span>
              </div>
              <p className="text-[10px] text-white/40">{jr.company_name || ""} {jr.location ? `· ${jr.location}` : ""} · {jr.workers_needed} needed · {jr.match_count} matches</p>
              <button onClick={() => matchMutation.mutate(jr.id)} disabled={matchMutation.isPending}
                className="mt-2 flex items-center gap-1 px-2.5 py-1.5 bg-indigo-500/15 text-indigo-400 border border-indigo-500/25 rounded-xl text-[11px] font-bold active:scale-95 disabled:opacity-50">
                {matchMutation.isPending ? <div className="animate-spin w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full" /> : <Brain className="w-3 h-3" />}
                AI Match
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Match results */}
      {selectedId && matches.length > 0 && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-[#0c0c0e]/95 backdrop-blur-sm" onClick={() => { setSelectedId(null); setMatches([]); }}>
          <div className="flex-1 overflow-y-auto pt-4 px-4 pb-24" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-white">Top {matches.length} Matches</h3>
              <button onClick={() => { setSelectedId(null); setMatches([]); }} className="p-2 rounded-xl bg-white/5 text-white/50">✕</button>
            </div>
            <div className="space-y-3">
              {matches.map((m, i) => (
                <div key={m.worker_id} className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-black text-white">{i + 1}</span>
                      <div>
                        <p className="text-xs font-bold text-white">{m.worker_name}</p>
                        <p className="text-[9px] text-white/40">{m.specialization || "—"}</p>
                      </div>
                    </div>
                    <span className={cn("text-xl font-black font-mono", scoreColor(m.match_score))}>{m.match_score}</span>
                  </div>
                  {m.match_reasons.length > 0 && (
                    <ul className="space-y-0.5 mb-2">
                      {m.match_reasons.slice(0, 3).map((r, j) => (
                        <li key={j} className="flex items-start gap-1.5 text-[9px] text-white/40"><CheckCircle2 className="w-2.5 h-2.5 text-emerald-500 mt-0.5 flex-shrink-0" />{r}</li>
                      ))}
                    </ul>
                  )}
                  <button onClick={() => assignMutation.mutate({ jobId: selectedId!, workerId: m.worker_id, workerName: m.worker_name })}
                    disabled={assignMutation.isPending}
                    className="w-full flex items-center justify-center gap-1.5 py-2 bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 rounded-xl text-[10px] font-bold active:scale-95 disabled:opacity-50">
                    <UserPlus className="w-3 h-3" />Assign
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
