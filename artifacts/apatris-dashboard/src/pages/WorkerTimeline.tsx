import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { authHeaders, BASE, formatDate } from "@/lib/api";
import {
  Clock, FileSignature, FileCheck, Shield, Calculator, ClipboardCheck,
  Users, Search, Loader2, ChevronDown, ChevronUp, ArrowLeft, MapPin, ExternalLink,
} from "lucide-react";

const CATEGORY_CONFIG: Record<string, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  worker:     { icon: Users,         color: "text-blue-400",    bg: "bg-blue-500/10 border-blue-500/20",    label: "Worker" },
  contract:   { icon: FileSignature, color: "text-violet-400",  bg: "bg-violet-500/10 border-violet-500/20", label: "Contract" },
  document:   { icon: FileCheck,     color: "text-cyan-400",    bg: "bg-cyan-500/10 border-cyan-500/20",     label: "Document" },
  compliance: { icon: Shield,        color: "text-amber-400",   bg: "bg-amber-500/10 border-amber-500/20",   label: "Compliance" },
  payroll:    { icon: Calculator,    color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20", label: "Payroll" },
  onboarding: { icon: ClipboardCheck, color: "text-rose-400",   bg: "bg-rose-500/10 border-rose-500/20",     label: "Onboarding" },
};

const STATUS_BADGE: Record<string, string> = {
  active: "bg-emerald-900/40 text-emerald-400", approved: "bg-emerald-900/40 text-emerald-400",
  completed: "bg-emerald-900/40 text-emerald-400", resolved: "bg-emerald-900/40 text-emerald-400",
  signed: "bg-emerald-900/40 text-emerald-400", draft: "bg-slate-700 text-slate-300",
  pending_signature: "bg-amber-900/40 text-amber-400", pending: "bg-amber-900/40 text-amber-400",
  in_progress: "bg-blue-900/40 text-blue-400",
  rejected: "bg-red-900/40 text-red-400", expired: "bg-red-900/40 text-red-400",
  terminated: "bg-red-900/40 text-red-400", RED: "bg-red-900/40 text-red-400",
  YELLOW: "bg-amber-900/40 text-amber-400", GREEN: "bg-emerald-900/40 text-emerald-400",
};

interface TimelineEvent {
  date: string; type: string; category: string; description: string; source: string; status?: string;
}

interface Worker {
  id: string; name: string; specialization: string; site: string;
}

