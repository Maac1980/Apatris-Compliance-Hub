import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, Send, Brain, Database, Zap } from "lucide-react";
import { authHeaders, BASE } from "@/lib/api";


const QUICK_QUERIES = [
  "Who is available today?", "Any expiring permits this week?", "What's our average margin?",
  "Which workers are on bench?", "Show payroll summary for this month", "Any compliance alerts?",
];

export default function AiCopilot() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<{ answer: string; agentsUsed: string[]; responseTimeMs: number } | null>(null);

  const { data: status } = useQuery({ queryKey: ["ai-status"], queryFn: async () => { const r = await fetch(`${import.meta.env.BASE_URL}api/ai/status`, { headers: authHeaders() }); if (!r.ok) return {}; return r.json(); } });
  const { data: history } = useQuery({ queryKey: ["ai-queries"], queryFn: async () => { const r = await fetch(`${import.meta.env.BASE_URL}api/ai/queries`, { headers: authHeaders() }); if (!r.ok) return { queries: [] }; return r.json(); } });

  const askMutation = useMutation({
    mutationFn: async (q: string) => { const r = await fetch(`${import.meta.env.BASE_URL}api/ai/query`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ query: q }) }); if (!r.ok) throw new Error("Failed"); return r.json(); },
    onSuccess: (d) => { setAnswer(d); queryClient.invalidateQueries({ queryKey: ["ai-queries", "ai-status"] }); },
    onError: (err) => toast({ description: err instanceof Error ? err.message : "Failed", variant: "destructive" }),
  });

  const indexMutation = useMutation({
    mutationFn: async () => { const r = await fetch(`${import.meta.env.BASE_URL}api/ai/index`, { method: "POST", headers: authHeaders() }); if (!r.ok) throw new Error("Failed"); return r.json(); },
    onSuccess: (d) => { toast({ description: `Indexed ${d.indexed} nodes` }); queryClient.invalidateQueries({ queryKey: ["ai-status"] }); },
  });

  const s = status ?? {};

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2"><Sparkles className="w-7 h-7 text-[#C41E18]" /><h1 className="text-3xl font-bold text-white">AI Copilot</h1></div>
        <p className="text-gray-400">6 sub-agents + knowledge graph — ask anything about your workforce</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">Knowledge Nodes</p><p className="text-2xl font-bold text-indigo-400">{s.knowledgeGraph?.totalNodes ?? 0}</p></div>
        <div className="bg-slate-800 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">Queries</p><p className="text-2xl font-bold text-white">{s.queries?.total ?? 0}</p></div>
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">Avg Response</p><p className="text-2xl font-bold text-emerald-400">{s.queries?.avgResponseMs ?? 0}ms</p></div>
        <div className="bg-slate-800 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">Agents</p><p className="text-2xl font-bold text-white">{(s.agents ?? []).length}</p>
          <button onClick={() => indexMutation.mutate()} disabled={indexMutation.isPending} className="mt-1 text-[9px] text-[#C41E18] font-bold">{indexMutation.isPending ? "Indexing..." : "Re-index"}</button>
        </div>
      </div>

      {/* Query box */}
      <div className="bg-slate-900 border border-indigo-500/20 rounded-xl p-4 mb-4">
        <div className="flex gap-3 mb-3">
          <textarea value={question} onChange={e => setQuestion(e.target.value)} rows={2} placeholder="Ask anything about your workforce..."
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && question.trim()) { e.preventDefault(); askMutation.mutate(question); } }}
            className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          <button onClick={() => askMutation.mutate(question)} disabled={!question.trim() || askMutation.isPending}
            className="px-4 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 disabled:opacity-50 self-end">
            {askMutation.isPending ? <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" /> : <Send className="w-5 h-5" />}
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_QUERIES.map(q => (
            <button key={q} onClick={() => { setQuestion(q); askMutation.mutate(q); }}
              className="px-2.5 py-1 bg-slate-800 text-slate-400 rounded-lg text-[10px] font-bold hover:bg-slate-700 hover:text-white">
              <Zap className="w-2.5 h-2.5 inline mr-1" />{q}
            </button>
          ))}
        </div>
      </div>

      {/* Answer */}
      {answer && (
        <div className="bg-slate-900 border border-emerald-500/20 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Brain className="w-4 h-4 text-indigo-400" />
            <div className="flex gap-1">{answer.agentsUsed.map(a => <span key={a} className="px-2 py-0.5 bg-indigo-500/10 text-indigo-400 rounded text-[9px] font-bold">{a}</span>)}</div>
            <span className="text-[9px] text-slate-600 font-mono ml-auto">{answer.responseTimeMs}ms</span>
          </div>
          <p className="text-sm text-white whitespace-pre-wrap">{answer.answer}</p>
        </div>
      )}

      {/* Query history */}
      <h3 className="text-sm font-bold text-white mb-2">Recent Queries</h3>
      <div className="space-y-2">
        {(history?.queries ?? []).slice(0, 10).map((q: any) => (
          <div key={q.id} className="bg-slate-900 border border-slate-700 rounded-lg p-3">
            <p className="text-xs font-bold text-white mb-1">{q.query}</p>
            <p className="text-[10px] text-slate-400 line-clamp-2">{q.final_answer?.slice(0, 150)}</p>
            <div className="flex items-center gap-2 mt-1 text-[9px] text-slate-600">
              <span className="font-mono">{q.response_time_ms}ms</span>
              {(typeof q.agents_used === "string" ? JSON.parse(q.agents_used) : q.agents_used || []).map((a: string) => <span key={a} className="text-indigo-400">{a}</span>)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
