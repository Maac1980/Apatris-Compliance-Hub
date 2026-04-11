/**
 * LegalCopilot — contextual Q&A panel for worker legal situations.
 * Grounded in actual Apatris data. Not a general chatbot.
 */

import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { authHeaders, BASE } from "@/lib/api";
import {
  MessageSquare, Loader2, AlertTriangle, Shield, FileText, HelpCircle, Zap, Send,
} from "lucide-react";

interface CopilotResult {
  answer: string;
  reasoning: string;
  nextSteps: string[];
  riskLevel: string;
  confidence: number;
  requiresReview: boolean;
  source: string;
}

interface LegalCopilotProps {
  workerId: string;
}

const QUICK_QUESTIONS = [
  { label: "Can deploy?", question: "Can this worker be legally deployed to a site right now? What conditions apply?", icon: Shield },
  { label: "What's missing?", question: "What documents or evidence are missing for this worker's legal protection?", icon: FileText },
  { label: "Risk?", question: "What is the current legal risk for this worker and what could go wrong?", icon: AlertTriangle },
  { label: "Next steps?", question: "What are the most important next steps for this worker's legal case?", icon: Zap },
];

const RISK_COLOR: Record<string, string> = {
  LOW: "text-emerald-400", MEDIUM: "text-amber-400", HIGH: "text-orange-400", CRITICAL: "text-red-400",
};

export function LegalCopilot({ workerId }: LegalCopilotProps) {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<CopilotResult | null>(null);

  const askMutation = useMutation({
    mutationFn: async (q: string) => {
      const res = await fetch(`${BASE}api/v1/legal/copilot/ask`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ workerId, question: q }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error ?? "Failed");
      }
      return res.json() as Promise<CopilotResult>;
    },
    onSuccess: (data) => setResult(data),
  });

  const ask = (q: string) => {
    setQuestion(q);
    setResult(null);
    askMutation.mutate(q);
  };

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/50 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-700/50 flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-purple-400" />
        <span className="text-sm font-semibold text-slate-200">Legal Copilot</span>
        <span className="text-[10px] text-slate-500">Context-aware</span>
      </div>

      <div className="px-4 py-3 space-y-3">
        {/* Quick buttons */}
        <div className="flex flex-wrap gap-1.5">
          {QUICK_QUESTIONS.map(q => {
            const Icon = q.icon;
            return (
              <button
                key={q.label}
                onClick={() => ask(q.question)}
                disabled={askMutation.isPending}
                className="flex items-center gap-1 px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-[11px] text-slate-300 font-medium transition-colors disabled:opacity-50"
              >
                <Icon className="w-3 h-3" />
                {q.label}
              </button>
            );
          })}
        </div>

        {/* Custom input */}
        <div className="flex gap-2">
          <input
            type="text"
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && question.trim().length >= 3) ask(question); }}
            placeholder="Ask about this worker's legal situation..."
            className="flex-1 text-xs bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-slate-200 placeholder:text-slate-600 focus:border-purple-500 focus:outline-none"
          />
          <button
            onClick={() => ask(question)}
            disabled={askMutation.isPending || question.trim().length < 3}
            className="px-2 py-1.5 rounded bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-50 transition-colors"
          >
            {askMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Loading */}
        {askMutation.isPending && (
          <div className="flex items-center gap-2 text-xs text-purple-400 py-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Analyzing worker context...
          </div>
        )}

        {/* Error */}
        {askMutation.isError && (
          <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 rounded px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5" />
            {(askMutation.error as Error).message}
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="space-y-2">
            {/* Meta */}
            <div className="flex items-center gap-2 text-[10px]">
              <span className={`px-1.5 py-0.5 rounded font-bold ${
                result.source === "ai" ? "bg-purple-500/10 text-purple-400" : "bg-slate-700 text-slate-400"
              }`}>{result.source === "ai" ? "AI" : "Fallback"}</span>
              <span className={`font-bold ${RISK_COLOR[result.riskLevel] ?? "text-slate-400"}`}>
                {result.riskLevel} risk
              </span>
              {result.confidence > 0 && (
                <span className="text-slate-500 font-mono">{(result.confidence * 100).toFixed(0)}%</span>
              )}
            </div>

            {/* Answer */}
            <div className="rounded bg-slate-900/60 px-3 py-2.5">
              <p className="text-xs text-slate-200 leading-relaxed">{result.answer}</p>
            </div>

            {/* Reasoning */}
            {result.reasoning && (
              <div className="rounded bg-slate-900/40 px-3 py-2">
                <p className="text-[10px] text-slate-500 font-bold uppercase mb-0.5">Reasoning</p>
                <p className="text-[11px] text-slate-400 leading-relaxed">{result.reasoning}</p>
              </div>
            )}

            {/* Next steps */}
            {result.nextSteps.length > 0 && (
              <div>
                <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">Next Steps</p>
                <ul className="space-y-0.5">
                  {result.nextSteps.map((s, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-[11px] text-slate-300">
                      <span className="text-purple-400 mt-0.5">{i + 1}.</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Safety warning */}
            <div className="flex items-center gap-1.5 text-[10px] text-amber-500/70">
              <AlertTriangle className="w-3 h-3" />
              Draft for internal review only. Do not use as final legal advice.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
