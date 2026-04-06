/**
 * LegalExplainPanel — minimal internal panel for AI-generated legal explanations.
 * Generates internal and worker-safe explanation drafts from existing legal truth.
 */

import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { authHeaders, BASE } from "@/lib/api";
import { Brain, Loader2, AlertTriangle, CheckCircle2, Eye, Users } from "lucide-react";
import { ApprovalBadge, UnapprovedWarning } from "@/components/ApprovalBadge";

interface ExplanationResult {
  audience: string;
  explanation: string;
  nextSteps: string[];
  confidence: number;
  reviewRequired: boolean;
  requestId: string;
  responseId: string;
  source: string;
}

interface LegalExplainPanelProps {
  workerId: string;
}

export function LegalExplainPanel({ workerId }: LegalExplainPanelProps) {
  const [audience, setAudience] = useState<"internal" | "worker">("internal");
  const [result, setResult] = useState<ExplanationResult | null>(null);

  const explainMutation = useMutation({
    mutationFn: async (aud: "internal" | "worker") => {
      const res = await fetch(`${BASE}/api/v1/legal/explain`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ workerId, audience: aud }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error ?? "Failed to generate explanation");
      }
      return res.json() as Promise<ExplanationResult>;
    },
    onSuccess: (data) => setResult(data),
  });

  const generate = (aud: "internal" | "worker") => {
    setAudience(aud);
    setResult(null);
    explainMutation.mutate(aud);
  };

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/50 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-700/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-indigo-400" />
          <span className="text-sm font-semibold text-slate-200">AI Legal Explanation</span>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => generate("internal")}
            disabled={explainMutation.isPending}
            className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-bold transition-colors ${
              audience === "internal" && result ? "bg-indigo-600/20 text-indigo-400 border border-indigo-500/30" : "bg-slate-700 text-slate-300 hover:bg-slate-600"
            } disabled:opacity-50`}
          >
            <Eye className="w-3 h-3" />
            Internal
          </button>
          <button
            onClick={() => generate("worker")}
            disabled={explainMutation.isPending}
            className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-bold transition-colors ${
              audience === "worker" && result ? "bg-blue-600/20 text-blue-400 border border-blue-500/30" : "bg-slate-700 text-slate-300 hover:bg-slate-600"
            } disabled:opacity-50`}
          >
            <Users className="w-3 h-3" />
            Worker Draft
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-3">
        {explainMutation.isPending ? (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            Generating {audience} explanation...
          </div>
        ) : explainMutation.isError ? (
          <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            {(explainMutation.error as Error).message}
          </div>
        ) : result ? (
          <div className="space-y-3">
            {/* Meta row */}
            <div className="flex items-center gap-2 text-[11px]">
              <span className={`px-2 py-0.5 rounded font-bold ${
                result.audience === "internal" ? "bg-indigo-500/10 text-indigo-400" : "bg-blue-500/10 text-blue-400"
              }`}>
                {result.audience === "internal" ? "Internal" : "Worker Draft"}
              </span>
              <span className={`px-2 py-0.5 rounded font-bold ${
                result.source === "ai" ? "bg-purple-500/10 text-purple-400" : "bg-slate-700 text-slate-400"
              }`}>
                {result.source === "ai" ? "AI Generated" : "Fallback"}
              </span>
              {result.confidence > 0 && (
                <span className="text-slate-500 font-mono">
                  Confidence: {(result.confidence * 100).toFixed(0)}%
                </span>
              )}
              {result.reviewRequired ? (
                <span className="flex items-center gap-1 text-amber-400">
                  <AlertTriangle className="w-3 h-3" /> Review required
                </span>
              ) : (
                <span className="flex items-center gap-1 text-emerald-400">
                  <CheckCircle2 className="w-3 h-3" /> Ready
                </span>
              )}
            </div>

            {/* Explanation text */}
            <div className="rounded bg-slate-900/60 px-3 py-2.5">
              <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">{result.explanation}</p>
            </div>

            {/* Next steps */}
            {result.nextSteps.length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Next Steps</p>
                <ul className="space-y-0.5">
                  {result.nextSteps.map((s, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-[11px] text-slate-300">
                      <span className="text-slate-400 mt-0.5">{i + 1}.</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Approval badge for AI responses */}
            <ApprovalBadge
              entityType="ai_response"
              entityId={result.responseId}
              isApproved={false}
              size="sm"
            />

            {result.audience === "worker" && (
              <UnapprovedWarning />
            )}
          </div>
        ) : (
          <p className="text-xs text-slate-500 py-4 text-center">
            Click "Internal" or "Worker Draft" to generate an AI explanation based on this worker's legal snapshot.
          </p>
        )}
      </div>
    </div>
  );
}
