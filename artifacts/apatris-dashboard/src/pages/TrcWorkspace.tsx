/**
 * TRC Case Workspace — structured task tracking, document linking,
 * AI guidance, readiness scoring, and timeline for TRC cases.
 */

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { authHeaders, BASE } from "@/lib/api";
import { ContextUpload } from "@/components/ContextUpload";
import {
  PageShell, PageHeader, pageContentCls, sectionGap, cardCls,
} from "@/components/ui/layout";
import {
  FileText, CheckCircle2, Circle, Clock, Loader2, Send, Sparkles,
  AlertTriangle, Upload, ChevronRight, Shield, Building2
} from "lucide-react";

interface CaseTask {
  id: string; task_key: string; label: string; status: string;
  required: boolean; linked_document_id: string | null; notes: string | null; updated_at: string;
}

interface CaseView {
  caseId: string; workerId: string; workerName: string; employerName: string | null;
  caseType: string; caseStatus: string; tasks: CaseTask[];
  readiness: string; readinessPercent: number;
  documents: Array<{ id: string; fileName: string; docType: string; status: string; createdAt: string }>;
  timeline: Array<{ date: string; action: string; detail: string }>;
}

export default function TrcWorkspace() {
  const searchStr = useSearch();
  const urlCaseId = new URLSearchParams(searchStr).get("caseId") ?? "";
  const [caseId, setCaseId] = useState(urlCaseId);
  const [caseIdInput, setCaseIdInput] = useState(urlCaseId);
  const qc = useQueryClient();

  // AI guidance
  const [guidancePrompt, setGuidancePrompt] = useState("");
  const [guidance, setGuidance] = useState<{ guidance: string; source: string } | null>(null);

  const { data, isLoading } = useQuery<{ caseView: CaseView }>({
    queryKey: ["trc-workspace", caseId],
    queryFn: () => fetch(`${BASE}/api/v1/legal/trc-workspace/${caseId}`, { headers: authHeaders() }).then(r => r.json()),
    enabled: !!caseId,
  });

  const view = data?.caseView;

  // Case intelligence (risks, articles, client report)
  const { data: intelData } = useQuery<{ workspace: any; intelligence: any }>({
    queryKey: ["trc-full-intel", caseId],
    queryFn: () => fetch(`${BASE}/api/v1/legal/trc-workspace/${caseId}/full-intelligence`, { headers: authHeaders() }).then(r => r.json()),
    enabled: !!caseId && !!view,
    staleTime: 60_000,
  });
  const intel = intelData?.intelligence;

  // Also fetch available cases to pick from
  const { data: casesData } = useQuery<{ cases: any[] }>({
    queryKey: ["all-legal-cases"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/legal/cases`, { headers: authHeaders() });
      if (!res.ok) return { cases: [] };
      return res.json();
    },
  });

  const updateTask = useMutation({
    mutationFn: async ({ taskId, status, notes }: { taskId: string; status: string; notes?: string }) => {
      const res = await fetch(`${BASE}/api/v1/legal/trc-workspace/task/${taskId}`, {
        method: "PATCH", headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ status, notes }),
      });
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["trc-workspace", caseId] }),
  });

  const askGuidance = useMutation({
    mutationFn: async (prompt: string) => {
      const res = await fetch(`${BASE}/api/v1/legal/trc-workspace/${caseId}/guidance`, {
        method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      return res.json();
    },
    onSuccess: (data) => setGuidance(data),
  });

  const readinessColor = view?.readiness === "READY_FOR_SUBMISSION" ? "text-green-400 bg-green-500/10 border-green-500/30"
    : view?.readiness === "IN_PROGRESS" ? "text-yellow-400 bg-yellow-500/10 border-yellow-500/30"
    : "text-red-400 bg-red-500/10 border-red-500/30";

  const taskIcon = (status: string) =>
    status === "completed" ? <CheckCircle2 className="w-4 h-4 text-green-400" /> :
    status === "in_progress" ? <Clock className="w-4 h-4 text-yellow-400" /> :
    <Circle className="w-4 h-4 text-slate-600" />;

  const cycleTaskStatus = (current: string) =>
    current === "not_started" ? "in_progress" : current === "in_progress" ? "completed" : "not_started";

  return (
    <PageShell>
      <PageHeader icon={Shield} title="TRC Case Workspace" subtitle="Tasks · Documents · Readiness · AI Guidance" />
      <div className={pageContentCls}>
        <div className={sectionGap}>

          {/* Case Selector */}
          {!caseId && (
            <div className={cardCls}>
              <h2 className="text-sm font-bold text-white mb-3">Select Case</h2>
              {(casesData?.cases ?? []).length > 0 ? (
                <div className="space-y-1.5">
                  {(casesData?.cases ?? []).slice(0, 15).map((c: any) => (
                    <button key={c.id} onClick={() => setCaseId(c.id)}
                      className="w-full text-left p-2.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-blue-500/30 transition-colors">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-white font-medium">{c.worker_name ?? "Worker"} — {c.case_type}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${c.status === "NEW" ? "bg-blue-500/20 text-blue-400 border-blue-500/30" : c.status === "PENDING" ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" : "bg-slate-600/20 text-slate-400 border-slate-500/30"}`}>{c.status}</span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-slate-500">No active cases found. Enter case ID directly:</p>
                  <div className="flex gap-2">
                    <input value={caseIdInput} onChange={e => setCaseIdInput(e.target.value)} placeholder="Case UUID" className="flex-1 bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm" />
                    <button onClick={() => setCaseId(caseIdInput)} disabled={!caseIdInput} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold disabled:opacity-50">Load</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {isLoading && caseId && (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-slate-500" /></div>
          )}

          {view && (
            <>
              {/* ── Case Header ── */}
              <div className={`${cardCls} border-blue-500/20`}>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h2 className="text-sm font-bold text-white">{view.workerName}</h2>
                    <p className="text-xs text-slate-400">{view.caseType} · {view.caseStatus}{view.employerName ? ` · ${view.employerName}` : ""}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase border ${readinessColor}`}>
                      {view.readiness.replace(/_/g, " ")}
                    </span>
                    <span className="text-xs font-mono text-slate-400">{view.readinessPercent}%</span>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{
                    width: `${view.readinessPercent}%`,
                    background: view.readinessPercent === 100 ? "#22c55e" : view.readinessPercent >= 50 ? "#eab308" : "#ef4444",
                  }} />
                </div>
                <button onClick={() => { setCaseId(""); setGuidance(null); }} className="text-[10px] text-slate-500 hover:text-white mt-2">Change case</button>
              </div>

              {/* ── Task Checklist ── */}
              <div className={cardCls}>
                <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Task Checklist</h3>
                <div className="space-y-1">
                  {view.tasks.map(t => (
                    <div key={t.id} className={`flex items-center gap-3 p-2 rounded-lg transition-colors ${t.status === "completed" ? "bg-green-500/5" : "bg-slate-900"} border border-slate-700/50`}>
                      <button onClick={() => updateTask.mutate({ taskId: t.id, status: cycleTaskStatus(t.status) })} className="flex-shrink-0">
                        {taskIcon(t.status)}
                      </button>
                      <div className="flex-1 min-w-0">
                        <span className={`text-xs font-medium ${t.status === "completed" ? "text-green-300 line-through" : "text-slate-300"}`}>{t.label}</span>
                        {t.required && t.status !== "completed" && <span className="ml-2 text-[9px] text-red-400 font-bold">REQUIRED</span>}
                      </div>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        t.status === "completed" ? "bg-green-500/20 text-green-400" :
                        t.status === "in_progress" ? "bg-yellow-500/20 text-yellow-400" :
                        "bg-slate-600/20 text-slate-500"
                      }`}>{t.status.replace(/_/g, " ")}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Document Upload ── */}
              <ContextUpload workerId={view.workerId} caseId={view.caseId} sourcePanel="legal_case" defaultDocType="supporting" />

              {/* ── Documents on File ── */}
              {view.documents.length > 0 && (
                <div className={cardCls}>
                  <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Documents ({view.documents.length})</h3>
                  <div className="space-y-1">
                    {view.documents.map(d => (
                      <div key={d.id} className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-900">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="w-3 h-3 text-blue-400 flex-shrink-0" />
                          <span className="text-slate-300 truncate">{d.fileName}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-[10px] text-slate-500">{d.docType}</span>
                          <span className="text-[10px] text-slate-500">{new Date(d.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── AI Guidance ── */}
              <div className={`${cardCls} border-purple-500/20`}>
                <h3 className="text-xs font-bold uppercase tracking-widest text-purple-400 mb-3 flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5" /> Case Guidance
                </h3>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {[
                    { label: "What's missing?", q: "What documents and tasks are still missing for this case?" },
                    { label: "Is it ready?", q: "Is this case ready for submission? What remains?" },
                    { label: "What next?", q: "What should I upload or do next for this case?" },
                  ].map(p => (
                    <button key={p.label} onClick={() => { setGuidancePrompt(p.q); askGuidance.mutate(p.q); }}
                      disabled={askGuidance.isPending}
                      className="px-2 py-1 rounded-lg text-[10px] font-bold bg-slate-900 border border-slate-700 text-slate-400 hover:text-purple-400 hover:border-purple-500/30 transition-colors disabled:opacity-50">
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input value={guidancePrompt} onChange={e => setGuidancePrompt(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && guidancePrompt.trim()) askGuidance.mutate(guidancePrompt.trim()); }}
                    placeholder="Ask about this case..." className="flex-1 bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-1.5 text-xs" />
                  <button onClick={() => { if (guidancePrompt.trim()) askGuidance.mutate(guidancePrompt.trim()); }}
                    disabled={askGuidance.isPending || !guidancePrompt.trim()}
                    className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-1">
                    {askGuidance.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                  </button>
                </div>
                {askGuidance.isPending && <div className="flex items-center gap-2 py-3 justify-center text-xs text-purple-400"><Loader2 className="w-4 h-4 animate-spin" />Analyzing case...</div>}
                {guidance && !askGuidance.isPending && (
                  <div className="mt-3 p-3 bg-slate-900 rounded-lg border border-slate-700">
                    <p className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">{guidance.guidance}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[9px] text-slate-600 uppercase">Advisory · {guidance.source === "ai" ? "AI-Assisted" : "Rule-Based"}</span>
                      <button onClick={() => setGuidance(null)} className="text-[9px] text-slate-500 hover:text-white">Clear</button>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Timeline ── */}
              {view.timeline.length > 0 && (
                <div className={cardCls}>
                  <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Timeline</h3>
                  <div className="space-y-1.5">
                    {view.timeline.map((ev, i) => (
                      <div key={i} className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-900 border border-slate-700/50">
                        <div className="flex items-center gap-2 min-w-0">
                          <ChevronRight className="w-3 h-3 text-slate-500 flex-shrink-0" />
                          <span className="text-slate-300">{ev.action}</span>
                          <span className="text-slate-500 truncate">{ev.detail}</span>
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono flex-shrink-0">{new Date(ev.date).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Case Intelligence ── */}
              {intel && (
                <>
                  {/* Risks (scored) */}
                  {intel.risks?.length > 0 && (
                    <div className={cardCls}>
                      <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Risks</h3>
                      <div className="space-y-1">
                        {intel.risks.map((r: any, i: number) => (
                          <div key={i} className={`flex items-center justify-between text-xs p-2 rounded-lg ${
                            r.severity === "CRITICAL" ? "bg-red-500/10 border border-red-500/20" :
                            r.severity === "HIGH" ? "bg-orange-500/10 border border-orange-500/20" :
                            r.severity === "MEDIUM" ? "bg-yellow-500/10 border border-yellow-500/20" :
                            "bg-slate-900 border border-slate-700"
                          }`}>
                            <span className="text-slate-300">{r.description ?? r.message}</span>
                            <span className={`text-[10px] font-bold ${
                              r.severity === "CRITICAL" ? "text-red-400" : r.severity === "HIGH" ? "text-orange-400" : r.severity === "MEDIUM" ? "text-yellow-400" : "text-slate-400"
                            }`}>{r.severity}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Relevant Legal Articles */}
                  {intel.legalReferences?.length > 0 && (
                    <div className={cardCls}>
                      <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Applicable Legal Articles</h3>
                      <div className="space-y-1">
                        {intel.legalReferences.map((a: any, i: number) => (
                          <div key={i} className="p-2 bg-slate-900 rounded-lg">
                            <span className="text-xs font-bold text-blue-400">{a.article}</span>
                            <span className="text-[11px] text-slate-500 ml-2">({a.law})</span>
                            <p className="text-[11px] text-slate-400 mt-0.5">{a.summary}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Next Actions (with system links) */}
                  {intel.nextActions?.length > 0 && (
                    <div className={cardCls}>
                      <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Recommended Actions</h3>
                      <div className="space-y-1">
                        {intel.nextActions.map((a: any, i: number) => (
                          <div key={i} className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-900 border border-slate-700/50">
                            <div className="flex items-center gap-2 min-w-0">
                              <ChevronRight className="w-3 h-3 text-blue-400 flex-shrink-0" />
                              <span className="text-slate-300">{a.action}</span>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className="text-[9px] text-slate-500">{a.systemLink ?? a.systemFeature}</span>
                              <span className={`text-[10px] font-bold px-1 rounded ${
                                a.priority === 1 || a.priority === "critical" ? "text-red-400" : a.priority === 2 || a.priority === "high" ? "text-orange-400" : "text-yellow-400"
                              }`}>{typeof a.priority === "number" ? ["", "Critical", "High", "Medium", "Low"][a.priority] ?? a.priority : a.priority}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Client Status Report */}
                  {intel.clientStatusUpdate && (
                    <div className={`${cardCls} border-blue-500/20`}>
                      <h3 className="text-xs font-bold uppercase tracking-widest text-blue-400 mb-2 flex items-center gap-2">
                        <Building2 className="w-3.5 h-3.5" /> Client Status Report
                      </h3>
                      <p className="text-[10px] text-blue-400/60 mb-2">For employer — no internal legal details</p>
                      <pre className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">{intel.clientStatusUpdate}</pre>
                    </div>
                  )}

                  {/* AI Analysis */}
                  {intel.caseSummary && (
                    <div className={`${cardCls} border-purple-500/20`}>
                      <h3 className="text-xs font-bold uppercase tracking-widest text-purple-400 mb-2 flex items-center gap-2">
                        <Sparkles className="w-3.5 h-3.5" /> AI Case Analysis
                      </h3>
                      <p className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">{intel.caseSummary}</p>
                      <p className="text-[9px] text-slate-600 mt-2 uppercase">Advisory only · Requires human review</p>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </PageShell>
  );
}
