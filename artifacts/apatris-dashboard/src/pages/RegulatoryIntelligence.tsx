import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Scale, AlertTriangle, Info, RefreshCw, ExternalLink,
  CheckCircle, ChevronDown, ChevronUp, Shield,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

const BASE = import.meta.env.BASE_URL;

interface RegulatoryUpdate {
  id: string;
  source: string;
  title: string;
  summary: string;
  category: string;
  severity: string;
  fine_amount?: string;
  workers_affected?: number;
  cost_impact?: string;
  action_required?: string[];
  source_urls?: { url: string; title?: string }[];
  fetched_at?: string;
  read_by_admin?: boolean;
}

const CATEGORIES = [
  { id: "all", label: "All", labelPl: "Wszystko" },
  { id: "work_permits", label: "Work Permits", labelPl: "Pozwolenia" },
  { id: "zus", label: "ZUS", labelPl: "ZUS" },
  { id: "labor_law", label: "Labor Law", labelPl: "Prawo Pracy" },
  { id: "eu_law", label: "EU Law", labelPl: "Prawo UE" },
  { id: "fines", label: "Fines", labelPl: "Kary" },
  { id: "reporting", label: "Reporting", labelPl: "Raportowanie" },
];

export default function RegulatoryIntelligence() {
  const { t, i18n } = useTranslation();
  const isPl = i18n.language?.startsWith("pl");
  const { toast } = useToast();
  const [updates, setUpdates] = useState<RegulatoryUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [category, setCategory] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => { loadUpdates(); }, [category]);

  function loadUpdates() {
    setLoading(true);
    const q = category !== "all" ? `?category=${category}` : "";
    fetch(`${BASE}api/regulatory/updates${q}`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => setUpdates(d.updates ?? []))
      .catch((err) => {
        console.error("[RegulatoryIntelligence] Failed to load updates:", err);
        setUpdates([]);
        toast({ title: isPl ? "Blad" : "Error", description: isPl ? "Nie udalo sie zaladowac aktualizacji regulacyjnych" : "Failed to load regulatory updates", variant: "destructive" });
      })
      .finally(() => setLoading(false));
  }

  async function handleScan() {
    setScanning(true);
    try {
      await fetch(`${BASE}api/regulatory/scan`, { method: "POST", headers: authHeaders() });
      loadUpdates();
    } catch (err) {
      console.error("[RegulatoryIntelligence] Scan failed:", err);
      toast({ title: isPl ? "Skanowanie nieudane" : "Scan Failed", description: isPl ? "Nie udalo sie przeprowadzic skanowania regulacyjnego" : "Failed to run regulatory scan. Please try again.", variant: "destructive" });
    }
    setScanning(false);
  }

  async function markRead(id: string) {
    try {
      await fetch(`${BASE}api/regulatory/updates/${id}/read`, { method: "PATCH", headers: authHeaders() });
      setUpdates((prev) => prev.map((u) => (u.id === id ? { ...u, read_by_admin: true } : u)));
    } catch (err) {
      console.error("[RegulatoryIntelligence] Failed to mark as read:", err);
    }
  }

  const critical = updates.filter((u) => u.severity === "critical").length;
  const warning = updates.filter((u) => u.severity === "warning").length;

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Shield className="w-6 h-6 text-primary" />
              {isPl ? "Monitoring Regulacyjny" : "Regulatory Intelligence"}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {isPl ? "Monitorowanie zmian w polskim prawie pracy" : "Polish labor law change monitoring"}
            </p>
          </div>
          <button
            onClick={handleScan}
            disabled={scanning}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 disabled:opacity-50 transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${scanning ? "animate-spin" : ""}`} />
            {scanning ? (isPl ? "Skanowanie..." : "Scanning...") : (isPl ? "Skanuj teraz" : "Scan Now")}
          </button>
        </div>

        {/* Severity summary */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-center">
            <div className="text-2xl font-black text-red-400">{critical}</div>
            <div className="text-xs text-red-400 font-medium mt-1">{isPl ? "Krytyczne" : "Critical"}</div>
          </div>
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-center">
            <div className="text-2xl font-black text-amber-400">{warning}</div>
            <div className="text-xs text-amber-400 font-medium mt-1">{isPl ? "Ostrzezenia" : "Warnings"}</div>
          </div>
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 text-center">
            <div className="text-2xl font-black text-blue-400">{updates.length}</div>
            <div className="text-xs text-blue-400 font-medium mt-1">{isPl ? "Lacznie" : "Total"}</div>
          </div>
        </div>

        {/* Category filter */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                category === c.id
                  ? "bg-primary text-white border-primary"
                  : "bg-card text-muted-foreground border-border hover:border-primary/50"
              }`}
            >
              {isPl ? c.labelPl : c.label}
            </button>
          ))}
        </div>

        {/* Updates list */}
        {loading && (
          <div className="text-center py-12 text-muted-foreground">
            {isPl ? "Ladowanie aktualizacji..." : "Loading updates..."}
          </div>
        )}

        {!loading && updates.length === 0 && (
          <div className="text-center py-12">
            <Scale className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">
              {isPl ? "Brak aktualizacji regulacyjnych" : "No regulatory updates"}
            </p>
            <p className="text-muted-foreground text-xs mt-1">
              {isPl ? 'Kliknij "Skanuj teraz" aby sprawdzic' : 'Tap "Scan Now" to check for changes'}
            </p>
          </div>
        )}

        {updates.map((u) => {
          const expanded = expandedId === u.id;
          const actionRequired = Array.isArray(u.action_required) ? u.action_required : [];
          const sourceUrls = Array.isArray(u.source_urls) ? u.source_urls : [];

          return (
            <div
              key={u.id}
              onClick={() => {
                setExpandedId(expanded ? null : u.id);
                if (!u.read_by_admin) markRead(u.id);
              }}
              className={`bg-card border rounded-xl p-4 mb-3 cursor-pointer transition-all hover:border-primary/30 ${
                u.severity === "critical" ? "border-red-500/30" : u.severity === "warning" ? "border-amber-500/30" : "border-border"
              } ${u.read_by_admin ? "opacity-70" : ""}`}
            >
              <div className="flex gap-3 items-start">
                <SeverityIcon severity={u.severity} />
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start gap-2">
                    <div className="font-bold text-sm text-foreground">{u.title}</div>
                    {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {u.source} · {u.category?.replace("_", " ")}
                    {u.read_by_admin && <CheckCircle className="w-3 h-3 inline ml-2 text-muted-foreground" />}
                  </div>
                </div>
              </div>

              <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
                {expanded ? u.summary : (u.summary?.slice(0, 150) + ((u.summary?.length ?? 0) > 150 ? "..." : ""))}
              </p>

              {expanded && (
                <div className="mt-4 space-y-3 border-t border-border pt-3">
                  {u.fine_amount && (
                    <div className="text-xs"><span className="text-red-400 font-bold">{isPl ? "Kara:" : "Fine:"}</span> {u.fine_amount}</div>
                  )}
                  {(u.workers_affected ?? 0) > 0 && (
                    <div className="text-xs"><span className="font-bold text-foreground">{isPl ? "Dotyczy pracownikow:" : "Workers Affected:"}</span> {u.workers_affected}</div>
                  )}
                  {u.cost_impact && (
                    <div className="text-xs"><span className="font-bold text-foreground">{isPl ? "Wplyw kosztow:" : "Cost Impact:"}</span> {u.cost_impact}</div>
                  )}
                  {actionRequired.length > 0 && (
                    <div>
                      <div className="text-xs font-bold text-foreground mb-1">{isPl ? "Wymagane dzialania:" : "Action Required:"}</div>
                      {actionRequired.map((a: string, i: number) => (
                        <div key={i} className="text-xs text-muted-foreground pl-2 border-l-2 border-primary mb-1">{a}</div>
                      ))}
                    </div>
                  )}
                  {sourceUrls.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {sourceUrls.map((s: any, i: number) => (
                        <a
                          key={i}
                          href={s.url}
                          target="_blank"
                          rel="noopener"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 bg-blue-500/10 px-2 py-1 rounded"
                        >
                          <ExternalLink className="w-3 h-3" /> {s.title ?? "Source"}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {u.fetched_at && (
                <div className="text-[11px] text-muted-foreground mt-2">
                  {new Date(u.fetched_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SeverityIcon({ severity }: { severity: string }) {
  if (severity === "critical")
    return <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center flex-shrink-0"><AlertTriangle className="w-4 h-4 text-red-400" /></div>;
  if (severity === "warning")
    return <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0"><AlertTriangle className="w-4 h-4 text-amber-400" /></div>;
  return <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0"><Info className="w-4 h-4 text-blue-400" /></div>;
}
