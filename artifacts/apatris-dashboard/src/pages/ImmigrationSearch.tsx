import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  Search, Globe, BookOpen, ExternalLink, Loader2, History, Sparkles,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

const BASE = import.meta.env.BASE_URL;

interface SearchResult {
  answer: string;
  sources: { url: string; title?: string }[];
  confidence: number;
  actionItems: string[];
}

export default function ImmigrationSearch() {
  const { i18n } = useTranslation();
  const isPl = i18n.language?.startsWith("pl");
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [language, setLanguage] = useState<"en" | "pl">(isPl ? "pl" : "en");
  const [popular, setPopular] = useState<{ en: string; pl: string }[]>([]);
  const [searchHistory, setSearchHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`${BASE}api/immigration/popular`)
      .then((r) => r.json())
      .then((d) => setPopular(d.questions ?? []))
      .catch((err) => { console.error("[ImmigrationSearch] Failed to load popular questions:", err); });

    fetch(`${BASE}api/immigration/history`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => setSearchHistory(d.history ?? []))
      .catch((err) => { console.error("[ImmigrationSearch] Failed to load search history:", err); });
  }, []);

  async function handleSearch(q?: string) {
    const searchQuery = q ?? query;
    if (!searchQuery.trim()) return;
    setLoading(true);
    setResult(null);
    setShowHistory(false);
    try {
      const res = await fetch(`${BASE}api/immigration/search`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ query: searchQuery, language }),
      });
      const data = await res.json();
      setResult(data);
    } catch (err) {
      console.error("[ImmigrationSearch] Search failed:", err);
      toast({ title: isPl ? "Blad wyszukiwania" : "Search Failed", description: isPl ? "Nie udalo sie przeprowadzic wyszukiwania. Sprobuj ponownie." : "Search failed. Please try again.", variant: "destructive" });
      setResult({
        answer: isPl ? "Wyszukiwanie niedostepne. Sprobuj ponownie pozniej." : "Search unavailable. Try again later.",
        sources: [],
        confidence: 0,
        actionItems: [],
      });
    }
    setLoading(false);
  }

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary/10 border border-primary/20 rounded-full text-xs font-bold text-primary mb-3">
            <Sparkles className="w-3 h-3" /> AI-Powered
          </div>
          <h1 className="text-2xl font-bold text-white">
            {isPl ? "Wyszukiwarka Imigracyjna" : "Immigration Search Engine"}
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            {isPl
              ? "Przeszukuj polskie prawo imigracyjne i przepisy dotyczace pracy"
              : "Search Polish immigration law and employment regulations"}
          </p>
        </div>

        {/* Search bar */}
        <div className="relative mb-4">
          <input
            ref={inputRef}
            type="text"
            placeholder={language === "en" ? "Ask about Polish immigration law..." : "Zapytaj o polskie prawo imigracyjne..."}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="w-full px-4 py-3.5 pl-11 pr-24 rounded-xl bg-card border-2 border-border text-foreground text-sm outline-none focus:border-primary transition-colors"
          />
          <Search className="absolute left-3.5 top-3.5 w-5 h-5 text-muted-foreground" />
          <button
            onClick={() => handleSearch()}
            disabled={loading || !query.trim()}
            className="absolute right-2 top-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 disabled:opacity-50 transition-all"
          >
            {loading ? "..." : (isPl ? "Szukaj" : "Search")}
          </button>
        </div>

        {/* Language + History toggles */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex gap-2">
            <button
              onClick={() => setLanguage("en")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                language === "en" ? "bg-primary text-white border-primary" : "bg-card text-muted-foreground border-border"
              }`}
            >
              English
            </button>
            <button
              onClick={() => setLanguage("pl")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                language === "pl" ? "bg-primary text-white border-primary" : "bg-card text-muted-foreground border-border"
              }`}
            >
              Polski
            </button>
          </div>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <History className="w-3.5 h-3.5" />
            {isPl ? "Historia" : "History"} ({searchHistory.length})
          </button>
        </div>

        {/* Search History */}
        {showHistory && searchHistory.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-4 mb-6">
            <h3 className="text-sm font-bold text-foreground mb-3">{isPl ? "Ostatnie wyszukiwania" : "Recent Searches"}</h3>
            {searchHistory.slice(0, 8).map((h: any, i: number) => (
              <button
                key={i}
                onClick={() => {
                  setQuery(h.question);
                  handleSearch(h.question);
                }}
                className="w-full text-left p-2 rounded-lg hover:bg-muted text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2"
              >
                <Search className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{h.question}</span>
                <span className="text-xs ml-auto flex-shrink-0 opacity-50">
                  {h.confidence ? `${Math.round(h.confidence * 100)}%` : ""}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="text-center py-10">
            <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
            <div className="text-sm font-medium text-foreground">
              {isPl ? "Przeszukiwanie baz danych..." : "Searching immigration databases..."}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {isPl ? "Analiza praca.gov.pl, ZUS, legislacja..." : "Analyzing praca.gov.pl, ZUS, legislation..."}
            </div>
          </div>
        )}

        {/* Result */}
        {result && !loading && (
          <div className="bg-card border border-border rounded-xl p-5 mb-6">
            {/* Confidence */}
            <div className="flex justify-between items-center mb-4">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                {isPl ? "Analiza AI" : "AI Analysis"}
              </span>
              {result.confidence > 0 && (
                <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                  result.confidence >= 0.8 ? "bg-green-500/10 text-green-400" :
                  result.confidence >= 0.5 ? "bg-amber-500/10 text-amber-400" :
                  "bg-red-500/10 text-red-400"
                }`}>
                  {Math.round(result.confidence * 100)}% {isPl ? "pewnosci" : "confident"}
                </span>
              )}
            </div>

            {/* Answer */}
            <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
              {result.answer}
            </div>

            {/* Action Items */}
            {result.actionItems.length > 0 && (
              <div className="mt-4 p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg">
                <div className="text-xs font-bold text-amber-400 mb-2">
                  {isPl ? "Wymagane dzialania:" : "Action Required:"}
                </div>
                {result.actionItems.map((a, i) => (
                  <div key={i} className="text-xs text-muted-foreground pl-2 border-l-2 border-amber-500/50 mb-1.5">{a}</div>
                ))}
              </div>
            )}

            {/* Sources */}
            {result.sources.length > 0 && (
              <div className="mt-4">
                <div className="text-xs font-bold text-muted-foreground mb-2">{isPl ? "Zrodla:" : "Sources:"}</div>
                <div className="flex flex-wrap gap-2">
                  {result.sources.map((s, i) => (
                    <a
                      key={i}
                      href={s.url}
                      target="_blank"
                      rel="noopener"
                      className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 bg-blue-500/10 px-2 py-1 rounded transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" />
                      {s.title ?? (() => { try { return new URL(s.url).hostname; } catch { return "Source"; } })()}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Popular questions */}
        {!result && !loading && !showHistory && (
          <div>
            <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-primary" />
              {isPl ? "Popularne pytania" : "Popular Questions"}
            </h3>
            <div className="space-y-2">
              {popular.slice(0, 8).map((q, i) => (
                <button
                  key={i}
                  onClick={() => {
                    const text = language === "en" ? q.en : q.pl;
                    setQuery(text);
                    handleSearch(text);
                  }}
                  className="w-full text-left p-3 rounded-xl bg-card border border-border hover:border-primary/30 text-sm text-muted-foreground hover:text-foreground transition-all flex items-center gap-3"
                >
                  <BookOpen className="w-4 h-4 text-primary flex-shrink-0" />
                  {language === "en" ? q.en : q.pl}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
