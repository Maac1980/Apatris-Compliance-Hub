/**
 * CopilotPanel — context-aware EEJ Copilot for worker panels.
 *
 * Uses POST /api/v1/legal/copilot/ask with workerId + question.
 * Provides quick prompts based on panel context.
 * Read-only, suggestion-only. Never changes state.
 *
 * Embeddable in WorkerProfilePanel, LegalIntelligence, etc.
 */

import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Sparkles, Send, Loader2, ChevronRight, AlertTriangle,
  Copy, Check, MessageSquare
} from "lucide-react";

type PanelContext = "compliance" | "documents" | "legal_case" | "general";

interface CopilotPanelProps {
  workerId: string;
  panelContext?: PanelContext;
  compact?: boolean;
}

interface CopilotResponse {
  answer: string;
  answerEN: string;
  reasoning: string;
  nextSteps: string[];
  nextStepsEN: string[];
  riskLevel: string;
  confidence: number;
  source: "ai" | "fallback";
  requiresReview: true;
}

const QUICK_PROMPTS: Record<PanelContext, { label: string; question: string }[]> = {
  compliance: [
    { label: "Status summary", question: "What is this worker's current compliance and legal status? Summarize in 3-4 sentences." },
    { label: "Missing documents", question: "What critical documents are missing for this worker? List them with priority." },
    { label: "Next action", question: "What is the most urgent next action for this worker and why?" },
    { label: "Risk explanation", question: "What are the current risk factors for this worker's legal situation?" },
    { label: "Deadline check", question: "What are the upcoming deadlines for this worker? Include permit, contract, medical, BHP." },
  ],
  documents: [
    { label: "Document checklist", question: "What documents does this worker need on file for full compliance? What's missing?" },
    { label: "Filing status", question: "Has this worker filed for TRC/permit renewal? What evidence is on file?" },
    { label: "PIP readiness", question: "Is this worker ready for a PIP inspection? What documents would be checked?" },
  ],
  legal_case: [
    { label: "Case summary", question: "Summarize this worker's legal case: type, status, deadlines, and required actions." },
    { label: "Appeal options", question: "What are the possible appeal grounds for this worker's case?" },
    { label: "Evidence gaps", question: "What evidence is missing that could strengthen this worker's legal case?" },
    { label: "Draft internal note", question: "Draft a short internal note summarizing this worker's legal situation for the coordinator." },
  ],
  general: [
    { label: "Worker summary", question: "Give me a complete summary of this worker: status, compliance, documents, and next steps." },
    { label: "Explain situation", question: "Explain this worker's legal and employment situation in plain language." },
    { label: "What to do next", question: "What should the agency do next for this worker? Prioritize the actions." },
    { label: "Draft coordinator note", question: "Draft a short internal note about this worker's current situation for the site coordinator." },
  ],
};

