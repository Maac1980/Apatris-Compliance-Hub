/**
 * LegalSearchBar — inline AI legal search for the workforce app.
 * Calls intelligence routing pipeline (KB → Perplexity → Claude).
 * Shows answer with source tier badge directly in the app.
 */

import { useState } from "react";
import { Search, Loader2, BookOpen, Globe, Brain, X, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = "/api/";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_token") || localStorage.getItem("apatris_jwt") || "";
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

const TIER_STYLE: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  kb:         { label: "Verified Law",  color: "text-emerald-400", bg: "bg-emerald-500/10", icon: BookOpen },
  perplexity: { label: "Legal Search",  color: "text-blue-400",    bg: "bg-blue-500/10",    icon: Globe },
  claude:     { label: "AI Analysis",   color: "text-violet-400",  bg: "bg-violet-500/10",  icon: Brain },
  fallback:   { label: "No Result",     color: "text-slate-400",   bg: "bg-slate-700",      icon: Search },
};

export function LegalSearchBar() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleSearch = async () => {
    if (!query.trim() || loading) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`${BASE}legal-kb/ask`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ question: query, language: "pl" }),
      });
      if (res.ok) setResult(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  };

  const tier = TIER_STYLE[result?.sourceTier] ?? TIER_STYLE.fallback;

  return (
    <div className="mb-4">
      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleSearch()}
          placeholder="Zapytaj o prawo imigracyjne / Ask immigration law..."
          className="w-full pl-9 pr-16 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-sm text-white placeholder-white/25 focus:border-white/20 focus:outline-none"
        />
        <button
          onClick={handleSearch}
          disabled={loading || !query.trim()}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-[#C41E18] text-white rounded-lg text-[10px] font-bold disabled:opacity-30 active:scale-95"
        >
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : "Ask"}
        </button>
      </div>

      {/* Result */}
      {result && (
        <div className="mt-3 bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden">
          {/* Tier badge header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06]">
            <div className="flex items-center gap-2">
              <tier.icon className={cn("w-3.5 h-3.5", tier.color)} />
              <span className={cn("text-[9px] font-bold uppercase tracking-wider", tier.color)}>{tier.label}</span>
              {result.confidence > 0 && (
                <span className="text-[9px] text-white/30">{Math.round(result.confidence)}%</span>
              )}
              {result.latencyMs > 0 && (
                <span className="text-[9px] text-white/20">{result.latencyMs}ms</span>
              )}
            </div>
            <button onClick={() => setResult(null)} className="p-0.5 text-white/20 active:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {/* Answer */}
          <div className="px-3 py-3 max-h-[300px] overflow-y-auto">
            <p className="text-xs text-white/70 whitespace-pre-wrap leading-relaxed">{result.answer}</p>
          </div>
          {/* Citations */}
          {result.citations?.length > 0 && (
            <div className="px-3 py-2 border-t border-white/[0.04] flex flex-wrap gap-1">
              {result.citations.slice(0, 4).map((c: any, i: number) => (
                <span key={i} className="text-[8px] px-1.5 py-0.5 rounded bg-white/[0.04] text-white/30">{c.title}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
