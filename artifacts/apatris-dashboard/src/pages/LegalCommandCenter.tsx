/**
 * Legal Command Center — 3-panel real-time legal operations cockpit.
 *
 * Left:   Worker queue (urgency-sorted)
 * Center: Active case workspace (LegalStatusPanel + MOS + toolkit tabs)
 * Right:  SSE intelligence ticker (real-time events)
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { authHeaders, BASE } from "@/lib/api";
import { LegalStatusPanel } from "@/components/LegalStatusPanel";
import {
  Shield, Users, XOctagon, AlertTriangle, CheckCircle2, Loader2, Stamp,
  Scale, FileSignature, Brain, ChevronRight, Radio, Zap, Search,
} from "lucide-react";

// ═══ WORKER CLASSIFICATION (reused from Client View) ═══════════════════════

type WorkerGroup = "critical" | "attention" | "ok";

function classifyWorker(w: any): { group: WorkerGroup; message: string } {
  const now = Date.now();
  const trcExp = w.trc_expiry ? new Date(w.trc_expiry).getTime() : null;
  const wpExp = w.work_permit_expiry ? new Date(w.work_permit_expiry).getTime() : null;
  const nearest = [trcExp, wpExp].filter(Boolean).sort()[0] as number | undefined;

  if (nearest && nearest < now) {
    return { group: "critical", message: `Permit expired ${Math.ceil((now - nearest) / 86_400_000)}d ago` };
  }
  if (nearest && nearest < now + 60 * 86_400_000) {
    return { group: "attention", message: `Expires in ${Math.ceil((nearest - now) / 86_400_000)}d` };
  }
  return { group: "ok", message: "Clear" };
}

const GROUP_STYLE = {
  critical: { color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20", icon: XOctagon },
  attention: { color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20", icon: AlertTriangle },
  ok: { color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20", icon: CheckCircle2 },
} as const;

// ═══ SSE HOOK ═══════════════════════════════════════════════════════════════

interface TickerEvent {
  type: string;
  workerId?: string;
  workerName?: string;
  message?: string;
  timestamp: string;
}

function useSSEStream(): TickerEvent[] {
  const [events, setEvents] = useState<TickerEvent[]>([]);
  const retryRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    let source: EventSource | null = null;

    function connect() {
      const token = localStorage.getItem("apatris_jwt");
      source = new EventSource(`${BASE}api/intelligence/stream?token=${token}`);

      source.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === "connected") return;
          setEvents(prev => [data, ...prev].slice(0, 50));
        } catch { /* ignore */ }
      };

      source.onerror = () => {
        source?.close();
        retryRef.current = setTimeout(connect, 5000);
      };
    }

    connect();
    return () => { source?.close(); clearTimeout(retryRef.current); };
  }, []);

  return events;
}

// ═══ TOOLKIT TABS ═══════════════════════════════════════════════════════════

type ToolkitTab = "appeal" | "authority" | "reasoning";

function AppealDraftingTab({ snapshot }: { snapshot: any }) {
  const [draft, setDraft] = useState("");
  const basis = snapshot?.appealBasis ?? [];
  const deadline = snapshot?.appealDeadlineNote;

  return (
    <div className="space-y-3">
      <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Appeal Drafting</p>
      {basis.length > 0 ? (
        <>
          <div className="space-y-1">
            {basis.map((b: string, i: number) => (
              <div key={i} className="flex items-start gap-1.5 text-[11px] text-purple-300/90">
                <span className="text-purple-400/60 mt-0.5">-</span><span>{b}</span>
              </div>
            ))}
          </div>
          {deadline && <p className="text-[10px] text-amber-300/80 bg-amber-500/5 rounded px-2 py-1.5">{deadline}</p>}
          <textarea
            value={draft} onChange={e => setDraft(e.target.value)}
            placeholder="Draft your appeal text here..."
            rows={6}
            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-slate-500 resize-none"
          />
        </>
      ) : (
        <p className="text-xs text-slate-600 py-4">No appeal basis available for this worker. Appeal drafting is only relevant when a rejection decision exists.</p>
      )}
    </div>
  );
}

