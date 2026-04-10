/**
 * GlobalDropZone — universal drag-and-drop overlay for the entire app.
 * When a file is dragged anywhere, shows an overlay.
 * On drop, sends through Document Intake Intelligence + Hardening pipeline.
 * Shows results in a slide-in panel. Supports multi-file.
 */

import React, { useState, useCallback, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { authHeaders, BASE } from "@/lib/api";
import {
  Upload, Loader2, FileText, User, AlertTriangle, CheckCircle2,
  Shield, Scale, Clock, Brain, XOctagon, Zap, X, ChevronDown, ChevronUp,
  Copy as CopyIcon, Fingerprint, CalendarClock, Gavel, Eye,
} from "lucide-react";

interface IntakeResult {
  id: string;
  identity: { fullName: string | null; passportNumber: string | null; pesel: string | null; dateOfBirth: string | null; nationality: string | null; issuingCountry: string | null };
  classification: string;
  credentials: { documentNumber: string | null; issueDate: string | null; expiryDate: string | null; filingDate: string | null; authority: string | null; caseReference: string | null; employer: string | null; role: string | null };
  workerMatch: { workerId: string | null; workerName: string | null; confidence: number; matchType: string; signals: any[]; suggestions: any[] };
  legalImpact: { type: string; explanation: string; confidence: number; affectsLegalStay: boolean; deadlineDate: string | null; statusChangeIfConfirmed: string | null };
  suggestedActions: Array<{ action: string; reason: string; priority: number }>;
  contradictions: any[];
  urgencyScore: number;
  aiConfidence: number;
  status: string;
  hardening: {
    duplicate: { isDuplicate: boolean; duplicateOfId: string | null; reason: string | null };
    version: { isNewVersion: boolean; replacesId: string | null; versionNumber: number; isLatest: boolean; reason: string | null };
    documentLink: { linkedCaseId: string | null; linkConfidence: number; explanation: string };
    confidenceGate: string;
    identityRisk: string;
    timeline: { status: string; explanation: string; filingGapDays: number | null; isLateFilingRisk: boolean };
    completeness: { score: number; missingCritical: string[]; missingNonCritical: string[]; forceReview: boolean };
    language: string;
    conflicts: any[];
    overallSafetyScore: number;
    deadlineDate: string | null;
  };
}

const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_SIZE = 20 * 1024 * 1024;

const GATE_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  AUTO_SUGGEST: { label: "High Confidence", color: "text-emerald-400", bg: "bg-emerald-500/10" },
  REVIEW_REQUIRED: { label: "Review Required", color: "text-amber-400", bg: "bg-amber-500/10" },
  MANUAL_REQUIRED: { label: "Manual Review", color: "text-red-400", bg: "bg-red-500/10" },
};

