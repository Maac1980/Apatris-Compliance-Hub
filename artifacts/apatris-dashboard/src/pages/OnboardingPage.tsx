import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { authHeaders, BASE } from "@/lib/api";
import {
  ClipboardCheck, X, Search, UserPlus, CheckCircle2, Circle, ChevronRight, AlertTriangle, PartyPopper,
} from "lucide-react";


interface WorkerProgress {
  worker_id: string;
  worker_name: string;
  total_steps: number;
  completed_steps: number;
  progress: number;
}

interface Step {
  id: string;
  worker_id: string;
  worker_name: string;
  step_name: string;
  step_order: number;
  status: string;
  due_date: string | null;
  completed_at: string | null;
  notes: string | null;
  required_document: string | null;
}

function progressZone(pct: number): "red" | "amber" | "green" {
  if (pct <= 40) return "red";
  if (pct <= 80) return "amber";
  return "green";
}

const ZONE_COLORS = {
  red:   { bar: "bg-red-500",     text: "text-red-400",     bg: "bg-red-500/10" },
  amber: { bar: "bg-amber-500",   text: "text-amber-400",   bg: "bg-amber-500/10" },
  green: { bar: "bg-emerald-500", text: "text-emerald-400", bg: "bg-emerald-500/10" },
};

export default function OnboardingPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
  const [selectedWorkerName, setSelectedWorkerName] = useState("");
  const [showInitDialog, setShowInitDialog] = useState(false);
  const [initWorkerId, setInitWorkerId] = useState("");
  const [initWorkerName, setInitWorkerName] = useState("");

  // All workers with progress
  const { data, isLoading } = useQuery({
    queryKey: ["onboarding-list"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/onboarding`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ workers: WorkerProgress[] }>;
    },
  });

  // Steps for selected worker
  const { data: stepsData, isLoading: stepsLoading } = useQuery({
    queryKey: ["onboarding-steps", selectedWorkerId],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/onboarding/${selectedWorkerId}`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ steps: Step[]; progress: number; completed: number; total: number }>;
    },
    enabled: !!selectedWorkerId,
  });

  // Initialize onboarding
  const initMutation = useMutation({
    mutationFn: async (body: { workerId: string; workerName: string }) => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/onboarding`, {
        method: "POST", headers: authHeaders(), body: JSON.stringify(body),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Failed"); }
      return res.json();
    },
    onSuccess: () => {
      toast({ description: "Onboarding initialized" });
      queryClient.invalidateQueries({ queryKey: ["onboarding-list"] });
      setShowInitDialog(false);
      setInitWorkerId("");
      setInitWorkerName("");
    },
    onError: (err) => { toast({ description: err instanceof Error ? err.message : "Failed", variant: "destructive" }); },
  });

  // Toggle step
  const toggleMutation = useMutation({
    mutationFn: async ({ stepId, status }: { stepId: string; status: string }) => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/onboarding/${selectedWorkerId}`, {
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
        toast({ description: "Onboarding 100% complete! ZUS registration notification sent." });
      }
    },
    onError: () => { toast({ description: "Failed to update step", variant: "destructive" }); },
  });

  const workers = data?.workers ?? [];
  const filtered = useMemo(() => {
    if (!search) return workers;
    const q = search.toLowerCase();
    return workers.filter(w => w.worker_name.toLowerCase().includes(q));
  }, [workers, search]);

  const summary = useMemo(() => {
    const s = { total: workers.length, red: 0, amber: 0, green: 0, complete: 0 };
    for (const w of workers) {
      const z = progressZone(w.progress);
      s[z]++;
      if (w.progress === 100) s.complete++;
    }
    return s;
  }, [workers]);

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <ClipboardCheck className="w-7 h-7 text-[#C41E18]" />
          <h1 className="text-3xl font-bold text-white">Worker Onboarding</h1>
        </div>
        <p className="text-gray-400">Track onboarding progress for all workers — 10-step checklist</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {[
          { label: "Total", value: summary.total, color: "text-white", bg: "bg-slate-800" },
          { label: "RED (0-40%)", value: summary.red, color: "text-red-400", bg: "bg-red-500/10 border border-red-500/20" },
          { label: "AMBER (41-80%)", value: summary.amber, color: "text-amber-400", bg: "bg-amber-500/10 border border-amber-500/20" },
          { label: "GREEN (81-100%)", value: summary.green, color: "text-emerald-400", bg: "bg-emerald-500/10 border border-emerald-500/20" },
          { label: "Complete", value: summary.complete, color: "text-emerald-300", bg: "bg-emerald-900/20 border border-emerald-800/30" },
        ].map(c => (
          <div key={c.label} className={`rounded-xl p-4 ${c.bg}`}>
            <p className="text-xs text-gray-400 font-mono uppercase mb-1">{c.label}</p>
            <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Search + Init button */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text" placeholder="Search workers..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C41E18]"
          />
        </div>
        <button
          onClick={() => setShowInitDialog(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[#C41E18] text-white rounded-lg text-sm font-bold hover:bg-[#a51914] transition-colors"
        >
          <UserPlus className="w-4 h-4" />
          Start Onboarding
        </button>
      </div>

      {/* Init dialog */}
      {showInitDialog && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/50" onClick={() => setShowInitDialog(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-4">Initialize Onboarding</h3>
            <div className="space-y-3">
              <input
                placeholder="Worker ID (UUID)" value={initWorkerId} onChange={e => setInitWorkerId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C41E18]"
              />
              <input
                placeholder="Worker Name" value={initWorkerName} onChange={e => setInitWorkerName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C41E18]"
              />
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowInitDialog(false)} className="flex-1 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg text-sm font-bold hover:bg-slate-700">Cancel</button>
              <button
                onClick={() => initMutation.mutate({ workerId: initWorkerId, workerName: initWorkerName })}
                disabled={!initWorkerId || !initWorkerName || initMutation.isPending}
                className="flex-1 px-4 py-2 bg-[#C41E18] text-white rounded-lg text-sm font-bold hover:bg-[#a51914] disabled:opacity-50"
              >
                {initMutation.isPending ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Worker list */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin w-8 h-8 border-2 border-[#C41E18] border-t-transparent rounded-full" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-slate-500">
          <ClipboardCheck className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-semibold">No onboarding records</p>
          <p className="text-sm mt-1">Click "Start Onboarding" to initialize a worker's checklist</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(w => {
            const zone = progressZone(w.progress);
            const colors = ZONE_COLORS[zone];
            return (
              <button
                key={w.worker_id}
                onClick={() => { setSelectedWorkerId(w.worker_id); setSelectedWorkerName(w.worker_name); }}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 flex items-center gap-4 hover:bg-slate-800/60 cursor-pointer transition-colors text-left"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <p className="text-sm font-bold text-white truncate">{w.worker_name}</p>
                    <span className={`text-xs font-bold font-mono ${colors.text}`}>
                      {w.completed_steps}/{w.total_steps}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${colors.bar}`}
                      style={{ width: `${w.progress}%` }}
                    />
                  </div>
                </div>
                <span className={`text-lg font-black font-mono ${colors.text}`}>{w.progress}%</span>
                <ChevronRight className="w-5 h-5 text-slate-600 flex-shrink-0" />
              </button>
            );
          })}
        </div>
      )}

      {/* Side Panel — Step Checklist */}
      {selectedWorkerId && (
        <div className="fixed inset-0 z-[250] flex justify-end" onClick={() => setSelectedWorkerId(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="relative w-full max-w-lg bg-slate-900 border-l border-slate-700 h-full overflow-y-auto shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-slate-900 border-b border-slate-700 px-6 py-4 flex items-center justify-between z-10">
              <div>
                <h2 className="text-lg font-bold text-white">{selectedWorkerName}</h2>
                <p className="text-xs text-slate-400">
                  {stepsData ? `${stepsData.completed}/${stepsData.total} steps — ${stepsData.progress}%` : "Loading..."}
                </p>
              </div>
              <button onClick={() => setSelectedWorkerId(null)} className="p-2 hover:bg-slate-800 rounded-lg transition-colors">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            {/* Progress bar */}
            {stepsData && (
              <div className="px-6 pt-4">
                <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${ZONE_COLORS[progressZone(stepsData.progress)].bar}`}
                    style={{ width: `${stepsData.progress}%` }}
                  />
                </div>
                {stepsData.progress === 100 && (
                  <div className="flex items-center gap-2 mt-3 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                    <PartyPopper className="w-4 h-4 text-emerald-400" />
                    <p className="text-xs font-bold text-emerald-400">Onboarding complete! ZUS registration triggered.</p>
                  </div>
                )}
              </div>
            )}

            <div className="p-6 space-y-2">
              {stepsLoading ? (
                <div className="flex justify-center py-10">
                  <div className="animate-spin w-6 h-6 border-2 border-[#C41E18] border-t-transparent rounded-full" />
                </div>
              ) : !stepsData?.steps?.length ? (
                <p className="text-slate-500 text-center py-10">No steps found</p>
              ) : (
                stepsData.steps.map((step: Step) => {
                  const isComplete = step.status === "completed";
                  return (
                    <div
                      key={step.id}
                      className={`flex items-start gap-3 p-3 rounded-xl border transition-all ${
                        isComplete
                          ? "bg-emerald-500/5 border-emerald-500/20"
                          : "bg-slate-800/50 border-slate-700"
                      }`}
                    >
                      <button
                        onClick={() => toggleMutation.mutate({
                          stepId: step.id,
                          status: isComplete ? "pending" : "completed",
                        })}
                        className="mt-0.5 flex-shrink-0"
                      >
                        {isComplete ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                        ) : (
                          <Circle className="w-5 h-5 text-slate-600 hover:text-slate-400 transition-colors" />
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${isComplete ? "text-emerald-300 line-through" : "text-white"}`}>
                          <span className="text-slate-500 font-mono text-xs mr-2">{step.step_order}.</span>
                          {step.step_name}
                        </p>
                        {step.required_document && (
                          <p className="text-[10px] text-slate-500 mt-0.5 font-mono">
                            Requires: {step.required_document}
                          </p>
                        )}
                        {step.completed_at && (
                          <p className="text-[10px] text-emerald-600 mt-0.5 font-mono">
                            Completed {new Date(step.completed_at).toLocaleDateString("en-GB")}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