function AuthorityLettersTab({ snapshot }: { snapshot: any }) {
  const ctx = snapshot?.authorityDraftContext;
  if (!ctx) return <p className="text-xs text-slate-600 py-4">No authority draft context available. This section activates for non-VALID legal statuses.</p>;

  return (
    <div className="space-y-3">
      <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Authority Letter Context</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px]">
        {ctx.workerName && <div><span className="text-slate-500">Worker:</span> <span className="text-white">{ctx.workerName}</span></div>}
        {ctx.employerName && <div><span className="text-slate-500">Employer:</span> <span className="text-white">{ctx.employerName}</span></div>}
        {ctx.caseReference && <div><span className="text-slate-500">Case Ref:</span> <span className="text-white font-mono">{ctx.caseReference}</span></div>}
        {ctx.documentType && <div><span className="text-slate-500">Doc Type:</span> <span className="text-white">{ctx.documentType}</span></div>}
        <div><span className="text-slate-500">Status:</span> <span className="text-white">{ctx.currentStatus?.replace(/_/g, " ")}</span></div>
        {ctx.decisionOutcome && <div><span className="text-slate-500">Decision:</span> <span className="text-red-400 font-medium">{ctx.decisionOutcome}</span></div>}
      </div>
      {ctx.keyFacts?.length > 0 && (
        <div>
          <p className="text-[9px] text-slate-500 uppercase font-bold mb-1">Key Facts</p>
          {ctx.keyFacts.map((f: string, i: number) => (
            <p key={i} className="text-[10px] text-slate-300 ml-2">· {f}</p>
          ))}
        </div>
      )}
      {ctx.nextAuthorityActions?.length > 0 && (
        <div>
          <p className="text-[9px] text-slate-500 uppercase font-bold mb-1">Next Authority Actions</p>
          {ctx.nextAuthorityActions.map((a: string, i: number) => (
            <p key={i} className="text-[10px] text-blue-300/80 ml-2">{i + 1}. {a}</p>
          ))}
        </div>
      )}
    </div>
  );
}

function LegalReasoningTab({ snapshot }: { snapshot: any }) {
  const trace = snapshot?.decisionTrace ?? [];
  const inputs = snapshot?.trustedInputs ?? [];

  return (
    <div className="space-y-3">
      <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Legal Reasoning</p>
      {trace.length > 0 && (
        <div>
          <p className="text-[9px] text-slate-500 uppercase font-bold mb-1">Decision Trace</p>
          <div className="space-y-1">
            {trace.map((t: any, i: number) => (
              <div key={i} className="flex items-center gap-2 text-[10px]">
                <span className="text-slate-400 w-24 flex-shrink-0">{t.field?.replace(/_/g, " ")}</span>
                <span className="text-white font-mono">{t.value}</span>
                <span className="text-slate-500">&larr;</span>
                <span className={`px-1 py-px rounded text-[9px] font-bold ${
                  t.origin === "approved_document" ? "bg-emerald-500/15 text-emerald-400" :
                  t.origin === "immigration_permit" ? "bg-blue-500/15 text-blue-400" :
                  "bg-slate-500/15 text-slate-400"
                }`}>{t.origin?.replace(/_/g, " ")}</span>
                {t.overriddenBy && <span className="text-[9px] text-amber-500/70 italic">overrode</span>}
              </div>
            ))}
          </div>
        </div>
      )}
      {inputs.length > 0 && (
        <div>
          <p className="text-[9px] text-slate-500 uppercase font-bold mb-1">Trusted Inputs</p>
          <div className="flex flex-wrap gap-1">
            {inputs.map((ti: any, i: number) => (
              <span key={i} className="inline-flex items-center gap-1 text-[9px] bg-emerald-500/10 border border-emerald-500/15 text-emerald-300 rounded px-1.5 py-0.5">
                <span className="font-bold">{ti.field?.replace(/_/g, " ")}:</span>
                <span>{ti.value}</span>
                {ti.source && <span className={`ml-0.5 px-0.5 rounded text-[8px] font-bold ${ti.source === "ai" ? "bg-blue-500/20 text-blue-300" : "bg-slate-500/20 text-slate-300"}`}>{ti.source === "ai" ? "AI" : "M"}</span>}
              </span>
            ))}
          </div>
        </div>
      )}
      {trace.length === 0 && inputs.length === 0 && (
        <p className="text-xs text-slate-600 py-4">No decision trace or trusted inputs available for this worker.</p>
      )}
    </div>
  );
}