export function GlobalDropZone({ children }: { children: React.ReactNode }) {
  const { toast } = useToast();
  const [dragging, setDragging] = useState(false);
  const [results, setResults] = useState<IntakeResult[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const dragCounter = useRef(0);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!ALLOWED_TYPES.includes(file.type)) throw new Error(`Unsupported: ${file.type}`);
      if (file.size > MAX_SIZE) throw new Error("File too large (max 20MB)");
      const form = new FormData();
      form.append("file", file);
      const token = localStorage.getItem("apatris_jwt");
      const res = await fetch(`${BASE}api/v1/intake/process`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error ?? "Upload failed"); }
      return res.json() as Promise<IntakeResult>;
    },
    onSuccess: (data) => {
      setResults(prev => [data, ...prev]);
      setPanelOpen(true);
      const gate = data.hardening?.confidenceGate ?? "REVIEW_REQUIRED";
      if (data.status === "DUPLICATE_BLOCKED") {
        toast({ description: `Duplicate detected — ${data.hardening.duplicate.reason}`, variant: "destructive" });
      } else {
        toast({ description: `${data.classification}: ${gate === "AUTO_SUGGEST" ? "Ready for review" : gate === "MANUAL_REQUIRED" ? "Manual review required" : "Review needed"}` });
      }
    },
    onError: (err) => toast({ description: (err as Error).message, variant: "destructive" }),
  });

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current++;
    if (e.dataTransfer.types.includes("Files")) setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current <= 0) { setDragging(false); dragCounter.current = 0; }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    dragCounter.current = 0;
    const files = Array.from(e.dataTransfer.files);
    for (const f of files) uploadMutation.mutate(f);
  }, [uploadMutation]);

  const confirmMutation = useMutation({
    mutationFn: async ({ id, workerId, actions }: { id: string; workerId: string; actions: string[] }) => {
      const res = await fetch(`${BASE}api/v1/intake/${id}/confirm`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ confirmedWorkerId: workerId, confirmedFields: {}, applyActions: actions }),
      });
      if (!res.ok) throw new Error("Confirm failed");
      return res.json();
    },
    onSuccess: (_, vars) => {
      setResults(prev => prev.map(r => r.id === vars.id ? { ...r, status: "CONFIRMED" } : r));
      toast({ description: "Confirmed" });
    },
  });

  const gate = (r: IntakeResult) => GATE_STYLE[r.hardening?.confidenceGate ?? "REVIEW_REQUIRED"] ?? GATE_STYLE.REVIEW_REQUIRED;

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className="relative"
    >
      {children}

      {/* Drag overlay */}
      {dragging && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="border-4 border-dashed border-blue-400 rounded-3xl p-16 text-center">
            <Upload className="w-16 h-16 mx-auto text-blue-400 mb-4" />
            <p className="text-2xl font-bold text-blue-400">Drop anywhere to analyze</p>
            <p className="text-sm text-slate-400 mt-2">AI will extract, classify, and check safety</p>
          </div>
        </div>
      )}

      {/* Processing indicator */}
      {uploadMutation.isPending && (
        <div className="fixed bottom-4 right-4 z-[9998] bg-slate-800 border border-blue-500/30 rounded-xl px-4 py-3 flex items-center gap-3 shadow-2xl">
          <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
          <span className="text-sm text-blue-400 font-semibold">Analyzing document...</span>
        </div>
      )}

      {/* Results panel toggle */}
      {results.length > 0 && !panelOpen && (
        <button
          onClick={() => setPanelOpen(true)}
          className="fixed bottom-4 right-4 z-[9997] bg-slate-800 border border-slate-600 rounded-xl px-4 py-2 flex items-center gap-2 shadow-2xl hover:border-blue-500/50 transition-colors"
        >
          <Brain className="w-4 h-4 text-blue-400" />
          <span className="text-xs text-slate-300 font-bold">{results.length} intake{results.length > 1 ? "s" : ""}</span>
          {results.some(r => r.status === "PENDING_REVIEW" || r.status === "MANUAL_REQUIRED") && (
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          )}
        </button>
      )}

      {/* Slide-in results panel */}
      {panelOpen && results.length > 0 && (
        <div className="fixed top-0 right-0 bottom-0 w-[420px] z-[9998] bg-slate-900 border-l border-slate-700 shadow-2xl overflow-y-auto">
          <div className="sticky top-0 bg-slate-900 border-b border-slate-700 px-4 py-3 flex items-center justify-between z-10">
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-[#C41E18]" />
              <span className="text-sm font-bold text-white">Document Intake</span>
              <span className="text-[10px] bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded">{results.length}</span>
            </div>
            <button onClick={() => setPanelOpen(false)} className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
          </div>

          <div className="p-3 space-y-3">
            {results.map(r => {
              const g = gate(r);
              const isExpanded = expandedId === r.id;
              const h = r.hardening;
              return (
                <div key={r.id} className={`rounded-xl border p-3 space-y-2 ${
                  r.status === "DUPLICATE_BLOCKED" ? "border-red-500/30 bg-red-500/5" :
                  r.status === "CONFIRMED" ? "border-emerald-500/20 bg-emerald-500/5" :
                  "border-slate-700 bg-slate-800"
                }`}>
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5 text-blue-400" />
                      <span className="text-xs font-bold text-slate-200">{r.classification.replace(/_/g, " ")}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${g.bg} ${g.color}`}>{g.label}</span>
                      <button onClick={() => setExpandedId(isExpanded ? null : r.id)} className="text-slate-500 hover:text-white">
                        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                    </div>
                  </div>

                  {/* Status badges */}
                  {r.status === "DUPLICATE_BLOCKED" && (
                    <div className="text-[10px] text-red-400 bg-red-500/10 rounded px-2 py-1 font-bold">DUPLICATE — {h?.duplicate.reason}</div>
                  )}
                  {r.status === "CONFIRMED" && (
                    <div className="text-[10px] text-emerald-400 bg-emerald-500/10 rounded px-2 py-1 font-bold">CONFIRMED</div>
                  )}

                  {/* Worker match */}
                  {r.workerMatch.workerId ? (
                    <div className="flex items-center gap-1.5 text-[10px]">
                      <User className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-400 font-semibold">{r.workerMatch.workerName}</span>
                      <span className="text-slate-500">{(r.workerMatch.confidence * 100).toFixed(0)}%</span>
                      {h?.identityRisk === "HIGH" && <span className="text-red-400 font-bold ml-1">HIGH RISK</span>}
                    </div>
                  ) : r.identity.fullName && (
                    <div className="flex items-center gap-1.5 text-[10px] text-amber-400">
                      <AlertTriangle className="w-3 h-3" />
                      <span>{r.identity.fullName} — no match</span>
                    </div>
                  )}

                  {/* Safety indicators row */}
                  <div className="flex flex-wrap gap-1.5">
                    {h && (
                      <>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${h.timeline.status === "VALID" ? "bg-emerald-500/10 text-emerald-400" : h.timeline.status === "LATE" || h.timeline.status === "GAP" ? "bg-red-500/10 text-red-400" : "bg-slate-700 text-slate-400"}`}>
                          {h.timeline.status}
                        </span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${h.completeness.score >= 80 ? "bg-emerald-500/10 text-emerald-400" : h.completeness.score >= 50 ? "bg-amber-500/10 text-amber-400" : "bg-red-500/10 text-red-400"}`}>
                          {h.completeness.score}% complete
                        </span>
                        {h.version.isNewVersion && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded font-bold bg-blue-500/10 text-blue-400">v{h.version.versionNumber}</span>
                        )}
                        {h.documentLink.linkedCaseId && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded font-bold bg-purple-500/10 text-purple-400">Linked</span>
                        )}
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${h.overallSafetyScore >= 70 ? "bg-emerald-500/10 text-emerald-400" : h.overallSafetyScore >= 40 ? "bg-amber-500/10 text-amber-400" : "bg-red-500/10 text-red-400"}`}>
                          Safety: {h.overallSafetyScore}
                        </span>
                      </>
                    )}
                  </div>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="space-y-2 pt-1 border-t border-slate-700/50">
                      {/* Legal impact */}
                      <div className="text-[10px] text-slate-300">
                        <span className="text-slate-500">Legal: </span>{r.legalImpact.explanation}
                      </div>

                      {/* Timeline detail */}
                      {h && h.timeline.status !== "UNKNOWN" && (
                        <div className={`text-[10px] rounded px-2 py-1 ${h.timeline.status === "VALID" ? "bg-emerald-500/5 text-emerald-400" : "bg-red-500/5 text-red-400"}`}>
                          <Clock className="w-3 h-3 inline mr-1" />{h.timeline.explanation}
                        </div>
                      )}

                      {/* Deadline */}
                      {h?.deadlineDate && (
                        <div className="text-[10px] text-red-400 bg-red-500/10 rounded px-2 py-1 font-bold">
                          <CalendarClock className="w-3 h-3 inline mr-1" />Deadline: {h.deadlineDate}
                        </div>
                      )}

                      {/* Conflicts */}
                      {h && h.conflicts.length > 0 && (
                        <div className="space-y-1">
                          {h.conflicts.map((c: any, i: number) => (
                            <div key={i} className={`text-[10px] rounded px-2 py-1 ${c.severity === "HIGH" ? "bg-red-500/10 text-red-400" : "bg-amber-500/10 text-amber-400"}`}>
                              [{c.severity}] {c.message}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Missing fields */}
                      {h && h.completeness.missingCritical.length > 0 && (
                        <div className="text-[10px] text-red-400 bg-red-500/5 rounded px-2 py-1">
                          Missing critical: {h.completeness.missingCritical.join(", ")}
                        </div>
                      )}

                      {/* Version info */}
                      {h?.version.reason && (
                        <div className="text-[10px] text-blue-400 bg-blue-500/5 rounded px-2 py-1">{h.version.reason}</div>
                      )}

                      {/* Extracted fields */}
                      <div className="grid grid-cols-2 gap-1 text-[10px]">
                        {[
                          { l: "Name", v: r.identity.fullName },
                          { l: "Nationality", v: r.identity.nationality },
                          { l: "PESEL", v: r.identity.pesel },
                          { l: "Passport", v: r.identity.passportNumber },
                          { l: "DOB", v: r.identity.dateOfBirth },
                          { l: "Expiry", v: r.credentials.expiryDate },
                          { l: "Authority", v: r.credentials.authority },
                          { l: "Case Ref", v: r.credentials.caseReference },
                        ].filter(f => f.v).map((f, i) => (
                          <div key={i} className="bg-slate-900/60 rounded px-1.5 py-0.5">
                            <span className="text-slate-500">{f.l}: </span><span className="text-slate-300">{f.v}</span>
                          </div>
                        ))}
                      </div>

                      {/* Actions */}
                      {r.status !== "CONFIRMED" && r.status !== "DUPLICATE_BLOCKED" && r.workerMatch.workerId && (
                        <button
                          onClick={() => confirmMutation.mutate({
                            id: r.id,
                            workerId: r.workerMatch.workerId!,
                            actions: r.suggestedActions.slice(0, 2).map(a => a.action),
                          })}
                          disabled={confirmMutation.isPending || r.hardening?.identityRisk === "HIGH"}
                          className="w-full text-[10px] font-bold py-1.5 rounded bg-emerald-600/20 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-600/30 disabled:opacity-50 transition-colors"
                        >
                          {r.hardening?.identityRisk === "HIGH" ? "Identity risk too high — go to Intake page" : "Quick Confirm"}
                        </button>
                      )}

                      <a href="/document-intake" className="block text-center text-[10px] text-blue-400 hover:text-blue-300 underline">
                        Open full Intake page
                      </a>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
