/**
 * Document Intake Intelligence — upload documents, AI analyzes and suggests actions.
 * All AI-derived data requires human confirmation before entering the system.
 */

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { authHeaders, BASE } from "@/lib/api";
import {
  Upload, FileText, Loader2, User, AlertTriangle, CheckCircle2,
  Shield, Clock, Scale, Brain, Fingerprint, CalendarClock,
  ChevronDown, ChevronUp, Gavel, Eye, XOctagon, Zap,
} from "lucide-react";

// ═══ TYPES ══════════════════════════════════════════════════════════════════

interface IntakeResult {
  id: string;
  identity: { fullName: string | null; passportNumber: string | null; pesel: string | null; dateOfBirth: string | null; nationality: string | null; issuingCountry: string | null };
  classification: string;
  credentials: { documentNumber: string | null; issueDate: string | null; expiryDate: string | null; filingDate: string | null; authority: string | null; caseReference: string | null; employer: string | null; role: string | null };
  workerMatch: { workerId: string | null; workerName: string | null; confidence: number; matchType: string; signals: Array<{ type: string; value: string; confidence: number; matched: boolean }>; suggestions: Array<{ id: string; name: string; score: number }> };
  legalImpact: { type: string; explanation: string; confidence: number; affectsLegalStay: boolean; deadlineDate: string | null; statusChangeIfConfirmed: string | null };
  suggestedActions: Array<{ action: string; reason: string; priority: number }>;
  contradictions: Array<{ field: string; extractedValue: string; existingValue: string; severity: string; message: string }>;
  urgencyScore: number;
  aiConfidence: number;
  status: string;
  hardening?: {
    duplicate: { isDuplicate: boolean; duplicateOfId: string | null; reason: string | null; duplicateConfidence: number };
    version: { isNewVersion: boolean; replacesId: string | null; versionNumber: number; isLatest: boolean; reason: string | null };
    documentLink: { linkedCaseId: string | null; linkConfidence: number; explanation: string };
    confidenceGate: string;
    identityRisk: string;
    timeline: { status: string; explanation: string; filingGapDays: number | null; isLateFilingRisk: boolean };
    completeness: { score: number; missingCritical: string[]; missingNonCritical: string[]; forceReview: boolean };
    language: string;
    conflicts: Array<{ field: string; extractedValue: string; existingValue: string; severity: string; message: string; recommendedAction: string }>;
    overallSafetyScore: number;
    deadlineDate: string | null;
    auditTrail: Array<{ timestamp: string; event: string; detail: string }>;
  };
}

// ═══ STYLE MAPS ═════════════════════════════════════════════════════════════

const CLASS_STYLE: Record<string, { label: string; color: string; icon: typeof FileText }> = {
  PASSPORT: { label: "Passport", color: "text-blue-400", icon: Fingerprint },
  RESIDENCE_PERMIT: { label: "Residence Permit", color: "text-emerald-400", icon: Shield },
  FILING_PROOF: { label: "Filing Proof", color: "text-green-400", icon: CheckCircle2 },
  UPO: { label: "UPO Receipt", color: "text-green-400", icon: CheckCircle2 },
  MOS_SUBMISSION: { label: "MoS Submission", color: "text-green-400", icon: CheckCircle2 },
  DECISION_LETTER: { label: "Decision Letter", color: "text-amber-400", icon: Gavel },
  REJECTION_LETTER: { label: "Rejection Letter", color: "text-red-400", icon: XOctagon },
  WORK_PERMIT: { label: "Work Permit", color: "text-purple-400", icon: Shield },
  WORK_CONTRACT: { label: "Work Contract", color: "text-indigo-400", icon: FileText },
  MEDICAL_CERT: { label: "Medical Cert", color: "text-cyan-400", icon: FileText },
  BHP_CERT: { label: "BHP Cert", color: "text-orange-400", icon: FileText },
  UDT_CERT: { label: "UDT Cert", color: "text-yellow-400", icon: FileText },
  SUPPORTING_DOCUMENT: { label: "Supporting Doc", color: "text-slate-400", icon: FileText },
  UNKNOWN: { label: "Unknown", color: "text-slate-500", icon: AlertTriangle },
};

