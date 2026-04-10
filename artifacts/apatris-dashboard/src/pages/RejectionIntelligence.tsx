/**
 * Rejection Intelligence — classify negative decisions, generate AI appeal letters.
 */

import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { authHeaders, BASE, extractList } from "@/lib/api";
import { SmartDocumentDrop } from "@/components/SmartDocumentDrop";
import {
  AlertTriangle, FileText, Loader2, Brain, Shield,
  CheckCircle2, HelpCircle, Clock, Scale, Copy, Download,
  CalendarClock, Gavel,
} from "lucide-react";
import { ApprovalBadge, UnapprovedWarning } from "@/components/ApprovalBadge";

// ═══ TYPES ══════════════════════════════════════════════════════════════════

interface ClassifyResult {
  id: string;
  category: string;
  explanation: string;
  explanationEN: string;
  likelyCause: string;
  likelyCauseEN: string;
  nextSteps: string[];
  nextStepsEN: string[];
  appealPossible: boolean;
  confidence: number;
  reviewRequired: boolean;
  sourceType: string;
}

interface AppealLetter {
  appealText: string;
  appealTextPL: string;
  legalBasis: string[];
  arguments: string[];
  evidenceRequired: string[];
  deadlineDate: string | null;
  reviewRequired: boolean;
}

// ═══ DISPLAY CONFIG ═════════════════════════════════════════════════════════

const CAT_STYLE: Record<string, { label: string; color: string; bg: string; icon: typeof AlertTriangle }> = {
  MISSING_DOCS:          { label: "Missing Docs",    color: "text-amber-400",   bg: "bg-amber-500/10",   icon: FileText },
  FORMAL_DEFECT:         { label: "Formal Defect",   color: "text-orange-400",  bg: "bg-orange-500/10",  icon: AlertTriangle },
  TIMING_ERROR:          { label: "Timing Error",    color: "text-red-400",     bg: "bg-red-500/10",     icon: Clock },
  EMPLOYER_ERROR:        { label: "Employer Error",  color: "text-purple-400",  bg: "bg-purple-500/10",  icon: HelpCircle },
  LEGAL_BASIS_PROBLEM:   { label: "Legal Basis",     color: "text-red-400",     bg: "bg-red-500/10",     icon: Shield },
  OTHER_REVIEW_REQUIRED: { label: "Review Required", color: "text-slate-400",   bg: "bg-slate-700/50",   icon: HelpCircle },
};

const SRC_STYLE: Record<string, { label: string; color: string }> = {
  RULE:        { label: "Rule-based",  color: "text-emerald-400" },
  AI_ASSISTED: { label: "AI Assisted", color: "text-purple-400" },
  HYBRID:      { label: "Hybrid",      color: "text-blue-400" },
};

// ═══ COMPONENT ══════════════════════════════════════════════════════════════