export default function WorkerTimeline() {
  const [, setLocation] = useLocation();
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  // Always fetch worker list
  const { data: workers = [], isLoading: loadingWorkers } = useQuery<Worker[]>({
    queryKey: ["timeline-workers"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/workers`, { headers: authHeaders() });
      if (!res.ok) return [];
      const json = await res.json();
      return (json.workers ?? []).map((w: any) => ({
        id: w.id,
        name: w.name ?? w.full_name ?? "",
        specialization: w.specialization ?? "",
        site: w.assignedSite ?? w.assigned_site ?? "",
      }));
    },
  });

  // Timeline for selected worker
  const { data: timeline, isLoading: loadingTimeline } = useQuery<{ events: TimelineEvent[]; count: number }>({
    queryKey: ["worker-timeline", selectedWorker?.id],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/timeline/${selectedWorker!.id}`, { headers: authHeaders() });
      if (!res.ok) return { events: [], count: 0 };
      return res.json();
    },
    enabled: !!selectedWorker,
  });

  const events = timeline?.events ?? [];
  const filtered = filterCat === "all" ? events : events.filter(e => e.category === filterCat);
  const categories = [...new Set(events.map(e => e.category))];
  const filteredWorkers = search
    ? workers.filter(w => w.name.toLowerCase().includes(search.toLowerCase()) || w.specialization.toLowerCase().includes(search.toLowerCase()))
    : workers;

  // ── WORKER LIST VIEW ──────────────────────────────────────────────────
  if (!selectedWorker) {
    return (
      <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
        <div className="max-w-3xl mx-auto space-y-5">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Clock className="w-6 h-6 text-primary" /> Worker Timeline
            </h1>
            <p className="text-muted-foreground text-sm mt-1">Select a worker to view their chronological history</p>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or specialization..."
              className="w-full pl-10 pr-4 py-2.5 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
            />
          </div>

          {loadingWorkers ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : filteredWorkers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">No workers found.</div>
          ) : (
            <div className="space-y-1.5">
              {filteredWorkers.map(w => (
                <button
                  key={w.id}
                  onClick={() => { setSelectedWorker(w); setFilterCat("all"); setExpanded(new Set()); }}
                  className="w-full text-left px-4 py-3 bg-card border border-border rounded-lg hover:border-primary/40 hover:bg-muted/30 transition-all flex items-center gap-3"
                >
                  <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                    {w.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{w.name}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                      <span>{w.specialization || "General"}</span>
                      {w.site && <span className="flex items-center gap-0.5"><MapPin className="w-2.5 h-2.5" />{w.site}</span>}
                    </div>
                  </div>
                  <ChevronDown className="w-4 h-4 text-muted-foreground -rotate-90 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── TIMELINE VIEW ─────────────────────────────────────────────────────
  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="max-w-3xl mx-auto space-y-5">
        {/* Header with back button */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSelectedWorker(null)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-card border border-border rounded-lg text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> All Workers
          </button>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-foreground">{selectedWorker.name}</h2>
            <p className="text-xs text-muted-foreground">{selectedWorker.specialization}{selectedWorker.site ? ` · ${selectedWorker.site}` : ""}</p>
          </div>
          <span className="px-3 py-1 bg-card border border-border rounded-lg text-xs font-mono text-muted-foreground">
            {events.length} events
          </span>
        </div>

        {/* Category filters */}
        {events.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            <button onClick={() => setFilterCat("all")}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-colors ${filterCat === "all" ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border hover:text-foreground"}`}>
              All ({events.length})
            </button>
            {categories.map(cat => {
              const cfg = CATEGORY_CONFIG[cat] ?? CATEGORY_CONFIG.worker;
              const count = events.filter(e => e.category === cat).length;
              return (
                <button key={cat} onClick={() => setFilterCat(cat)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-colors ${filterCat === cat ? `${cfg.bg} ${cfg.color}` : "bg-card text-muted-foreground border-border hover:text-foreground"}`}>
                  {cfg.label} ({count})
                </button>
              );
            })}
          </div>
        )}

        {/* Loading */}
        {loadingTimeline && (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        )}

        {/* Empty */}
        {!loadingTimeline && events.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <Clock className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="font-medium">No timeline events found</p>
            <p className="text-xs mt-1">Events appear as contracts, documents, payroll, and compliance actions are recorded</p>
          </div>
        )}

        {/* Timeline */}
        {filtered.length > 0 && (
          <div className="relative">
            <div className="absolute left-5 top-0 bottom-0 w-px bg-border" />
            <div className="space-y-0">
              {filtered.map((evt, i) => {
                const cfg = CATEGORY_CONFIG[evt.category] ?? CATEGORY_CONFIG.worker;
                const Icon = cfg.icon;
                const isExpanded = expanded.has(i);
                return (
                  <div key={i} className="relative flex gap-4 py-3 group">
                    <div className={`relative z-10 w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${cfg.bg}`}>
                      <Icon className={`w-4 h-4 ${cfg.color}`} />
                    </div>
                    <div className="flex-1 min-w-0 pt-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm text-foreground leading-snug">{evt.description}</p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className="text-[10px] text-muted-foreground font-mono">{formatDate(evt.date)}</span>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.color} uppercase tracking-wider`}>{cfg.label}</span>
                            {evt.status && (
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${STATUS_BADGE[evt.status] ?? "bg-slate-700 text-slate-300"}`}>
                                {evt.status.replace(/_/g, " ")}
                              </span>
                            )}
                            {/* Action links for actionable events */}
                            {evt.type === "contract_generated" && evt.status === "draft" && (
                              <button onClick={() => setLocation("/contract-gen")}
                                className="inline-flex items-center gap-1 text-[9px] font-bold text-violet-400 hover:text-violet-300 transition-colors">
                                <ExternalLink className="w-2.5 h-2.5" /> Open Draft
                              </button>
                            )}
                            {evt.type === "contract_created" && evt.status === "draft" && (
                              <button onClick={() => setLocation("/contracts")}
                                className="inline-flex items-center gap-1 text-[9px] font-bold text-violet-400 hover:text-violet-300 transition-colors">
                                <ExternalLink className="w-2.5 h-2.5" /> View Contract
                              </button>
                            )}
                            {(evt.type === "document_uploaded" || evt.type === "document_approved" || evt.type === "document_rejected") && (
                              <button onClick={() => setLocation("/doc-workflow")}
                                className="inline-flex items-center gap-1 text-[9px] font-bold text-cyan-400 hover:text-cyan-300 transition-colors">
                                <ExternalLink className="w-2.5 h-2.5" /> View Document
                              </button>
                            )}
                          </div>
                        </div>
                        <button onClick={() => setExpanded(prev => { const next = new Set(prev); next.has(i) ? next.delete(i) : next.add(i); return next; })}
                          className="p-1 text-muted-foreground hover:text-foreground transition-colors shrink-0">
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                      {isExpanded && (
                        <div className="mt-2 text-xs text-muted-foreground bg-muted/30 rounded-lg p-3 border border-border">
                          <div className="grid grid-cols-2 gap-2">
                            <div><span className="font-medium">Source:</span> {evt.source.replace(/_/g, " ")}</div>
                            <div><span className="font-medium">Type:</span> {evt.type.replace(/_/g, " ")}</div>
                            <div><span className="font-medium">Date:</span> {evt.date ? new Date(evt.date).toLocaleString("en-GB") : "—"}</div>
                            {evt.status && <div><span className="font-medium">Status:</span> {evt.status}</div>}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