// ═══ MAIN COMPONENT ═════════════════════════════════════════════════════════

export default function LegalCommandCenter() {
  const searchStr = useSearch();
  const params = new URLSearchParams(searchStr);
  const initialWorkerId = params.get("workerId");
  const initialTab = (params.get("tab") as ToolkitTab) || "appeal";

  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(initialWorkerId);
  const [toolkitTab, setToolkitTab] = useState<ToolkitTab>(initialTab);
  const [queueFilter, setQueueFilter] = useState("");
  const tickerEvents = useSSEStream();

  // Update URL on state change
  useEffect(() => {
    const p = new URLSearchParams();
    if (selectedWorkerId) p.set("workerId", selectedWorkerId);
    if (toolkitTab !== "appeal") p.set("tab", toolkitTab);
    const qs = p.toString();
    const newUrl = `/command-center${qs ? `?${qs}` : ""}`;
    if (window.location.pathname + window.location.search !== newUrl) {
      window.history.replaceState(null, "", newUrl);
    }
  }, [selectedWorkerId, toolkitTab]);

  // Fetch workers
  const { data: workersRaw, isLoading: workersLoading } = useQuery({
    queryKey: ["cmd-workers"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/workers`, { headers: authHeaders() });
      if (!r.ok) return [];
      const j = await r.json();
      return (j.workers ?? j ?? []).map((w: any) => ({
        id: w.id,
        full_name: w.name ?? w.full_name,
        specialization: w.specialization,
        assigned_site: w.assignedSite ?? w.assigned_site,
        trc_expiry: w.trcExpiry ?? w.trc_expiry,
        work_permit_expiry: w.workPermitExpiry ?? w.work_permit_expiry,
      }));
    },
  });

  const workers = useMemo(() => {
    const ws = (workersRaw ?? []).map((w: any) => ({ ...w, ...classifyWorker(w) }));
    ws.sort((a, b) => {
      const order = { critical: 0, attention: 1, ok: 2 };
      return order[a.group] - order[b.group];
    });
    return ws;
  }, [workersRaw]);

  const filteredWorkers = queueFilter
    ? workers.filter((w: any) => w.full_name?.toLowerCase().includes(queueFilter.toLowerCase()))
    : workers;

  // Fetch legal status for selected worker
  const { data: legalStatus, isLoading: statusLoading } = useQuery({
    queryKey: ["cmd-legal-status", selectedWorkerId],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/workers/${selectedWorkerId}/legal-status`, { headers: authHeaders() });
      if (!r.ok) return null;
      return r.json();
    },
    enabled: !!selectedWorkerId,
  });

  // MOS generation
  const [mosLoading, setMosLoading] = useState(false);
  const [mosResult, setMosResult] = useState<any>(null);

  const generateMOS = useCallback(async () => {
    if (!selectedWorkerId) return;
    setMosLoading(true);
    try {
      const r = await fetch(`${BASE}api/workers/${selectedWorkerId}/mos-package`, { method: "POST", headers: authHeaders() });
      if (!r.ok) throw new Error("Failed");
      setMosResult(await r.json());
    } catch { setMosResult({ error: true }); }
    setMosLoading(false);
  }, [selectedWorkerId]);

  // Reset MOS when worker changes
  useEffect(() => { setMosResult(null); }, [selectedWorkerId]);

  const TOOLKIT_TABS: { key: ToolkitTab; label: string; icon: any }[] = [
    { key: "appeal", label: "Appeal Drafting", icon: Scale },
    { key: "authority", label: "Authority Letters", icon: FileSignature },
    { key: "reasoning", label: "Legal Reasoning", icon: Brain },
  ];

  return (
    <div className="h-screen flex flex-col bg-slate-950 text-slate-200 overflow-hidden">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-900/50 px-4 py-3 flex items-center gap-3 flex-shrink-0">
        <div className="w-8 h-8 rounded-lg bg-[#C41E18]/10 border border-[#C41E18]/30 flex items-center justify-center">
          <Zap className="w-4 h-4 text-[#C41E18]" />
        </div>
        <div>
          <h1 className="text-sm font-bold text-white">Legal Command Center</h1>
          <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">Real-Time Operations</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Radio className={`w-3 h-3 ${tickerEvents.length > 0 ? "text-emerald-400 animate-pulse" : "text-slate-600"}`} />
          <span className="text-[10px] text-slate-500">{tickerEvents.length > 0 ? "LIVE" : "WAITING"}</span>
        </div>
      </div>

      {/* 3-Panel Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── LEFT: Worker Queue ──────────────────────────────────────────── */}
        <div className="w-64 border-r border-slate-800 flex flex-col flex-shrink-0 bg-slate-900/30">
          <div className="px-3 py-2 border-b border-slate-800">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
              <input
                type="text" value={queueFilter} onChange={e => setQueueFilter(e.target.value)}
                placeholder="Filter workers..."
                className="w-full pl-7 pr-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-[10px] text-white placeholder:text-slate-600 focus:outline-none"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {workersLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-4 h-4 text-slate-600 animate-spin" /></div>
            ) : (
              filteredWorkers.map((w: any) => {
                const style = GROUP_STYLE[w.group as WorkerGroup];
                const Icon = style.icon;
                const isActive = selectedWorkerId === w.id;
                return (
                  <button
                    key={w.id}
                    onClick={() => setSelectedWorkerId(w.id)}
                    className={`w-full text-left px-3 py-2.5 border-b border-slate-800/50 transition-colors ${
                      isActive ? "bg-[#C41E18]/10 border-l-2 border-l-[#C41E18]" : "hover:bg-slate-800/50 border-l-2 border-l-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className={`w-3 h-3 ${style.color} flex-shrink-0`} />
                      <div className="min-w-0">
                        <p className={`text-[11px] font-semibold truncate ${isActive ? "text-white" : "text-slate-300"}`}>{w.full_name}</p>
                        <p className="text-[9px] text-slate-500 truncate">{w.message}</p>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
          <div className="px-3 py-2 border-t border-slate-800 text-[9px] text-slate-600">
            {workers.filter((w: any) => w.group === "critical").length} critical · {workers.filter((w: any) => w.group === "attention").length} attention · {workers.filter((w: any) => w.group === "ok").length} ok
          </div>
        </div>

        {/* ── CENTER: Workspace ───────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          {!selectedWorkerId ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-600">
              <Users className="w-8 h-8 mb-2" />
              <p className="text-sm">Select a worker from the queue</p>
              <p className="text-[10px] mt-1">Click a worker on the left to view their legal status</p>
            </div>
          ) : statusLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 text-slate-600 animate-spin" /></div>
          ) : (
            <div className="p-4 space-y-4 max-w-3xl">
              {/* Worker header */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-white">{legalStatus?.workerName ?? "Worker"}</h2>
                  <p className="text-[10px] text-slate-500">
                    {workers.find((w: any) => w.id === selectedWorkerId)?.assigned_site ?? ""} ·{" "}
                    {workers.find((w: any) => w.id === selectedWorkerId)?.specialization ?? ""}
                  </p>
                </div>
                {/* MOS Generate */}
                <div className="flex items-center gap-2">
                  {mosResult && !mosResult.error ? (
                    <span className={`px-2 py-1 rounded text-[10px] font-bold ${
                      mosResult.mosReadiness === "ready" ? "bg-emerald-500/20 text-emerald-400" :
                      mosResult.mosReadiness === "needs_attention" ? "bg-amber-500/20 text-amber-400" :
                      "bg-red-500/20 text-red-400"
                    }`}>MOS: {mosResult.mosReadiness?.toUpperCase()}</span>
                  ) : (
                    <button
                      onClick={generateMOS} disabled={mosLoading}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-[#C41E18]/10 border border-[#C41E18]/30 text-[10px] font-bold text-[#C41E18] hover:bg-[#C41E18]/20 disabled:opacity-50"
                    >
                      {mosLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Stamp className="w-3 h-3" />}
                      {mosLoading ? "Generating..." : "Generate MOS"}
                    </button>
                  )}
                </div>
              </div>

              {/* Legal Status Panel */}
              {legalStatus && <LegalStatusPanel snapshot={legalStatus} />}

              {/* Toolkit Tabs */}
              <div className="border-t border-slate-800 pt-3">
                <div className="flex gap-1 mb-3">
                  {TOOLKIT_TABS.map(t => {
                    const TIcon = t.icon;
                    return (
                      <button
                        key={t.key}
                        onClick={() => setToolkitTab(t.key)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-colors ${
                          toolkitTab === t.key
                            ? "bg-slate-800 text-white border border-slate-700"
                            : "text-slate-500 hover:text-slate-300"
                        }`}
                      >
                        <TIcon className="w-3 h-3" /> {t.label}
                      </button>
                    );
                  })}
                </div>
                <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
                  {toolkitTab === "appeal" && <AppealDraftingTab snapshot={legalStatus} />}
                  {toolkitTab === "authority" && <AuthorityLettersTab snapshot={legalStatus} />}
                  {toolkitTab === "reasoning" && <LegalReasoningTab snapshot={legalStatus} />}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT: SSE Intelligence Ticker ──────────────────────────────── */}
        <div className="w-56 border-l border-slate-800 flex flex-col flex-shrink-0 bg-slate-900/30">
          <div className="px-3 py-2 border-b border-slate-800 flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Intelligence</span>
            <Radio className={`w-3 h-3 ${tickerEvents.length > 0 ? "text-emerald-400" : "text-slate-700"}`} />
          </div>
          <div className="flex-1 overflow-y-auto">
            {tickerEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-slate-700">
                <Radio className="w-5 h-5 mb-2" />
                <p className="text-[10px]">Waiting for events...</p>
                <p className="text-[9px] mt-1">Actions will appear here in real-time</p>
              </div>
            ) : (
              tickerEvents.map((ev, i) => {
                const color = ev.type === "doc_verified" ? "text-emerald-400" : ev.type === "mos_ready" ? "text-blue-400" : "text-amber-400";
                const bgColor = ev.type === "doc_verified" ? "bg-emerald-500/5" : ev.type === "mos_ready" ? "bg-blue-500/5" : "bg-amber-500/5";
                return (
                  <div key={i} className={`px-3 py-2 border-b border-slate-800/50 ${bgColor}`}>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${color.replace("text-", "bg-")}`} />
                      <span className={`text-[9px] font-bold uppercase ${color}`}>{ev.type?.replace(/_/g, " ")}</span>
                    </div>
                    {ev.workerName && <p className="text-[10px] text-white font-medium">{ev.workerName}</p>}
                    <p className="text-[9px] text-slate-400">{ev.message}</p>
                    <p className="text-[8px] text-slate-600 mt-0.5">{new Date(ev.timestamp).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</p>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