export function CopilotPanel({ workerId, panelContext = "general", compact = false }: CopilotPanelProps) {
  const [question, setQuestion] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [result, setResult] = useState<CopilotResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const ask = useMutation({
    mutationFn: async (q: string) => {
      const token = localStorage.getItem("apatris_jwt");
      const res = await fetch(`${import.meta.env.BASE_URL}api/v1/legal/copilot/ask`, {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ workerId, question: q }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Copilot unavailable" }));
        throw new Error(err.error ?? "Failed");
      }
      return res.json() as Promise<CopilotResponse>;
    },
    onSuccess: (data) => {
      setResult(data);
      setExpanded(true);
    },
  });

  const handleAsk = (q: string) => {
    setQuestion(q);
    ask.mutate(q);
  };

  const handleCopy = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.answer + (result.nextSteps?.length ? "\n\nNext steps:\n" + result.nextSteps.map(s => `- ${s}`).join("\n") : ""));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const prompts = QUICK_PROMPTS[panelContext] ?? QUICK_PROMPTS.general;

  if (!workerId) return null;

  // Compact mode: just a trigger button that expands
  if (compact && !expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-purple-500/20 bg-purple-500/5 hover:bg-purple-500/10 text-purple-400 text-xs font-bold transition-colors"
      >
        <Sparkles className="w-3.5 h-3.5" />
        Ask EEJ Copilot about this worker
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-purple-500/20 bg-slate-800/50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-purple-500/5 border-b border-purple-500/10">
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-purple-400" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-purple-400">EEJ Copilot</span>
          {result?.source === "fallback" && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 border border-yellow-500/20">Fallback</span>
          )}
        </div>
        {compact && (
          <button onClick={() => { setExpanded(false); setResult(null); }} className="text-slate-500 hover:text-white text-xs">Close</button>
        )}
      </div>

      <div className="p-3 space-y-3">
        {/* Quick prompts */}
        {!result && (
          <div className="flex flex-wrap gap-1.5">
            {prompts.map((p) => (
              <button
                key={p.label}
                onClick={() => handleAsk(p.question)}
                disabled={ask.isPending}
                className="px-2 py-1 rounded-lg text-[10px] font-bold bg-slate-900 border border-slate-700 text-slate-400 hover:text-purple-400 hover:border-purple-500/30 transition-colors disabled:opacity-50"
              >
                {p.label}
              </button>
            ))}
          </div>
        )}

        {/* Custom question input */}
        <div className="flex gap-2">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && question.trim()) handleAsk(question.trim()); }}
            placeholder="Ask about this worker..."
            className="flex-1 bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-purple-500/50 placeholder:text-slate-600"
            disabled={ask.isPending}
          />
          <button
            onClick={() => { if (question.trim()) handleAsk(question.trim()); }}
            disabled={ask.isPending || !question.trim()}
            className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1"
          >
            {ask.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
          </button>
        </div>

        {/* Loading */}
        {ask.isPending && (
          <div className="flex items-center gap-2 py-3 justify-center text-xs text-purple-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            Analyzing worker data...
          </div>
        )}

        {/* Error */}
        {ask.isError && (
          <div className="flex items-center gap-2 text-xs text-red-400 p-2 rounded-lg bg-red-500/10 border border-red-500/20">
            <AlertTriangle className="w-3 h-3 flex-shrink-0" />
            {ask.error instanceof Error ? ask.error.message : "Copilot failed"}
          </div>
        )}

        {/* Result */}
        {result && !ask.isPending && (
          <div className="space-y-2">
            {/* Answer */}
            <div className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">
              {result.answer}
            </div>

            {/* Next steps */}
            {result.nextSteps?.length > 0 && (
              <div className="p-2 rounded-lg bg-slate-900 border border-slate-700">
                <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-1">Next Steps</p>
                {result.nextSteps.map((s, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-xs text-slate-300 mb-0.5">
                    <ChevronRight className="w-3 h-3 mt-0.5 text-blue-400 flex-shrink-0" />
                    {s}
                  </div>
                ))}
              </div>
            )}

            {/* Confidence + actions */}
            <div className="flex items-center gap-2 flex-wrap">
              {result.confidence > 0 && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                  result.confidence >= 0.7 ? "bg-green-500/20 text-green-400 border-green-500/30" :
                  result.confidence >= 0.4 ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" :
                  "bg-red-500/20 text-red-400 border-red-500/30"
                }`}>
                  {Math.round(result.confidence * 100)}% confidence
                </span>
              )}
              <span className="text-[9px] text-slate-600 uppercase">Draft · Requires Review</span>
              <button onClick={handleCopy} className="ml-auto p-1 rounded hover:bg-slate-700 text-slate-500 hover:text-white transition-colors" title="Copy">
                {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
              </button>
              <button onClick={() => { setResult(null); setQuestion(""); }} className="p-1 rounded hover:bg-slate-700 text-slate-500 hover:text-white transition-colors text-[10px]">
                New question
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
