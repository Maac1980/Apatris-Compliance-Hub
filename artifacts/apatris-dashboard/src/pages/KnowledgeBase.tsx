/**
 * Knowledge Graph — Legal knowledge base with case patterns, document relationships, and AI search.
 * Replaces the old Obsidian exports viewer with a full graph interface.
 */

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authHeaders, BASE } from "@/lib/api";
import {
  ArrowLeft, BookOpen, Search, Plus, Brain, FileText, Scale, Shield,
  AlertTriangle, Clock, Loader2, ChevronDown, ChevronUp, Tag, Sparkles,
  CheckCircle2, ExternalLink, Filter, History,
} from "lucide-react";

// ─── Category config ────────────────────────────────────────────────────────

const CATEGORIES: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  permits: { label: "Work Permits", color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20", icon: Shield },
  trc: { label: "TRC / Residence", color: "text-violet-400", bg: "bg-violet-500/10 border-violet-500/20", icon: Shield },
  art108: { label: "Art. 108", color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20", icon: Scale },
  mos: { label: "MOS 2.0 Digital", color: "text-cyan-400", bg: "bg-cyan-500/10 border-cyan-500/20", icon: Brain },
  ees: { label: "EES / Schengen", color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20", icon: AlertTriangle },
  zus: { label: "ZUS / Tax", color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20", icon: FileText },
  contracts: { label: "Contracts", color: "text-rose-400", bg: "bg-rose-500/10 border-rose-500/20", icon: FileText },
  pip: { label: "PIP / Fines", color: "text-red-400", bg: "bg-red-500/10 border-red-500/20", icon: AlertTriangle },
  gdpr: { label: "GDPR", color: "text-slate-400", bg: "bg-slate-500/10 border-slate-500/20", icon: Shield },
  general: { label: "General", color: "text-slate-400", bg: "bg-slate-500/10 border-slate-500/20", icon: BookOpen },
};

export default function KnowledgeBase() {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [activeTab, setActiveTab] = useState<"articles" | "ask" | "history">("articles");

  // Ask AI state
  const [question, setQuestion] = useState("");
  const [aiAnswer, setAiAnswer] = useState<any>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Add article form
  const [newArticle, setNewArticle] = useState({ category: "permits", title: "", content: "", sourceName: "", sourceUrl: "", language: "en", tags: "" });

  // Fetch articles
  const { data: articlesData, isLoading, refetch } = useQuery({
    queryKey: ["legal-kb-articles", selectedCategory],
    queryFn: async () => {
      const url = selectedCategory
        ? `${BASE}api/legal-kb/articles?category=${selectedCategory}`
        : `${BASE}api/legal-kb/articles`;
      const r = await fetch(url, { headers: authHeaders() });
      if (!r.ok) return { articles: [] };
      return r.json();
    },
  });

  // Fetch categories
  const { data: categoriesData } = useQuery({
    queryKey: ["legal-kb-categories"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/legal-kb/categories`, { headers: authHeaders() });
      if (!r.ok) return { categories: [] };
      return r.json();
    },
  });

  // Fetch query history
  const { data: historyData } = useQuery({
    queryKey: ["legal-kb-history"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/legal-kb/history`, { headers: authHeaders() });
      if (!r.ok) return { queries: [] };
      return r.json();
    },
    enabled: activeTab === "history",
  });

  const articles = (articlesData?.articles ?? []) as any[];
  const categories = (categoriesData?.categories ?? []) as any[];
  const queryHistory = (historyData?.queries ?? []) as any[];

  // Filter articles by search
  const filtered = searchQuery.trim()
    ? articles.filter((a: any) => {
        const s = searchQuery.toLowerCase();
        return a.title?.toLowerCase().includes(s) || a.content?.toLowerCase().includes(s) || a.category?.toLowerCase().includes(s);
      })
    : articles;

  // Ask AI — uses 3-tier intelligence routing (KB → Perplexity → Claude)
  const handleAsk = async () => {
    if (!question.trim()) return;
    setAiLoading(true);
    setAiAnswer(null);
    try {
      const r = await fetch(`${BASE}api/legal-kb/ask`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ question, language: "en" }),
      });
      if (r.ok) {
        const data = await r.json();
        setAiAnswer(data);
      }
    } catch { /* ignore */ }
    setAiLoading(false);
  };

  // Add article
  const handleAdd = async () => {
    if (!newArticle.title || !newArticle.content) return;
    try {
      const r = await fetch(`${BASE}api/legal-kb/articles`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newArticle,
          tags: newArticle.tags.split(",").map(t => t.trim()).filter(Boolean),
        }),
      });
      if (r.ok) {
        setShowAddForm(false);
        setNewArticle({ category: "permits", title: "", content: "", sourceName: "", sourceUrl: "", language: "en", tags: "" });
        refetch();
      }
    } catch { /* ignore */ }
  };

  const totalArticles = categories.reduce((s: number, c: any) => s + parseInt(c.count || 0), 0);

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <a href="/legal-immigration" className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white hover:border-slate-600 transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </a>
        <Brain className="w-7 h-7 text-[#C41E18]" />
        <div>
          <h1 className="text-2xl font-bold text-white">Legal Knowledge Graph</h1>
          <p className="text-sm text-slate-400">{totalArticles} articles across {categories.length} categories — April 2026 rules</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 bg-slate-900/50 rounded-xl p-1 max-w-md">
        {([
          { key: "articles" as const, label: "Articles", icon: BookOpen },
          { key: "ask" as const, label: "Ask AI", icon: Sparkles },
          { key: "history" as const, label: "History", icon: History },
        ]).map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-colors flex-1 justify-center ${
              activeTab === t.key ? "bg-slate-800 text-white border border-slate-700" : "text-slate-500 hover:text-slate-300"
            }`}>
            <t.icon className="w-3.5 h-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {/* ═══ ARTICLES TAB ═══ */}
      {activeTab === "articles" && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left: Categories */}
          <div className="space-y-2">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Categories</p>
            <button onClick={() => setSelectedCategory(null)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-bold transition-colors ${
                !selectedCategory ? "bg-slate-800 text-white border border-slate-700" : "text-slate-400 hover:bg-slate-800/50"
              }`}>
              <span>All Articles</span>
              <span className="text-[10px] bg-slate-700 px-1.5 py-0.5 rounded">{totalArticles}</span>
            </button>
            {categories.map((c: any) => {
              const cfg = CATEGORIES[c.category] ?? CATEGORIES.general;
              const CatIcon = cfg.icon;
              return (
                <button key={c.category} onClick={() => setSelectedCategory(c.category)}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs transition-colors ${
                    selectedCategory === c.category ? `${cfg.bg} ${cfg.color} font-bold border` : "text-slate-400 hover:bg-slate-800/50"
                  }`}>
                  <CatIcon className="w-3.5 h-3.5" />
                  <span className="flex-1 text-left">{cfg.label}</span>
                  <span className="text-[10px] opacity-60">{c.count}</span>
                </button>
              );
            })}

            <div className="pt-3 border-t border-slate-800 mt-3">
              <button onClick={() => setShowAddForm(!showAddForm)}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs font-bold hover:bg-emerald-500/20 transition-colors border border-emerald-500/20">
                <Plus className="w-3.5 h-3.5" /> Add Article
              </button>
            </div>
          </div>

          {/* Right: Articles list */}
          <div className="lg:col-span-3 space-y-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search articles..."
                className="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-slate-500" />
            </div>

            {/* Add article form */}
            {showAddForm && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">New Article</p>
                <div className="grid grid-cols-2 gap-3">
                  <select value={newArticle.category} onChange={e => setNewArticle(p => ({ ...p, category: e.target.value }))}
                    className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white">
                    {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                  <input type="text" value={newArticle.title} onChange={e => setNewArticle(p => ({ ...p, title: e.target.value }))}
                    placeholder="Title" className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white" />
                </div>
                <textarea value={newArticle.content} onChange={e => setNewArticle(p => ({ ...p, content: e.target.value }))}
                  placeholder="Article content..." rows={4}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white resize-none" />
                <div className="grid grid-cols-3 gap-3">
                  <input type="text" value={newArticle.sourceName} onChange={e => setNewArticle(p => ({ ...p, sourceName: e.target.value }))}
                    placeholder="Source name" className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white" />
                  <input type="text" value={newArticle.sourceUrl} onChange={e => setNewArticle(p => ({ ...p, sourceUrl: e.target.value }))}
                    placeholder="Source URL" className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white" />
                  <input type="text" value={newArticle.tags} onChange={e => setNewArticle(p => ({ ...p, tags: e.target.value }))}
                    placeholder="Tags (comma-separated)" className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white" />
                </div>
                <div className="flex gap-2">
                  <button onClick={handleAdd} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700">Save Article</button>
                  <button onClick={() => setShowAddForm(false)} className="px-4 py-2 rounded-lg bg-slate-700 text-slate-300 text-xs font-bold hover:bg-slate-600">Cancel</button>
                </div>
              </div>
            )}

            {/* Article list */}
            {isLoading ? (
              <div className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin text-slate-500 mx-auto" /></div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-slate-600">
                <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No articles found. {searchQuery ? "Try different search terms." : "Add articles to build your knowledge base."}</p>
              </div>
            ) : (
              filtered.map((a: any) => {
                const cfg = CATEGORIES[a.category] ?? CATEGORIES.general;
                const CatIcon = cfg.icon;
                const isExpanded = expandedId === a.id;
                return (
                  <div key={a.id} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                    <div className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-slate-800/50 transition-colors"
                      onClick={() => setExpandedId(isExpanded ? null : a.id)}>
                      <div className={`w-8 h-8 rounded-lg ${cfg.bg} border flex items-center justify-center shrink-0`}>
                        <CatIcon className={`w-4 h-4 ${cfg.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-bold text-white truncate">{a.title}</h4>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-[9px] font-bold uppercase ${cfg.color}`}>{cfg.label}</span>
                          {a.source_name && <span className="text-[9px] text-slate-500">· {a.source_name}</span>}
                          {a.effective_date && (
                            <span className="text-[9px] text-slate-500 flex items-center gap-0.5">
                              <Clock className="w-2.5 h-2.5" /> Effective {new Date(a.effective_date).toLocaleDateString("en-GB")}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {a.tags && JSON.parse(a.tags || "[]").length > 0 && (
                          <div className="flex gap-1">
                            {JSON.parse(a.tags).slice(0, 3).map((t: string) => (
                              <span key={t} className="text-[8px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-400">{t}</span>
                            ))}
                          </div>
                        )}
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="px-4 py-3 border-t border-slate-800">
                        <div className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">{a.content}</div>
                        {a.source_url && (
                          <a href={a.source_url} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 mt-3 text-[10px] text-blue-400 hover:text-blue-300">
                            <ExternalLink className="w-3 h-3" /> {a.source_url}
                          </a>
                        )}
                        <div className="flex items-center gap-3 mt-3 text-[9px] text-slate-500">
                          <span>Language: {a.language?.toUpperCase()}</span>
                          {a.last_verified && <span>Verified: {new Date(a.last_verified).toLocaleDateString("en-GB")}</span>}
                          <span>ID: {a.id?.slice(0, 8)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ═══ ASK AI TAB ═══ */}
      {activeTab === "ask" && (
        <div className="max-w-3xl space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-5 h-5 text-violet-400" />
              <p className="text-sm font-bold text-white">Ask Legal AI</p>
            </div>
            <p className="text-xs text-slate-400 mb-3">Ask any question about Polish immigration law, work permits, ZUS, Art. 108, MOS 2026, or employer obligations. The AI searches verified articles first, then uses general legal knowledge.</p>
            <div className="flex gap-2">
              <input type="text" value={question} onChange={e => setQuestion(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleAsk()}
                placeholder="e.g., What documents are needed for a Type A work permit?"
                className="flex-1 px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500/50" />
              <button onClick={handleAsk} disabled={aiLoading || !question.trim()}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-violet-600 text-white text-xs font-bold hover:bg-violet-700 disabled:opacity-50 transition-colors">
                {aiLoading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Searching...</> : <><Brain className="w-3.5 h-3.5" /> Ask</>}
              </button>
            </div>

            {/* Quick questions */}
            <div className="flex flex-wrap gap-1.5 mt-3">
              {[
                "What is Art. 108 protection?",
                "MOS 2.0 digital filing process",
                "ZUS contribution rates 2026",
                "Maximum PIP fines",
                "TRC renewal steps",
                "EES border tracking rules",
                "Employer Annex 1 obligations",
                "Oswiadczenie validity period",
              ].map(q => (
                <button key={q} onClick={() => { setQuestion(q); }}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-400 text-[10px] hover:bg-slate-700 hover:text-white transition-colors">
                  {q}
                </button>
              ))}
            </div>
          </div>

          {/* AI Answer — shows source tier badge */}
          {aiAnswer && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <p className="text-sm font-bold text-white">Answer</p>
                {/* Source tier badge */}
                {aiAnswer.sourceTier && (
                  <span className={`text-[9px] px-2 py-0.5 rounded font-bold border ${
                    aiAnswer.sourceTier === "kb"
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                      : aiAnswer.sourceTier === "perplexity"
                        ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                        : aiAnswer.sourceTier === "claude"
                          ? "bg-violet-500/10 text-violet-400 border-violet-500/20"
                          : "bg-slate-700 text-slate-400 border-slate-600"
                  }`}>
                    {aiAnswer.sourceTier === "kb" ? "VERIFIED KB" : aiAnswer.sourceTier === "perplexity" ? "SEARCH" : aiAnswer.sourceTier === "claude" ? "AI SYNTHESIS" : "FALLBACK"}
                  </span>
                )}
                {aiAnswer.confidence > 0 && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                    {Math.round(aiAnswer.confidence)}% confidence
                  </span>
                )}
                {aiAnswer.latencyMs > 0 && (
                  <span className="text-[9px] text-slate-600">{aiAnswer.latencyMs}ms</span>
                )}
              </div>
              <div className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">{aiAnswer.answer}</div>
              {aiAnswer.citations?.length > 0 && (
                <div className="border-t border-slate-800 pt-2">
                  <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">Sources</p>
                  <div className="flex flex-wrap gap-1.5">
                    {aiAnswer.citations.map((s: any, i: number) => (
                      <span key={i} className="text-[9px] px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                        {s.url ? (
                          <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">{s.title}</a>
                        ) : s.title}
                        <span className="text-slate-600 ml-1">({s.source})</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══ HISTORY TAB ═══ */}
      {activeTab === "history" && (
        <div className="max-w-3xl space-y-2">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3">Recent Queries ({queryHistory.length})</p>
          {queryHistory.length === 0 ? (
            <div className="text-center py-12 text-slate-600">
              <History className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No queries yet. Use the Ask AI tab to search the knowledge base.</p>
            </div>
          ) : (
            queryHistory.map((q: any) => (
              <div key={q.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-bold text-white">{q.question}</p>
                  <span className="text-[9px] text-slate-500">{new Date(q.created_at).toLocaleString("en-GB")}</span>
                </div>
                <p className="text-xs text-slate-400 line-clamp-3">{q.answer}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[9px] text-slate-500">By: {q.user_id}</span>
                  <span className="text-[9px] text-slate-500">Lang: {q.language?.toUpperCase()}</span>
                  {q.sources_used && JSON.parse(q.sources_used || "[]").length > 0 && (
                    <span className="text-[9px] text-slate-500">{JSON.parse(q.sources_used).length} sources</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
