/**
 * Test Scenario Engine — internal validation page.
 */

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { authHeaders, BASE } from "@/lib/api";
import {
  Loader2, CheckCircle2, XOctagon, Play, Plus, ChevronDown, ChevronUp, Activity,
} from "lucide-react";

const TYPE_COLOR: Record<string, string> = {
  REGULATORY: "bg-purple-500/20 text-purple-400",
  CASE: "bg-blue-500/20 text-blue-400",
  DOCUMENT: "bg-amber-500/20 text-amber-400",
};

export default function TestingPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<Record<string, any>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["test-scenarios"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/v1/test-scenarios`, { headers: authHeaders() });
      if (!res.ok) return { scenarios: [] };
      return res.json();
    },
  });

  const seedMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}api/v1/test-scenarios/seed`, { method: "POST", headers: authHeaders() });
      if (!res.ok) throw new Error("Seed failed");
      return res.json();
    },
    onSuccess: (d) => { toast({ description: `Seeded ${d.seeded} scenarios` }); qc.invalidateQueries({ queryKey: ["test-scenarios"] }); },
  });

  const runMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${BASE}api/v1/test-scenarios/${id}/run`, { method: "POST", headers: authHeaders() });
      if (!res.ok) throw new Error("Run failed");
      return res.json();
    },
    onSuccess: (data, id) => {
      setRunResult(prev => ({ ...prev, [id]: data }));
      toast({ description: data.match ? "PASS" : "FAIL — differences found" });
      qc.invalidateQueries({ queryKey: ["test-scenarios"] });
    },
    onError: (err) => toast({ description: (err as Error).message, variant: "destructive" }),
  });

  const scenarios = data?.scenarios ?? [];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 overflow-y-auto pb-20">
      <div className="border-b border-slate-800 bg-slate-900/50 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-700/50 border border-slate-600 flex items-center justify-center"><Activity className="w-5 h-5 text-slate-300" /></div>
            <div><h1 className="text-xl font-bold text-white tracking-tight">Test Scenarios</h1><p className="text-xs text-slate-500 font-mono uppercase tracking-widest mt-1">Internal Validation Engine</p></div>
          </div>
          {scenarios.length === 0 && (
            <button onClick={() => seedMut.mutate()} disabled={seedMut.isPending}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-bold">
              <Plus className="w-4 h-4" /> Seed 5 Scenarios
            </button>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-3">
        {isLoading ? <div className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin text-slate-500 mx-auto" /></div>
        : scenarios.length === 0 ? <div className="text-center py-12 text-slate-600"><Activity className="w-10 h-10 mx-auto mb-2 opacity-30" /><p>No scenarios. Click "Seed 5 Scenarios" to create defaults.</p></div>
        : scenarios.map((s: any) => {
          const isExpanded = expandedId === s.id;
          const result = runResult[s.id];
          const lastPass = s.last_result;

          return (
            <div key={s.id} className="rounded-xl border bg-slate-900 border-slate-800 p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : s.id)}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-white">{s.name}</span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${TYPE_COLOR[s.scenario_type] ?? ""}`}>{s.scenario_type}</span>
                    {lastPass === true && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                    {lastPass === false && <XOctagon className="w-3.5 h-3.5 text-red-400" />}
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">{s.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => runMut.mutate(s.id)} disabled={runMut.isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold">
                    {runMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />} Run
                  </button>
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                </div>
              </div>

              {isExpanded && (
                <div className="mt-3 space-y-3 border-t border-slate-800 pt-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Expected</p>
                      <pre className="text-[10px] text-emerald-400 bg-slate-950/50 rounded-lg p-2 max-h-[200px] overflow-y-auto font-mono whitespace-pre-wrap">{JSON.stringify(s.expected_output_json, null, 2)}</pre>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Actual {result ? (result.match ? "(PASS)" : "(FAIL)") : "(not run)"}</p>
                      {result ? (
                        <pre className={`text-[10px] bg-slate-950/50 rounded-lg p-2 max-h-[200px] overflow-y-auto font-mono whitespace-pre-wrap ${result.match ? "text-emerald-400" : "text-red-400"}`}>{JSON.stringify(result.actual, null, 2)}</pre>
                      ) : (
                        <p className="text-[10px] text-slate-600">Click Run to execute this scenario</p>
                      )}
                    </div>
                  </div>

                  {result?.differences?.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-red-400 uppercase mb-1">Differences ({result.differences.length})</p>
                      <div className="space-y-1">
                        {result.differences.map((d: any, i: number) => (
                          <div key={i} className="text-[10px] bg-red-500/5 border border-red-500/10 rounded px-2 py-1">
                            <span className="text-red-400 font-bold">{d.path}</span>: expected <span className="text-emerald-400">{JSON.stringify(d.expected)}</span> got <span className="text-red-400">{JSON.stringify(d.actual)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {result?.match === true && (
                    <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 rounded-lg px-3 py-2">
                      <CheckCircle2 className="w-4 h-4" /> All checks passed
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
