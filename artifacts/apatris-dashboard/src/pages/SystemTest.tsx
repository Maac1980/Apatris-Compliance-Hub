/**
 * System Test Panel — one-click full diagnostic.
 */

import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { authHeaders, BASE } from "@/lib/api";
import {
  Activity, CheckCircle2, XOctagon, AlertTriangle, Loader2, RefreshCw,
} from "lucide-react";

interface Check {
  name: string;
  status: "PASS" | "FAIL" | "WARN";
  detail: string;
  ms: number;
}

interface TestResult {
  summary: { total: number; passed: number; failed: number; warned: number; totalMs: number; overall: string; testedAt: string };
  checks: Check[];
}

export default function SystemTest() {
  const [result, setResult] = useState<TestResult | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}api/v1/system/test`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Test failed");
      return res.json() as Promise<TestResult>;
    },
    onSuccess: (data) => setResult(data),
  });

  const s = result?.summary;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 overflow-y-auto pb-20">
      <div className="border-b border-slate-800 bg-slate-900/50 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-700/50 border border-slate-600 flex items-center justify-center">
              <Activity className="w-5 h-5 text-slate-300" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">System Test Panel</h1>
              <p className="text-xs text-slate-500 font-mono uppercase tracking-widest mt-1">Full Diagnostic · All Subsystems</p>
            </div>
          </div>
          <button onClick={() => mutation.mutate()} disabled={mutation.isPending}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold transition-colors">
            {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {mutation.isPending ? "Running tests..." : "Run All Tests"}
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">
        {/* Summary */}
        {s && (
          <div className={`rounded-xl border p-5 ${s.failed === 0 ? "bg-emerald-500/5 border-emerald-500/20" : "bg-red-500/5 border-red-500/20"}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {s.failed === 0 ? <CheckCircle2 className="w-8 h-8 text-emerald-400" /> : <XOctagon className="w-8 h-8 text-red-400" />}
                <div>
                  <p className={`text-xl font-black ${s.failed === 0 ? "text-emerald-400" : "text-red-400"}`}>{s.overall}</p>
                  <p className="text-xs text-slate-400">{s.passed}/{s.total} checks passed · {s.totalMs}ms total</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500">{new Date(s.testedAt).toLocaleTimeString("en-GB")}</p>
                <div className="flex gap-2 mt-1">
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded font-bold">{s.passed} PASS</span>
                  {s.failed > 0 && <span className="text-[10px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded font-bold">{s.failed} FAIL</span>}
                  {s.warned > 0 && <span className="text-[10px] bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded font-bold">{s.warned} WARN</span>}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Checks */}
        {result && (
          <div className="space-y-2">
            {result.checks.map((c, i) => (
              <div key={i} className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${
                c.status === "PASS" ? "bg-slate-900/50 border-slate-800" :
                c.status === "FAIL" ? "bg-red-500/5 border-red-500/20" :
                "bg-amber-500/5 border-amber-500/20"
              }`}>
                <div className="flex-shrink-0">
                  {c.status === "PASS" ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> :
                   c.status === "FAIL" ? <XOctagon className="w-5 h-5 text-red-400" /> :
                   <AlertTriangle className="w-5 h-5 text-amber-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">{c.name}</span>
                    <span className="text-[9px] font-mono text-slate-500">{c.ms}ms</span>
                  </div>
                  <p className={`text-xs mt-0.5 ${c.status === "FAIL" ? "text-red-400" : "text-slate-400"}`}>{c.detail}</p>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded flex-shrink-0 ${
                  c.status === "PASS" ? "bg-emerald-500/20 text-emerald-400" :
                  c.status === "FAIL" ? "bg-red-500/20 text-red-400" :
                  "bg-amber-500/20 text-amber-400"
                }`}>{c.status}</span>
              </div>
            ))}
          </div>
        )}

        {!result && !mutation.isPending && (
          <div className="text-center py-20 text-slate-600">
            <Activity className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-lg font-semibold">Click "Run All Tests" to check every subsystem</p>
            <p className="text-sm mt-1">Database, AI providers, storage, compliance, routes — full diagnostic</p>
          </div>
        )}
      </div>
    </div>
  );
}
