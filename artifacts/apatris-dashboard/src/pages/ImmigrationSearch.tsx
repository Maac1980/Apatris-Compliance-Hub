import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { authHeaders, BASE } from "@/lib/api";
import {
  Search, Globe, BookOpen, ExternalLink, Loader2, History, Sparkles,
  ChevronDown, ChevronUp, Shield, FileText, ListChecks, Clock,
  AlertTriangle, ArrowRight, Scale, CheckCircle2, XOctagon,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";



interface SearchResult {
  answer: string;
  operator_summary?: string;
  legal_summary?: string;
  legal_basis?: { law: string; article: string; explanation: string }[];
  applies_to?: string;
  required_documents?: string[];
  process_steps?: string[];
  deadlines?: string[];
  risks?: string[];
  next_actions?: string[];
  decision?: string;
  sources: { url: string; title?: string }[];
  confidence: number;
  human_review_required?: boolean;
  actionItems: string[];
}

export default function ImmigrationSearch() {
  const { i18n } = useTranslation();
  const isPl = i18n.language?.startsWith("pl");
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState<"en" | "pl">(isPl ? "pl" : "en");
  const [popular, setPopular] = useState<{ en: string; pl: string }[]>([]);
  const [searchHistory, setSearchHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`${BASE}api/immigration/popular`, { headers: authHeaders() })
      .then((r) => r.ok ? r.json() : { questions: [] })
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
    setError(null);
    setShowHistory(false);
    try {
      const res = await fetch(`${BASE}api/immigration/search`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ query: searchQuery, language }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? `Search failed (${res.status})`);
      }
      const answer = data.answer || data.response || data.text || "No answer returned. Please try a different question.";
      setResult({ answer, actionItems: data.actionItems ?? data.action_items ?? [], sources: data.sources ?? [], confidence: data.confidence ?? 0 });
    } catch (err: any) {
      const msg = err?.message ?? "Search failed";
      console.error("[ImmigrationSearch] Search failed:", msg);
      setError(msg);
      setResult({
        answer: msg,
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
        {/* Back + Header */}
        <div className="flex items-center mb-4">
          <a href="/legal-immigration" className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white hover:border-slate-600 transition-colors" title="Back">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
          </a>
        </div>
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

        {/* Error */}
        {error && !loading && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6">
            <p className="text-sm font-bold text-red-400 mb-1">Search Error</p>
            <p className="text-xs text-red-300">{error}</p>
          </div>
        )}

        {/* Result */}
        {result && !loading && (
          <StructuredResult result={result} isPl={isPl} />
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

// ═══ STRUCTURED RESULT ══════════════════════════════════════════════════════

const DECISION_CFG: Record<string, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  PROCEED: { icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/15 border-emerald-500/30", label: "PROCEED" },
  CAUTION: { icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-500/15 border-amber-500/30", label: "CAUTION" },
  BLOCKED: { icon: XOctagon, color: "text-red-400", bg: "bg-red-500/15 border-red-500/30", label: "BLOCKED" },
};

function StructuredResult({ result: r, isPl }: { result: SearchResult; isPl: boolean }) {
  const d = DECISION_CFG[r.decision ?? ""] ?? DECISION_CFG.CAUTION;
  const DIcon = d.icon;
  const hasStructured = !!(r.operator_summary || r.legal_summary || (r.legal_basis?.length ?? 0) > 0 || (r.next_actions?.length ?? 0) > 0);

  return (
    <div className="space-y-4 mb-6">
      {/* ── Top Bar ── */}
      <div className={`rounded-xl border p-4 ${d.bg}`}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <DIcon className={`w-5 h-5 ${d.color}`} />
            <span className={`text-sm font-black uppercase tracking-wider ${d.color}`}>{d.label}</span>
            {r.human_review_required && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400 border border-purple-500/30">REVIEW REQUIRED</span>
            )}
          </div>
          {r.confidence > 0 && (
            <span className={`text-xs font-bold px-2 py-0.5 rounded ${
              r.confidence >= 0.8 ? "bg-emerald-500/10 text-emerald-400" :
              r.confidence >= 0.5 ? "bg-amber-500/10 text-amber-400" :
              "bg-red-500/10 text-red-400"
            }`}>
              {Math.round(r.confidence * 100)}%
            </span>
          )}
        </div>
        {r.operator_summary && (
          <p className="text-sm font-bold text-foreground mt-3 leading-relaxed">{r.operator_summary}</p>
        )}
        {r.applies_to && (
          <p className="text-[11px] text-muted-foreground mt-1">Applies to: {r.applies_to}</p>
        )}
      </div>

      {/* ── Main Body + Side Panel ── */}
      <div className={hasStructured ? "grid grid-cols-1 lg:grid-cols-3 gap-4" : ""}>
        {/* Left: structured sections */}
        <div className={hasStructured ? "lg:col-span-2 space-y-2" : "space-y-2"}>
          {/* Full answer — always shown */}
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
              {r.answer || "No answer returned."}
            </div>
            {/* Sources inline */}
            {(r.sources ?? []).length > 0 && (
              <div className="mt-3 pt-3 border-t border-border">
                <div className="text-[10px] font-bold text-muted-foreground mb-1.5 uppercase tracking-wider">Sources</div>
                <div className="flex flex-wrap gap-1.5">
                  {(r.sources ?? []).map((s, i) => (
                    <a key={i} href={s.url} target="_blank" rel="noopener"
                      className="inline-flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300 bg-blue-500/10 px-1.5 py-0.5 rounded transition-colors">
                      <ExternalLink className="w-2.5 h-2.5" />
                      {s.title ?? (() => { try { return new URL(s.url).hostname; } catch { return "Source"; } })()}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Collapsible sections */}
          {r.legal_summary && (
            <CollapsibleSection icon={Scale} title="Legal Summary">
              <p className="text-xs text-foreground leading-relaxed">{r.legal_summary}</p>
            </CollapsibleSection>
          )}

          {(r.legal_basis?.length ?? 0) > 0 && (
            <CollapsibleSection icon={Shield} title="Legal Basis">
              <div className="space-y-2">
                {(r.legal_basis ?? []).map((b, i) => (
                  <div key={i} className="bg-slate-800/50 rounded-lg p-2.5">
                    <div className="flex items-center gap-2 mb-0.5">
                      {b.article && <span className="text-[10px] font-bold text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">{b.article}</span>}
                      {b.law && <span className="text-[10px] text-muted-foreground">{b.law}</span>}
                    </div>
                    {b.explanation && <p className="text-xs text-foreground leading-relaxed">{b.explanation}</p>}
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}

          {(r.required_documents?.length ?? 0) > 0 && (
            <CollapsibleSection icon={FileText} title="Required Documents">
              <ul className="space-y-1">
                {(r.required_documents ?? []).map((d, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-foreground">
                    <FileText className="w-3 h-3 text-muted-foreground mt-0.5 shrink-0" />{d}
                  </li>
                ))}
              </ul>
            </CollapsibleSection>
          )}

          {(r.process_steps?.length ?? 0) > 0 && (
            <CollapsibleSection icon={ListChecks} title="Process Steps">
              <ol className="space-y-1.5">
                {(r.process_steps ?? []).map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-foreground">
                    <span className="w-4 h-4 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-[9px] font-bold shrink-0 mt-0.5">{i + 1}</span>
                    {s}
                  </li>
                ))}
              </ol>
            </CollapsibleSection>
          )}

          {(r.deadlines?.length ?? 0) > 0 && (
            <CollapsibleSection icon={Clock} title="Deadlines">
              <ul className="space-y-1">
                {(r.deadlines ?? []).map((dl, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-amber-300">
                    <Clock className="w-3 h-3 text-amber-400 mt-0.5 shrink-0" />{dl}
                  </li>
                ))}
              </ul>
            </CollapsibleSection>
          )}

          {(r.risks?.length ?? 0) > 0 && (
            <CollapsibleSection icon={AlertTriangle} title="Risks">
              <ul className="space-y-1">
                {(r.risks ?? []).map((rk, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-red-300">
                    <AlertTriangle className="w-3 h-3 text-red-400 mt-0.5 shrink-0" />{rk}
                  </li>
                ))}
              </ul>
            </CollapsibleSection>
          )}
        </div>

        {/* Right: Next Actions panel */}
        {(r.next_actions?.length ?? 0) > 0 && hasStructured && (
          <div className="lg:col-span-1">
            <div className="bg-card border border-border rounded-xl p-4 sticky top-6">
              <div className="flex items-center gap-1.5 mb-3">
                <ArrowRight className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Next Actions</span>
              </div>
              <div className="space-y-2">
                {(r.next_actions ?? []).map((a, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-foreground bg-blue-500/5 border border-blue-500/10 rounded-lg p-2.5">
                    <span className="w-4 h-4 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-[9px] font-bold shrink-0 mt-0.5">{i + 1}</span>
                    {a}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CollapsibleSection({ icon: SIcon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/30 transition-colors">
        <div className="flex items-center gap-2">
          <SIcon className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">{title}</span>
        </div>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
}
