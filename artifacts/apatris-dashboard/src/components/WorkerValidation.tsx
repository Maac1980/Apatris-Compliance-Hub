/**
 * WorkerValidation — cross-system consistency checker widget.
 * Shows on worker profile: runs 15 checks across all subsystems.
 */

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authHeaders, BASE } from "@/lib/api";
import {
  CheckCircle2, AlertTriangle, XOctagon, Shield, ChevronDown, ChevronUp,
  Loader2, RefreshCw, Activity,
} from "lucide-react";

interface Mismatch {
  systemA: string;
  systemB: string;
  field: string;
  valueA: string | null;
  valueB: string | null;
  severity: string;
  explanation: string;
  suggestedFix: string;
}

interface SubsystemStatus {
  name: string;
  available: boolean;
  error: string | null;
}

interface ValidationResult {
  workerId: string;
  workerName: string;
  validatedAt: string;
  overallStatus: string;
  riskLevel: string;
  confidence: number;
  requiresReview: boolean;
  mismatches: Mismatch[];
  subsystems: SubsystemStatus[];
  summary: string;
  reasoning: string[];
  suggestedFixes: string[];
  checksRun: number;
  checksPassed: number;
}

const STATUS_STYLE: Record<string, { icon: typeof CheckCircle2; color: string; bg: string; label: string }> = {
  CONSISTENT:        { icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20", label: "All Systems Consistent" },
  WARNINGS:          { icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20", label: "Warnings Found" },
  MISMATCHES:        { icon: AlertTriangle, color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20", label: "Mismatches Detected" },
  CRITICAL_MISMATCH: { icon: XOctagon, color: "text-red-400", bg: "bg-red-500/10 border-red-500/20", label: "Critical Issues" },
};

const SEVERITY_STYLE: Record<string, string> = {
  LOW: "bg-slate-700/50 text-slate-400",
  MEDIUM: "bg-amber-500/10 text-amber-400",
  HIGH: "bg-orange-500/10 text-orange-400",
  CRITICAL: "bg-red-500/10 text-red-400",
};

export function WorkerValidation({ workerId }: { workerId: string }) {
  const [expanded, setExpanded] = useState(false);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["worker-validation", workerId],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/v1/workers/${workerId}/validate`, { headers: authHeaders() });
      if (!res.ok) return null;
      return res.json() as Promise<ValidationResult>;
    },
    enabled: !!workerId,
    staleTime: 60_000,
  });

  if (isLoading) return (
    <div className="flex items-center gap-2 text-xs text-slate-500 px-3 py-2">
      <Loader2 className="w-3 h-3 animate-spin" /> Validating...
    </div>
  );

  if (!data) return null;

  const style = STATUS_STYLE[data.overallStatus] ?? STATUS_STYLE.WARNINGS;
  const Icon = style.icon;

  return (
    <div className={`rounded-lg border ${style.bg} overflow-hidden`}>
      {/* Header */}
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center justify-between px-3 py-2 text-xs">
        <div className="flex items-center gap-2">
          <Icon className={`w-3.5 h-3.5 ${style.color}`} />
          <span className={`font-bold ${style.color}`}>{style.label}</span>
          <span className="text-[10px] text-slate-500">
            {data.checksPassed}/{data.checksRun} checks
          </span>
          {data.mismatches.length > 0 && (
            <span className="text-[10px] text-slate-500">
              ({data.mismatches.filter(m => m.severity === "CRITICAL").length} critical, {data.mismatches.filter(m => m.severity === "HIGH").length} high)
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={(e) => { e.stopPropagation(); refetch(); }} className="text-slate-500 hover:text-white p-0.5" title="Re-validate">
            <RefreshCw className={`w-3 h-3 ${isFetching ? "animate-spin" : ""}`} />
          </button>
          {expanded ? <ChevronUp className="w-3 h-3 text-slate-500" /> : <ChevronDown className="w-3 h-3 text-slate-500" />}
        </div>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-slate-700/30 pt-2">
          {/* Summary */}
          <p className="text-[11px] text-slate-300 leading-relaxed">{data.summary}</p>

          {/* Confidence bar */}
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1 rounded bg-slate-700">
              <div className={`h-full rounded ${data.confidence >= 0.8 ? "bg-emerald-500" : data.confidence >= 0.5 ? "bg-amber-500" : "bg-red-500"}`}
                style={{ width: `${data.confidence * 100}%` }} />
            </div>
            <span className="text-[9px] text-slate-500 font-mono">{(data.confidence * 100).toFixed(0)}%</span>
          </div>

          {/* Subsystem availability */}
          <div className="flex flex-wrap gap-1">
            {data.subsystems.map((s, i) => (
              <span key={i} className={`text-[9px] px-1.5 py-0.5 rounded ${s.available ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
                {s.name}
              </span>
            ))}
          </div>

          {/* Mismatches */}
          {data.mismatches.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Mismatches</p>
              {data.mismatches.map((m, i) => (
                <div key={i} className={`rounded px-2 py-1.5 text-[10px] ${SEVERITY_STYLE[m.severity] ?? SEVERITY_STYLE.LOW}`}>
                  <div className="flex items-center gap-1 font-bold mb-0.5">
                    <span>[{m.severity}]</span>
                    <span>{m.systemA} vs {m.systemB}</span>
                  </div>
                  <p className="text-slate-300">{m.explanation}</p>
                  <p className="text-slate-500 mt-0.5">Fix: {m.suggestedFix}</p>
                </div>
              ))}
            </div>
          )}

          {/* Reasoning */}
          {data.reasoning.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Reasoning</p>
              {data.reasoning.map((r, i) => (
                <p key={i} className="text-[10px] text-slate-400">- {r}</p>
              ))}
            </div>
          )}

          {/* Suggested fixes */}
          {data.suggestedFixes.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Suggested Fixes</p>
              {data.suggestedFixes.map((f, i) => (
                <p key={i} className="text-[10px] text-blue-400">- {f}</p>
              ))}
            </div>
          )}

          <p className="text-[9px] text-slate-600 font-mono pt-1">
            Validated: {new Date(data.validatedAt).toLocaleTimeString("en-GB")} | Risk: {data.riskLevel}
          </p>
        </div>
      )}
    </div>
  );
}