const IMPACT_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  IDENTITY_ONLY: { label: "Identity Only", color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
  PERMIT_VALIDITY: { label: "Permit Validity", color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
  FILING_CONTINUITY: { label: "Filing Continuity", color: "text-green-400", bg: "bg-green-500/10 border-green-500/20" },
  LEGAL_STAY_PROTECTION: { label: "Legal Stay Protection", color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
  REJECTION_APPEAL_RISK: { label: "Rejection / Appeal Risk", color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
  APPROVAL_DECISION: { label: "Approval Decision", color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
  EXPIRY_UPDATE: { label: "Expiry Update", color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
  NO_LEGAL_IMPACT: { label: "No Legal Impact", color: "text-slate-400", bg: "bg-slate-700/50 border-slate-600" },
};

// ═══ COMPONENT ══════════════════════════════════════════════════════════════

export default function DocumentIntake() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [result, setResult] = useState<IntakeResult | null>(null);
  const [selectedActions, setSelectedActions] = useState<Set<string>>(new Set());
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>("");
  const [showSignals, setShowSignals] = useState(false);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
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
      setResult(data);
      setSelectedWorkerId(data.workerMatch.workerId ?? "");
      setSelectedActions(new Set(data.suggestedActions.slice(0, 2).map(a => a.action)));
      toast({ description: `Document classified: ${data.classification}` });
    },
    onError: (err) => toast({ description: (err as Error).message, variant: "destructive" }),
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      if (!result) throw new Error("No intake to confirm");
      const res = await fetch(`${BASE}api/v1/intake/${result.id}/confirm`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          confirmedWorkerId: selectedWorkerId,
          confirmedFields: { ...result.identity, ...result.credentials },
          applyActions: Array.from(selectedActions),
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error ?? "Confirm failed"); }
      return res.json();
    },
    onSuccess: (data) => {
      toast({ description: `Confirmed. ${data.appliedActions?.length ?? 0} actions applied.` });
      setResult(r => r ? { ...r, status: "CONFIRMED" } : null);
      queryClient.invalidateQueries({ queryKey: ["intake-pending"] });
    },
    onError: (err) => toast({ description: (err as Error).message, variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: async () => {
      if (!result) throw new Error("No intake to reject");
      const res = await fetch(`${BASE}api/v1/intake/${result.id}/reject`, { method: "POST", headers: authHeaders() });
      if (!res.ok) throw new Error("Reject failed");
      return res.json();
    },
    onSuccess: () => {
      toast({ description: "Intake rejected" });
      setResult(r => r ? { ...r, status: "REJECTED" } : null);
    },
  });

  const { data: pendingData } = useQuery({
    queryKey: ["intake-pending"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/v1/intake/pending`, { headers: authHeaders() });
      if (!res.ok) return { intakes: [], count: 0 };
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const cls = CLASS_STYLE[result?.classification ?? ""] ?? CLASS_STYLE.UNKNOWN;
  const ClsIcon = cls.icon;
  const impact = IMPACT_STYLE[result?.legalImpact.type ?? ""] ?? IMPACT_STYLE.NO_LEGAL_IMPACT;
  const pendingCount = pendingData?.count ?? 0;

  const toggleAction = (action: string) => {
    setSelectedActions(prev => {
      const next = new Set(prev);
      if (next.has(action)) next.delete(action); else next.add(action);
      return next;
    });
  };

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Brain className="w-7 h-7 text-[#C41E18]" />
          <h1 className="text-3xl font-bold text-white">Document Intake Intelligence</h1>
          {pendingCount > 0 && (
            <span className="text-xs font-bold bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full">{pendingCount} pending</span>
          )}
        </div>
        <p className="text-gray-400">Upload documents — AI extracts, classifies, and suggests actions. All changes require your confirmation.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Upload Panel ─────────────────────────────────────── */}
        <div className="space-y-4">
          <div
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) uploadMutation.mutate(f); }}
            onClick={() => document.getElementById("intake-file")?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              uploadMutation.isPending ? "border-blue-500/50 bg-blue-500/5" :
              result ? "border-emerald-500/50 bg-emerald-500/5" :
              "border-slate-600 hover:border-slate-500 bg-slate-900/30"
            }`}
          >
            <input id="intake-file" type="file" accept="application/pdf,image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadMutation.mutate(f); }} />

            {uploadMutation.isPending ? (
              <div className="flex flex-col items-center gap-3 py-4">
                <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
                <span className="text-sm text-blue-400 font-semibold">AI analyzing document...</span>
                <span className="text-xs text-slate-500">Extracting identity, classifying, assessing legal impact</span>
              </div>
            ) : (
              <div className="py-4">
                <Upload className="w-8 h-8 mx-auto text-slate-500 mb-2" />
                <p className="text-sm text-slate-400 font-semibold">Drop any document here</p>
                <p className="text-xs text-slate-600 mt-1">Passport, rejection letter, UPO, work permit, contract, certificate</p>
                <p className="text-[10px] text-slate-700 mt-2">PDF, JPEG, PNG up to 20MB</p>
              </div>
            )}
          </div>

          {uploadMutation.isError && (
            <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 rounded px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5" />{(uploadMutation.error as Error).message}
            </div>
          )}
        </div>

        {/* ── Analysis Panel ───────────────────────────────────── */}
        <div className="space-y-4">
          {result ? (
            <>
              {/* Status bar */}
              {result.status !== "PENDING_REVIEW" && (
                <div className={`text-xs font-bold px-3 py-2 rounded-lg ${result.status === "CONFIRMED" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
                  {result.status === "CONFIRMED" ? "CONFIRMED — Changes applied" : "REJECTED — No changes made"}
                </div>
              )}

              {/* Urgency bar */}
              {result.urgencyScore >= 50 && (
                <div className="flex items-center gap-2 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-red-400">
                  <Zap className="w-4 h-4" />
                  <span className="font-bold">URGENT (Score: {result.urgencyScore}/100)</span>
                  {result.legalImpact.deadlineDate && <span>— Deadline: {result.legalImpact.deadlineDate}</span>}
                </div>
              )}

              {/* Classification + confidence */}
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ClsIcon className={`w-5 h-5 ${cls.color}`} />
                    <span className={`text-sm font-bold ${cls.color}`}>{cls.label}</span>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${result.aiConfidence >= 0.8 ? "bg-emerald-500/20 text-emerald-400" : result.aiConfidence >= 0.5 ? "bg-amber-500/20 text-amber-400" : "bg-red-500/20 text-red-400"}`}>
                    {(result.aiConfidence * 100).toFixed(0)}% confidence
                  </span>
                </div>

                {/* Worker match */}
                <div className="space-y-1.5">
                  {result.workerMatch.workerId ? (
                    <div className="flex items-center gap-2 text-xs bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
                      <User className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400 font-semibold">{result.workerMatch.matchType === "EXACT" ? "Matched" : "Likely match"}: {result.workerMatch.workerName}</span>
                      <span className="text-slate-500 font-mono text-[10px]">{(result.workerMatch.confidence * 100).toFixed(0)}%</span>
                      <button onClick={() => setShowSignals(!showSignals)} className="ml-auto text-slate-400 hover:text-white">
                        {showSignals ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                    </div>
                  ) : result.identity.fullName ? (
                    <div className="flex items-center gap-2 text-xs bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-amber-400">Name: "{result.identity.fullName}" — no match</span>
                    </div>
                  ) : null}

                  {/* Match signals */}
                  {showSignals && result.workerMatch.signals.length > 0 && (
                    <div className="bg-slate-900/60 rounded px-3 py-2 space-y-1">
                      <p className="text-[10px] font-bold text-slate-500 uppercase">Match Signals</p>
                      {result.workerMatch.signals.map((s, i) => (
                        <div key={i} className="flex items-center gap-2 text-[11px]">
                          <span className={s.matched ? "text-emerald-400" : "text-red-400"}>{s.matched ? "+" : "-"}</span>
                          <span className="text-slate-400 font-mono">{s.type}</span>
                          <span className="text-slate-300">{s.value}</span>
                          <span className="text-slate-500 ml-auto">{(s.confidence * 100).toFixed(0)}%</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Suggestions if no match */}
                  {!result.workerMatch.workerId && result.workerMatch.suggestions.length > 0 && (
                    <div className="text-[11px] text-slate-400">
                      <span>Did you mean: </span>
                      {result.workerMatch.suggestions.map((s, i) => (
                        <button key={s.id} onClick={() => setSelectedWorkerId(s.id)}
                          className={`ml-1 underline ${selectedWorkerId === s.id ? "text-emerald-400" : "text-blue-400 hover:text-blue-300"}`}>
                          {s.name} ({(s.score * 100).toFixed(0)}%){i < result.workerMatch.suggestions.length - 1 ? "," : ""}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Extracted identity fields */}
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Extracted Identity</p>
                  <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                    {[
                      { label: "Full Name", value: result.identity.fullName },
                      { label: "Nationality", value: result.identity.nationality },
                      { label: "PESEL", value: result.identity.pesel },
                      { label: "Passport #", value: result.identity.passportNumber },
                      { label: "DOB", value: result.identity.dateOfBirth },
                      { label: "Issuing Country", value: result.identity.issuingCountry },
                    ].filter(f => f.value).map((f, i) => (
                      <div key={i} className="rounded bg-slate-900/40 px-2 py-1">
                        <span className="text-slate-500">{f.label}: </span>
                        <span className="text-slate-300">{f.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Extracted credentials */}
                {Object.values(result.credentials).some(v => v) && (
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Extracted Credentials</p>
                    <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                      {[
                        { label: "Doc #", value: result.credentials.documentNumber },
                        { label: "Case Ref", value: result.credentials.caseReference },
                        { label: "Issue Date", value: result.credentials.issueDate },
                        { label: "Expiry Date", value: result.credentials.expiryDate },
                        { label: "Filing Date", value: result.credentials.filingDate },
                        { label: "Authority", value: result.credentials.authority },
                        { label: "Employer", value: result.credentials.employer },
                        { label: "Role", value: result.credentials.role },
                      ].filter(f => f.value).map((f, i) => (
                        <div key={i} className="rounded bg-slate-900/40 px-2 py-1">
                          <span className="text-slate-500">{f.label}: </span>
                          <span className="text-slate-300">{f.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Legal Impact */}
              <div className={`rounded-xl border p-4 space-y-2 ${impact.bg}`}>
                <div className="flex items-center gap-2">
                  <Scale className={`w-4 h-4 ${impact.color}`} />
                  <span className={`text-sm font-bold ${impact.color}`}>{impact.label}</span>
                  {result.legalImpact.affectsLegalStay && (
                    <span className="text-[10px] font-bold bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded">AFFECTS LEGAL STAY</span>
                  )}
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">{result.legalImpact.explanation}</p>
                {result.legalImpact.statusChangeIfConfirmed && (
                  <p className="text-[10px] text-slate-400">If confirmed: <span className="text-emerald-400 font-semibold">{result.legalImpact.statusChangeIfConfirmed}</span></p>
                )}
                {result.legalImpact.deadlineDate && (
                  <div className="flex items-center gap-2 text-xs text-red-400">
                    <CalendarClock className="w-3.5 h-3.5" />
                    <span className="font-bold">Deadline: {result.legalImpact.deadlineDate}</span>
                  </div>
                )}
              </div>

              {/* Contradictions */}
              {result.contradictions.length > 0 && (
                <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-3 space-y-1.5">
                  <p className="text-[10px] font-bold text-red-400 uppercase tracking-wider">Contradictions Detected</p>
                  {result.contradictions.map((c, i) => (
                    <div key={i} className={`text-[11px] rounded px-2 py-1 ${c.severity === "HIGH" ? "bg-red-500/10 text-red-400" : c.severity === "MEDIUM" ? "bg-amber-500/10 text-amber-400" : "bg-slate-700/50 text-slate-400"}`}>
                      <span className="font-bold">[{c.severity}]</span> {c.message}
                    </div>
                  ))}
                </div>
              )}

              {/* ── Hardening Results ──────────────────────────── */}
              {result.hardening && (
                <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-3 space-y-2">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Safety Checks</p>

                  <div className="flex flex-wrap gap-1.5">
                    {/* Confidence gate */}
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded ${result.hardening.confidenceGate === "AUTO_SUGGEST" ? "bg-emerald-500/10 text-emerald-400" : result.hardening.confidenceGate === "REVIEW_REQUIRED" ? "bg-amber-500/10 text-amber-400" : "bg-red-500/10 text-red-400"}`}>
                      {result.hardening.confidenceGate.replace(/_/g, " ")}
                    </span>

                    {/* Identity risk */}
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded ${result.hardening.identityRisk === "LOW" ? "bg-emerald-500/10 text-emerald-400" : result.hardening.identityRisk === "MEDIUM" ? "bg-amber-500/10 text-amber-400" : "bg-red-500/10 text-red-400"}`}>
                      ID Risk: {result.hardening.identityRisk}
                    </span>

                    {/* Safety score */}
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded ${result.hardening.overallSafetyScore >= 70 ? "bg-emerald-500/10 text-emerald-400" : result.hardening.overallSafetyScore >= 40 ? "bg-amber-500/10 text-amber-400" : "bg-red-500/10 text-red-400"}`}>
                      Safety: {result.hardening.overallSafetyScore}/100
                    </span>

                    {/* Language */}
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-slate-700 text-slate-400">
                      Lang: {result.hardening.language}
                    </span>
                  </div>

                  {/* Duplicate warning */}
                  {result.hardening.duplicate.isDuplicate && (
                    <div className="text-[10px] text-red-400 bg-red-500/10 rounded px-2 py-1.5 font-semibold">
                      DUPLICATE: {result.hardening.duplicate.reason}
                    </div>
                  )}

                  {/* Version info */}
                  {result.hardening.version.isNewVersion && (
                    <div className="text-[10px] text-blue-400 bg-blue-500/5 rounded px-2 py-1.5">
                      Version {result.hardening.version.versionNumber}: {result.hardening.version.reason}
                    </div>
                  )}

                  {/* Linked case */}
                  {result.hardening.documentLink.linkedCaseId && (
                    <div className="text-[10px] text-purple-400 bg-purple-500/5 rounded px-2 py-1.5">
                      Linked to case: {result.hardening.documentLink.explanation} ({(result.hardening.documentLink.linkConfidence * 100).toFixed(0)}%)
                    </div>
                  )}

                  {/* Timeline */}
                  {result.hardening.timeline.status !== "UNKNOWN" && (
                    <div className={`text-[10px] rounded px-2 py-1.5 ${result.hardening.timeline.status === "VALID" ? "bg-emerald-500/5 text-emerald-400" : result.hardening.timeline.status === "LATE" || result.hardening.timeline.status === "GAP" ? "bg-red-500/5 text-red-400" : "bg-amber-500/5 text-amber-400"}`}>
                      Timeline: {result.hardening.timeline.explanation}
                    </div>
                  )}

                  {/* Completeness */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded bg-slate-700">
                      <div className={`h-full rounded ${result.hardening.completeness.score >= 80 ? "bg-emerald-500" : result.hardening.completeness.score >= 50 ? "bg-amber-500" : "bg-red-500"}`}
                        style={{ width: `${result.hardening.completeness.score}%` }} />
                    </div>
                    <span className="text-[10px] text-slate-400">{result.hardening.completeness.score}% complete</span>
                  </div>
                  {result.hardening.completeness.missingCritical.length > 0 && (
                    <div className="text-[10px] text-red-400">Missing critical: {result.hardening.completeness.missingCritical.join(", ")}</div>
                  )}

                  {/* Deadline */}
                  {result.hardening.deadlineDate && (
                    <div className="text-[10px] text-red-400 bg-red-500/10 rounded px-2 py-1.5 font-bold">
                      Deadline: {result.hardening.deadlineDate}
                    </div>
                  )}
                </div>
              )}

              {/* Suggested Actions */}
              {(result.status === "PENDING_REVIEW" || result.status === "MANUAL_REQUIRED") && (
                <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-3">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Suggested Actions</p>
                  {result.suggestedActions.map((a, i) => (
                    <label key={i} className="flex items-start gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedActions.has(a.action)}
                        onChange={() => toggleAction(a.action)}
                        className="mt-0.5 accent-blue-500"
                      />
                      <div>
                        <span className="text-slate-300 font-semibold">{a.action.replace(/_/g, " ")}</span>
                        <p className="text-slate-500 text-[10px]">{a.reason}</p>
                      </div>
                    </label>
                  ))}

                  <div className="flex gap-2 pt-2 border-t border-slate-700">
                    <button
                      onClick={() => confirmMutation.mutate()}
                      disabled={confirmMutation.isPending || !selectedWorkerId}
                      className="flex-1 flex items-center justify-center gap-2 py-2 rounded bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold hover:bg-emerald-600/30 transition-colors disabled:opacity-50"
                    >
                      {confirmMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                      Confirm & Apply
                    </button>
                    <button
                      onClick={() => rejectMutation.mutate()}
                      disabled={rejectMutation.isPending}
                      className="px-4 flex items-center justify-center gap-2 py-2 rounded bg-red-600/10 text-red-400 border border-red-500/20 text-xs font-bold hover:bg-red-600/20 transition-colors disabled:opacity-50"
                    >
                      <XOctagon className="w-3 h-3" /> Reject
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-20 text-slate-500">
              <Brain className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-lg font-semibold">Drop a document to analyze</p>
              <p className="text-sm mt-1">AI will extract identity, classify, assess legal impact, and suggest actions</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