export default function RejectionIntelligence() {
  const { toast } = useToast();

  const [workerId, setWorkerId] = useState("");
  const [caseId, setCaseId] = useState("");
  const [rejectionText, setRejectionText] = useState("");
  const [result, setResult] = useState<ClassifyResult | null>(null);
  const [appeal, setAppeal] = useState<AppealLetter | null>(null);
  const [showPL, setShowPL] = useState(true);

  const { data: workersData } = useQuery({
    queryKey: ["workers-list-mini"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/workers`, { headers: authHeaders() });
      if (!res.ok) return [];
      const json = await res.json();
      return extractList<any>(json, "workers").slice(0, 200).map((w: any) => ({ id: w.id, full_name: w.full_name ?? w.name ?? w.id }));
    },
  });

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}api/v1/legal/rejections/analyze`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          workerId,
          caseId: caseId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(caseId) ? caseId : undefined,
          caseReference: caseId || undefined,
          rejectionText,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error ?? "Analysis failed");
      }
      return res.json() as Promise<ClassifyResult>;
    },
    onSuccess: (data) => {
      setResult(data);
      setAppeal(null);
      toast({ description: `Classified as: ${data.category}` });
    },
    onError: (err) => toast({ description: (err as Error).message, variant: "destructive" }),
  });

  const appealMutation = useMutation({
    mutationFn: async (analysisId: string) => {
      const res = await fetch(`${BASE}api/v1/legal/rejections/appeal`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ workerId, analysisId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error ?? "Appeal generation failed");
      }
      return res.json() as Promise<AppealLetter>;
    },
    onSuccess: (data) => {
      setAppeal(data);
      toast({ description: "Appeal letter generated — requires lawyer review" });
    },
    onError: (err) => toast({ description: (err as Error).message, variant: "destructive" }),
  });

  const workers = workersData ?? [];
  const catStyle = CAT_STYLE[result?.category ?? ""] ?? CAT_STYLE.OTHER_REVIEW_REQUIRED;
  const srcStyle = SRC_STYLE[result?.sourceType ?? "RULE"] ?? SRC_STYLE.RULE;
  const CatIcon = catStyle.icon;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ description: "Copied to clipboard" });
  };

  const daysUntilDeadline = appeal?.deadlineDate
    ? Math.ceil((new Date(appeal.deadlineDate).getTime() - Date.now()) / 86400000)
    : null;

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Brain className="w-7 h-7 text-[#C41E18]" />
          <h1 className="text-3xl font-bold text-white">Rejection Intelligence</h1>
        </div>
        <p className="text-gray-400">Classify rejections, generate AI appeal letters for lawyer review</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Input Panel ────────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-3">
            <h2 className="text-sm font-bold text-slate-300">Analyze Rejection</h2>

            <SmartDocumentDrop
              label="Drop rejection letter PDF — AI reads and matches worker"
              hint="Extracts worker name, rejection reasons, voivodeship, dates"
              onResult={(r) => {
                if (r.extractedFields.rejectionReasons) setRejectionText(r.extractedFields.rejectionReasons);
                else if (r.extractedFields.keyContent) setRejectionText(r.extractedFields.keyContent);
                if (r.extractedFields.caseReference) setCaseId(r.extractedFields.caseReference);
              }}
              onWorkerSelected={(id) => setWorkerId(id)}
            />

            <div className="space-y-1">
              <label className="text-xs text-slate-500">Worker</label>
              <select
                value={workerId}
                onChange={e => setWorkerId(e.target.value)}
                className="w-full text-sm bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-slate-200"
              >
                <option value="">Select worker...</option>
                {workers.map((w: any) => (
                  <option key={w.id} value={w.id}>{w.full_name ?? w.id}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-slate-500">Case Reference (optional)</label>
              <input
                type="text"
                value={caseId}
                onChange={e => setCaseId(e.target.value)}
                placeholder="e.g. WSC-II-S.6151.111539.2024"
                className="w-full text-sm bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-slate-200 placeholder:text-slate-600"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-slate-500">Rejection Text</label>
              <textarea
                value={rejectionText}
                onChange={e => setRejectionText(e.target.value)}
                placeholder="Paste the rejection notice text here (Polish or English)..."
                rows={6}
                className="w-full text-sm bg-slate-900 border border-slate-600 rounded px-2 py-2 text-slate-200 placeholder:text-slate-600 resize-none"
              />
            </div>

            <button
              onClick={() => analyzeMutation.mutate()}
              disabled={!workerId || rejectionText.trim().length < 5 || analyzeMutation.isPending}
              className="w-full flex items-center justify-center gap-2 py-2 rounded bg-[#C41E18] hover:bg-[#A31814] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold transition-colors"
            >
              {analyzeMutation.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing...</>
              ) : (
                <><Brain className="w-4 h-4" /> Analyze Rejection</>
              )}
            </button>

            {analyzeMutation.isError && (
              <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 rounded px-3 py-2">
                <AlertTriangle className="w-3.5 h-3.5" />
                {(analyzeMutation.error as Error).message}
              </div>
            )}
          </div>
        </div>

        {/* ── Result Panel ───────────────────────────────────────── */}
        <div className="space-y-4">
          {result ? (
            <>
              {/* Classification result */}
              <div className={`rounded-xl border ${catStyle.color.replace("text-", "border-").replace("400", "500/20")} ${catStyle.bg} p-4 space-y-3`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CatIcon className={`w-4 h-4 ${catStyle.color}`} />
                    <span className={`text-sm font-bold ${catStyle.color}`}>{catStyle.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${srcStyle.color} bg-slate-800`}>
                      {srcStyle.label}
                    </span>
                    {result.confidence > 0 && (
                      <span className="text-[10px] text-slate-500 font-mono">{(result.confidence * 100).toFixed(0)}%</span>
                    )}
                  </div>
                </div>

                {/* PL/EN toggle for classification */}
                <div className="flex items-center gap-1.5">
                  <button onClick={() => setShowPL(true)} className={`text-[10px] font-bold px-2 py-0.5 rounded ${showPL ? "bg-blue-600 text-white" : "bg-slate-700 text-slate-400"}`}>PL</button>
                  <button onClick={() => setShowPL(false)} className={`text-[10px] font-bold px-2 py-0.5 rounded ${!showPL ? "bg-blue-600 text-white" : "bg-slate-700 text-slate-400"}`}>EN</button>
                </div>

                <div className="rounded bg-slate-900/60 px-3 py-2">
                  <p className="text-xs text-slate-300 leading-relaxed">{showPL ? result.explanation : (result.explanationEN || result.explanation)}</p>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="rounded bg-slate-900/40 px-2 py-1.5">
                    <div className="text-slate-500 mb-0.5">Likely Cause</div>
                    <div className="text-slate-300">{showPL ? result.likelyCause : (result.likelyCauseEN || result.likelyCause)}</div>
                  </div>
                  <div className="rounded bg-slate-900/40 px-2 py-1.5">
                    <div className="text-slate-500 mb-0.5">Appeal Possible</div>
                    <div className={result.appealPossible ? "text-emerald-400 font-bold" : "text-red-400 font-bold"}>
                      {result.appealPossible ? "Yes" : "No / Unlikely"}
                    </div>
                  </div>
                </div>

                {(showPL ? result.nextSteps : (result.nextStepsEN?.length ? result.nextStepsEN : result.nextSteps)).length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Suggested Next Steps</p>
                    <ul className="space-y-0.5">
                      {(showPL ? result.nextSteps : (result.nextStepsEN?.length ? result.nextStepsEN : result.nextSteps)).map((s, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-[11px] text-slate-300">
                          <span className="text-slate-400 mt-0.5">{i + 1}.</span>
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <ApprovalBadge entityType="rejection_analysis" entityId={result.id} isApproved={false} size="sm" />

                {/* Generate Appeal Letter button */}
                {result.appealPossible && (
                  <button
                    onClick={() => appealMutation.mutate(result.id)}
                    disabled={appealMutation.isPending}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded bg-gradient-to-r from-blue-600/30 to-purple-600/30 text-blue-300 border border-blue-500/30 text-sm font-bold hover:from-blue-600/40 hover:to-purple-600/40 transition-all disabled:opacity-50"
                  >
                    {appealMutation.isPending ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> AI Writing Appeal Letter...</>
                    ) : (
                      <><Gavel className="w-4 h-4" /> Generate AI Appeal Letter</>
                    )}
                  </button>
                )}

                {!result.appealPossible && (
                  <div className="flex items-center gap-2 text-xs text-red-400/70 bg-red-500/5 rounded px-3 py-2">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Appeal unlikely for this rejection type. Consult lawyer for alternatives.
                  </div>
                )}

                {appealMutation.isError && (
                  <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 rounded px-3 py-2">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {(appealMutation.error as Error).message}
                  </div>
                )}
              </div>

              {/* ── Appeal Letter Result ──────────────────────────── */}
              {appeal && (
                <div className="space-y-4">
                  {/* Deadline warning */}
                  {appeal.deadlineDate && (
                    <div className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 border ${
                      daysUntilDeadline !== null && daysUntilDeadline <= 3
                        ? "bg-red-500/10 border-red-500/20 text-red-400"
                        : daysUntilDeadline !== null && daysUntilDeadline <= 7
                          ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
                          : "bg-blue-500/10 border-blue-500/20 text-blue-400"
                    }`}>
                      <CalendarClock className="w-4 h-4" />
                      <span className="font-bold">Appeal Deadline: {appeal.deadlineDate}</span>
                      {daysUntilDeadline !== null && (
                        <span className="ml-1">({daysUntilDeadline} days remaining)</span>
                      )}
                    </div>
                  )}

                  {/* DRAFT warning banner */}
                  <div className="flex items-center gap-2 text-xs bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 text-amber-400">
                    <Scale className="w-4 h-4" />
                    <span className="font-bold">DRAFT — REQUIRES LAWYER REVIEW BEFORE FILING</span>
                  </div>

                  {/* Legal basis & arguments */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {appeal.legalBasis.length > 0 && (
                      <div className="bg-slate-800 border border-slate-700 rounded-xl p-3">
                        <p className="text-[10px] font-bold text-purple-400 uppercase tracking-wider mb-1.5">Legal Basis</p>
                        <ul className="space-y-1">
                          {appeal.legalBasis.map((b, i) => (
                            <li key={i} className="text-[11px] text-slate-300 flex items-start gap-1.5">
                              <Scale className="w-3 h-3 mt-0.5 text-purple-400 flex-shrink-0" />
                              <span>{b}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {appeal.arguments.length > 0 && (
                      <div className="bg-slate-800 border border-slate-700 rounded-xl p-3">
                        <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mb-1.5">Key Arguments</p>
                        <ul className="space-y-1">
                          {appeal.arguments.map((a, i) => (
                            <li key={i} className="text-[11px] text-slate-300 flex items-start gap-1.5">
                              <Gavel className="w-3 h-3 mt-0.5 text-blue-400 flex-shrink-0" />
                              <span>{a}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* Evidence required */}
                  {appeal.evidenceRequired.length > 0 && (
                    <div className="bg-slate-800 border border-slate-700 rounded-xl p-3">
                      <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider mb-1.5">Evidence to Attach</p>
                      <ul className="space-y-0.5">
                        {appeal.evidenceRequired.map((e, i) => (
                          <li key={i} className="text-[11px] text-slate-300 flex items-start gap-1.5">
                            <CheckCircle2 className="w-3 h-3 mt-0.5 text-emerald-400 flex-shrink-0" />
                            <span>{e}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Appeal letter text */}
                  <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-blue-400" />
                        <span className="text-sm font-bold text-blue-400">Appeal Letter</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setShowPL(!showPL)}
                          className={`text-[10px] font-bold px-2 py-0.5 rounded transition-colors ${
                            showPL ? "bg-blue-600 text-white" : "bg-slate-700 text-slate-400"
                          }`}
                        >
                          PL
                        </button>
                        <button
                          onClick={() => setShowPL(!showPL)}
                          className={`text-[10px] font-bold px-2 py-0.5 rounded transition-colors ${
                            !showPL ? "bg-blue-600 text-white" : "bg-slate-700 text-slate-400"
                          }`}
                        >
                          EN
                        </button>
                        <button
                          onClick={() => copyToClipboard(showPL ? appeal.appealTextPL : appeal.appealText)}
                          className="text-slate-400 hover:text-white p-1"
                          title="Copy to clipboard"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="rounded bg-slate-900/80 px-4 py-3 max-h-[500px] overflow-y-auto">
                      <pre className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap font-sans">
                        {showPL ? appeal.appealTextPL : appeal.appealText}
                      </pre>
                    </div>
                  </div>

                  <UnapprovedWarning />
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-20 text-slate-500">
              <Brain className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-lg font-semibold">No analysis yet</p>
              <p className="text-sm mt-1">Drop a rejection letter or paste the text and click Analyze</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
