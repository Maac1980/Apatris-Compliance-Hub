import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck, ChevronRight, X, CheckCircle2, Circle, PartyPopper } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

const API = import.meta.env.VITE_API_URL ?? "";

interface WorkerProgress {
  worker_id: string;
  worker_name: string;
  total_steps: number;
  completed_steps: number;
  progress: number;
}

interface Step {
  id: string;
  step_name: string;
  step_order: number;
  status: string;
  completed_at: string | null;
  required_document: string | null;
}

function progressZone(pct: number): "red" | "amber" | "green" {
  if (pct <= 40) return "red";
  if (pct <= 80) return "amber";
  return "green";
}

const ZONE_COLORS = {
  red:   { bar: "bg-red-500",     text: "text-red-400" },
  amber: { bar: "bg-amber-500",   text: "text-amber-400" },
  green: { bar: "bg-emerald-500", text: "text-emerald-400" },
};

export function OnboardingTab() {
  const { toast } = useToast();
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState("");

  const isManager = role === "Executive" || role === "LegalHead" || role === "TechOps" || role === "Coordinator";

  // All workers with progress
  const { data, isLoading } = useQuery({
    queryKey: ["onboarding-list"],
    queryFn: async () => {
      const res = await fetch(`${API}api/onboarding`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ workers: WorkerProgress[] }>;
    },
  });

  // Steps for selected worker
  const { data: stepsData, isLoading: stepsLoading } = useQuery({
    queryKey: ["onboarding-steps", selectedWorkerId],
    queryFn: async () => {
      const res = await fetch(`${API}api/onboarding/${selectedWorkerId}`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ steps: Step[]; progress: number; completed: number; total: number }>;
    },
    enabled: !!selectedWorkerId,
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ stepId, status }: { stepId: string; status: string }) => {
      const res = await fetch(`${API}api/onboarding/${selectedWorkerId}`, {
        method: "PATCH", headers: authHeaders(),
        body: JSON.stringify({ stepId, status }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["onboarding-steps", selectedWorkerId] });
      queryClient.invalidateQueries({ queryKey: ["onboarding-list"] });
      if (data.allCompleted) {
        toast({ description: "Onboarding complete! ZUS notification sent." });
      }
    },
    onError: () => { toast({ description: "Failed to update", variant: "destructive" }); },
  });

  const workers = data?.workers ?? [];

  return (
    <div className="p-4 min-h-full overflow-y-auto pb-24 bg-[#0c0c0e]">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <ClipboardCheck className="w-5 h-5 text-[#C41E18]" />
        <h2 className="text-lg font-bold text-white">Onboarding</h2>
      </div>

      {/* Worker list */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin w-6 h-6 border-2 border-[#C41E18] border-t-transparent rounded-full" />
        </div>
      ) : workers.length === 0 ? (
        <div className="text-center py-16 text-white/30">
          <ClipboardCheck className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm font-semibold">No onboarding records</p>
        </div>
      ) : (
        <div className="space-y-2">
          {workers.map(w => {
            const z = progressZone(w.progress);
            const colors = ZONE_COLORS[z];
            return (
              <button key={w.worker_id}
                onClick={() => { setSelectedWorkerId(w.worker_id); setSelectedName(w.worker_name); }}
                className="w-full bg-white/[0.03] border border-white/[0.06] rounded-2xl p-3.5 active:scale-[0.98] transition-transform text-left"
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-bold text-white truncate">{w.worker_name}</p>
                  <span className={cn("text-sm font-black font-mono", colors.text)}>{w.progress}%</span>
                </div>
                <div className="w-full h-2 bg-white/[0.06] rounded-full overflow-hidden">
                  <div className={cn("h-full rounded-full transition-all", colors.bar)} style={{ width: `${w.progress}%` }} />
                </div>
                <p className="text-[10px] text-white/30 font-mono mt-1.5">{w.completed_steps}/{w.total_steps} steps</p>
              </button>
            );
          })}
        </div>
      )}

      {/* Side panel — Step Checklist */}
      {selectedWorkerId && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-[#0c0c0e]/95 backdrop-blur-sm" onClick={() => setSelectedWorkerId(null)}>
          <div className="flex-1 overflow-y-auto pt-4 px-4 pb-24" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-base font-bold text-white">{selectedName}</h3>
                <p className="text-[11px] text-white/40">
                  {stepsData ? `${stepsData.completed}/${stepsData.total} — ${stepsData.progress}%` : "Loading..."}
                </p>
              </div>
              <button onClick={() => setSelectedWorkerId(null)} className="p-2 rounded-xl bg-white/5 active:bg-white/10">
                <X className="w-5 h-5 text-white/50" />
              </button>
            </div>

            {/* Progress bar */}
            {stepsData && (
              <>
                <div className="w-full h-2.5 bg-white/[0.06] rounded-full overflow-hidden mb-3">
                  <div className={cn("h-full rounded-full transition-all", ZONE_COLORS[progressZone(stepsData.progress)].bar)}
                    style={{ width: `${stepsData.progress}%` }} />
                </div>
                {stepsData.progress === 100 && (
                  <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl mb-3">
                    <PartyPopper className="w-4 h-4 text-emerald-400" />
                    <p className="text-[10px] font-bold text-emerald-400">Onboarding complete!</p>
                  </div>
                )}
              </>
            )}

            {stepsLoading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin w-6 h-6 border-2 border-[#C41E18] border-t-transparent rounded-full" />
              </div>
            ) : !stepsData?.steps?.length ? (
              <p className="text-center text-white/30 py-12 text-sm">No steps</p>
            ) : (
              <div className="space-y-1.5">
                {stepsData.steps.map((step: Step) => {
                  const done = step.status === "completed";
                  return (
                    <div key={step.id}
                      className={cn("flex items-start gap-3 p-3 rounded-xl border transition-all",
                        done ? "bg-emerald-500/5 border-emerald-500/15" : "bg-white/[0.02] border-white/[0.06]"
                      )}
                    >
                      <button
                        onClick={() => toggleMutation.mutate({ stepId: step.id, status: done ? "pending" : "completed" })}
                        className="mt-0.5 flex-shrink-0 active:scale-90 transition-transform"
                      >
                        {done ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                        ) : (
                          <Circle className="w-5 h-5 text-white/20" />
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-xs font-medium", done ? "text-emerald-300/70 line-through" : "text-white")}>
                          <span className="text-white/20 font-mono mr-1.5">{step.step_order}.</span>
                          {step.step_name}
                        </p>
                        {step.required_document && (
                          <p className="text-[9px] text-white/20 font-mono mt-0.5">Requires: {step.required_document}</p>
                        )}
                        {step.completed_at && (
                          <p className="text-[9px] text-emerald-600 font-mono mt-0.5">
                            Done {new Date(step.completed_at).toLocaleDateString("en-GB")}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
