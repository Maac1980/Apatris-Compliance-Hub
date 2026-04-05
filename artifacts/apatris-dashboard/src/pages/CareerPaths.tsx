import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { GraduationCap, ChevronRight, X, Play, TrendingUp } from "lucide-react";
import { authHeaders, BASE } from "@/lib/api";


interface CareerPath { id: string; worker_id: string; worker_name: string; current_role: string; recommended_next_cert: string; estimated_salary_increase: string; time_to_achieve: string; steps: any; progress: number; }

export default function CareerPaths() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["career-paths"],
    queryFn: async () => { const r = await fetch(`${import.meta.env.BASE_URL}api/careers/paths`, { headers: authHeaders() }); if (!r.ok) throw new Error("Failed"); return r.json() as Promise<{ paths: CareerPath[] }>; },
  });

  const { data: workersData } = useQuery({
    queryKey: ["workers-list"],
    queryFn: async () => { const r = await fetch(`${import.meta.env.BASE_URL}api/workers`, { headers: authHeaders() }); if (!r.ok) return { workers: [] }; return r.json(); },
  });

  const genMutation = useMutation({
    mutationFn: async (workerId: string) => { const r = await fetch(`${import.meta.env.BASE_URL}api/careers/generate/${workerId}`, { method: "POST", headers: authHeaders() }); if (!r.ok) throw new Error("Failed"); return r.json(); },
    onSuccess: () => { toast({ description: "Career path generated" }); queryClient.invalidateQueries({ queryKey: ["career-paths"] }); },
  });

  const paths = data?.paths ?? [];
  const selected = paths.find(p => p.worker_id === selectedId);
  const _steps = selected ? (typeof selected.steps === "string" ? (() => { try { return JSON.parse(selected.steps); } catch { return []; } })() : selected.steps) : [];
  const steps = Array.isArray(_steps) ? _steps : [];

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2"><GraduationCap className="w-7 h-7 text-[#B8860B]" /><h1 className="text-3xl font-bold text-white">Career Paths</h1></div>
        <p className="text-gray-400">AI-powered 3-step career ladders with salary projections</p>
      </div>

      {/* Quick generate for a worker */}
      <div className="flex gap-3 mb-6">
        <select id="genWorker" className="flex-1 max-w-sm px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#B8860B]">
          <option value="">Select worker to generate path</option>
          {(workersData?.workers ?? []).map((w: any) => <option key={w.id} value={w.id}>{w.fullName || w.full_name || w.name}</option>)}
        </select>
        <button onClick={() => { const el = document.getElementById("genWorker") as HTMLSelectElement; if (el.value) genMutation.mutate(el.value); }}
          disabled={genMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-[#B8860B] text-white rounded-lg text-sm font-bold hover:bg-[#996F00] disabled:opacity-50">
          {genMutation.isPending ? <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : <Play className="w-4 h-4" />}
          Generate
        </button>
      </div>

      {isLoading ? <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-[#B8860B] border-t-transparent rounded-full" /></div> : paths.length === 0 ? (
        <div className="text-center py-20 text-slate-500"><GraduationCap className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="text-lg font-semibold">No career paths yet</p></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {paths.map(p => (
            <button key={p.id} onClick={() => setSelectedId(p.worker_id === selectedId ? null : p.worker_id)}
              className="bg-slate-900 border border-slate-700 rounded-xl p-4 text-left hover:bg-slate-800/60 transition-colors">
              <div className="flex items-start justify-between mb-2">
                <div><p className="text-sm font-bold text-white">{p.worker_name}</p><p className="text-xs text-slate-400">{p.current_role}</p></div>
                <ChevronRight className="w-4 h-4 text-slate-600" />
              </div>
              <p className="text-xs text-slate-500 mb-2">Next: <span className="text-[#B8860B] font-bold">{p.recommended_next_cert}</span></p>
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-[#B8860B] font-mono">+€{Number(p.estimated_salary_increase)}/h</span>
                <span className="text-[10px] text-slate-500">{p.time_to_achieve}</span>
                <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden ml-auto max-w-[80px]">
                  <div className="h-full bg-[#B8860B] rounded-full" style={{ width: `${p.progress}%` }} />
                </div>
                <span className="text-[10px] text-slate-500">{p.progress}%</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Career ladder detail */}
      {selected && (
        <div className="fixed inset-0 z-[250] flex justify-end" onClick={() => setSelectedId(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative w-full max-w-lg bg-slate-900 border-l border-slate-700 h-full overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-slate-900 border-b border-slate-700 px-6 py-4 flex items-center justify-between z-10">
              <div><h2 className="text-lg font-bold text-white">{selected.worker_name}</h2><p className="text-xs text-slate-400">Career Ladder — {selected.current_role}</p></div>
              <button onClick={() => setSelectedId(null)} className="p-2 hover:bg-slate-800 rounded-lg"><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="p-6">
              {/* Career ladder visualization */}
              <div className="space-y-0">
                {steps.map((s: any, i: number) => (
                  <div key={i} className="relative">
                    {i > 0 && <div className="absolute left-5 -top-4 w-0.5 h-4 bg-[#B8860B]/30" />}
                    <div className={`flex items-start gap-4 p-4 rounded-xl border ${i === 0 ? "bg-emerald-500/5 border-emerald-500/15" : "bg-[#B8860B]/5 border-[#B8860B]/15"}`}>
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${i === 0 ? "bg-emerald-500/20 text-emerald-400" : "bg-[#B8860B]/20 text-[#B8860B]"}`}>
                        <span className="text-sm font-black">{s.step || i + 1}</span>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-white">{s.title}</p>
                        <p className="text-xs text-slate-400">{s.cert}</p>
                        {s.description && <p className="text-[10px] text-slate-500 mt-1">{s.description}</p>}
                        <div className="flex gap-3 mt-2 text-[10px]">
                          <span className="text-[#B8860B] font-mono font-bold">{s.rateIncrease > 0 ? `+€${s.rateIncrease}/h` : "Current"}</span>
                          {s.estimatedRate && <span className="text-slate-500">€{s.estimatedRate}/h</span>}
                          {s.estimatedMonthly && <span className="text-slate-500">€{Math.round(s.estimatedMonthly)}/mo</span>}
                          {s.timeMonths > 0 && <span className="text-slate-500">{s.timeMonths} months</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 bg-[#B8860B]/10 border border-[#B8860B]/20 rounded-xl p-4 text-center">
                <p className="text-xs text-[#B8860B]/60 uppercase tracking-wider mb-1">Total Potential Increase</p>
                <p className="text-2xl font-black text-[#B8860B]">+€{Number(selected.estimated_salary_increase)}/h</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
