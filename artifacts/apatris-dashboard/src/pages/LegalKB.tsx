import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { BookOpen, Send, ExternalLink } from "lucide-react";
import { authHeaders, BASE } from "@/lib/api";


interface Article { id: string; category: string; title: string; content: string; source_name: string; source_url: string | null; tags: any; }

const CAT_COLORS: Record<string, string> = { TRC: "text-blue-400 bg-blue-500/10", "Work Permit": "text-amber-400 bg-amber-500/10", "Posted Workers": "text-emerald-400 bg-emerald-500/10", ZUS: "text-indigo-400 bg-indigo-500/10", "PIT-11": "text-violet-400 bg-violet-500/10", "PIT-37": "text-violet-400 bg-violet-500/10", "Labour Code": "text-red-400 bg-red-500/10", GDPR: "text-slate-400 bg-slate-500/10", "A1 Certificate": "text-cyan-400 bg-cyan-500/10" };

export default function LegalKB() {
  const { toast } = useToast();
  const [tab, setTab] = useState<"ask" | "articles">("ask");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<{ answer: string; sources: any[] } | null>(null);
  const [selectedCat, setSelectedCat] = useState("");

  const { data: catData } = useQuery({
    queryKey: ["legal-kb-categories"],
    queryFn: async () => { const r = await fetch(`${import.meta.env.BASE_URL}api/legal-kb/categories`, { headers: authHeaders() }); if (!r.ok) return { categories: [] }; return r.json(); },
  });

  const { data: artData } = useQuery({
    queryKey: ["legal-kb-articles", selectedCat],
    queryFn: async () => { const r = await fetch(`${import.meta.env.BASE_URL}api/legal-kb/articles${selectedCat ? `?category=${selectedCat}` : ""}`, { headers: authHeaders() }); if (!r.ok) return { articles: [] }; return r.json() as Promise<{ articles: Article[] }>; },
    enabled: tab === "articles",
  });

  const askMutation = useMutation({
    mutationFn: async (q: string) => { const r = await fetch(`${import.meta.env.BASE_URL}api/legal-kb/query`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ question: q }) }); if (!r.ok) throw new Error("Failed"); return r.json(); },
    onSuccess: (d) => setAnswer(d),
    onError: (err) => toast({ description: err instanceof Error ? err.message : "Failed", variant: "destructive" }),
  });

  const categories = catData?.categories ?? [];
  const articles = artData?.articles ?? [];

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2"><BookOpen className="w-7 h-7 text-[#C41E18]" /><h1 className="text-3xl font-bold text-white">Legal Knowledge Base</h1></div>
        <p className="text-gray-400">Verified Polish law articles — AI answers from official sources only</p>
      </div>

      <div className="flex gap-1 mb-6 bg-slate-800/50 rounded-lg p-1 w-fit">
        <button onClick={() => setTab("ask")} className={`px-4 py-2 rounded-md text-sm font-bold ${tab === "ask" ? "bg-[#C41E18] text-white" : "text-slate-400"}`}>Ask a Question</button>
        <button onClick={() => setTab("articles")} className={`px-4 py-2 rounded-md text-sm font-bold ${tab === "articles" ? "bg-[#C41E18] text-white" : "text-slate-400"}`}>Article Library</button>
      </div>

      {tab === "ask" ? (
        <div>
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 mb-4">
            <textarea value={question} onChange={e => setQuestion(e.target.value)} rows={3}
              placeholder="Ask any question about Polish immigration law, work permits, ZUS, tax..."
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 resize-none mb-3 focus:outline-none focus:ring-1 focus:ring-[#C41E18]" />
            <button onClick={() => askMutation.mutate(question)} disabled={!question.trim() || askMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-[#C41E18] text-white rounded-lg text-sm font-bold hover:bg-[#a51914] disabled:opacity-50">
              {askMutation.isPending ? <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : <Send className="w-4 h-4" />}
              Ask
            </button>
          </div>

          {answer && (
            <div className="bg-slate-900 border border-emerald-500/20 rounded-xl p-4">
              <p className="text-sm text-white whitespace-pre-wrap mb-4">{answer.answer}</p>
              {answer.sources?.length > 0 && (
                <div className="border-t border-slate-700 pt-3">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Sources Cited</p>
                  {answer.sources.map((s: any, i: number) => (
                    <p key={i} className="text-xs text-slate-400 mb-1">• [{s.category}] {s.title} — <span className="text-blue-400">{s.source}</span></p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div>
          <div className="flex flex-wrap gap-1.5 mb-4">
            <button onClick={() => setSelectedCat("")} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${!selectedCat ? "bg-[#C41E18] text-white" : "bg-slate-800 text-slate-400"}`}>All</button>
            {categories.map((c: any) => (
              <button key={c.category} onClick={() => setSelectedCat(c.category)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold ${selectedCat === c.category ? "bg-[#C41E18] text-white" : "bg-slate-800 text-slate-400"}`}>
                {c.category} ({c.count})
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {articles.map(a => {
              const cc = CAT_COLORS[a.category] || "text-slate-400 bg-slate-500/10";
              return (
                <div key={a.id} className="bg-slate-900 border border-slate-700 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${cc}`}>{a.category}</span>
                    <p className="text-sm font-bold text-white">{a.title}</p>
                  </div>
                  <p className="text-xs text-slate-300 mb-2">{a.content.slice(0, 200)}...</p>
                  <div className="flex items-center gap-2 text-[10px] text-slate-500">
                    <span>{a.source_name}</span>
                    {a.source_url && <a href={a.source_url} target="_blank" rel="noopener" className="flex items-center gap-1 text-blue-400 hover:underline"><ExternalLink className="w-2.5 h-2.5" />Source</a>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
