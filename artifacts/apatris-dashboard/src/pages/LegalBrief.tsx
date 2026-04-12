/**
 * Legal Brief — 4-stage AI legal intelligence pipeline UI.
 * Select worker → Generate → View stage-by-stage results.
 */

import React, { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { authHeaders, BASE, extractList } from "@/lib/api";
import { DecisionExplanationCard } from "@/components/DecisionExplanationCard";
import {
  Brain, Loader2, AlertTriangle, CheckCircle2, XOctagon, Scale, Gavel,
  FileText, Shield, Clock, ChevronDown, ChevronUp, Zap, Search, Copy, ArrowLeft,
} from "lucide-react";

const IMPACT_COLOR: Record<string, string> = {
  SUPPORTS: "text-emerald-400 bg-emerald-500/10",
  WEAKENS: "text-red-400 bg-red-500/10",
  UNCLEAR: "text-amber-400 bg-amber-500/10",
};

const PRESSURE_STYLE: Record<string, { color: string; bg: string }> = {
  LOW: { color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
  MEDIUM: { color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
  HIGH: { color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20" },
  CRITICAL: { color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
};

export default function LegalBrief() {
  const { toast } = useToast();
  const [workerId, setWorkerId] = useState("");
  const [rejectionText, setRejectionText] = useState("");
  const [brief, setBrief] = useState<any>(null);
  const [activeStage, setActiveStage] = useState(0);

  const { data: workersData } = useQuery({
    queryKey: ["workers-list-brief"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/workers`, { headers: authHeaders() });
      if (!res.ok) return [];
      return extractList<any>(await res.json(), "workers").slice(0, 200).map((w: any) => ({ id: w.id, name: w.full_name ?? w.name ?? w.id }));
    },
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}api/v1/legal/brief/generate`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ workerId, rejectionText: rejectionText || undefined }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error ?? "Generation failed"); }
      return res.json();
    },
    onSuccess: (data) => {
      setBrief(data);
      setActiveStage(0);
      toast({ description: data.status === "HALTED" ? "Pipeline halted — validation failed" : "Legal brief generated" });
    },
    onError: (err) => toast({ description: (err as Error).message, variant: "destructive" }),
  });

  // Fetch decision explanation when brief is available
  const { data: explanationData } = useQuery({
    queryKey: ["legal-brief-explanation", brief?.id],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/v1/decision-explanations/legal-brief`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({
          status: brief.status,
          haltedAt: brief.haltedAt,
          haltReason: brief.haltReason,
          overallConfidence: brief.overallConfidence,
          isValid: brief.isValid,
          pressureLevel: brief.stage4?.pressureLevel,
          stage1: brief.stage1,
          stage2: brief.stage2,
          stage3: brief.stage3,
          stage4: brief.stage4,
          workerName: brief.workerName,
          hasRejectionText: !!rejectionText,
        }),
      });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!brief,
  });
  const explanation = explanationData?.explanation ?? null;

  const workers = workersData ?? [];
  const s1 = brief?.stage1;
  const s2 = brief?.stage2;
  const s3 = brief?.stage3;
  const s4 = brief?.stage4;
  const s5 = brief?.stage5;
  const s6 = brief?.stage6;
  const pressure = PRESSURE_STYLE[s4?.pressureLevel] ?? PRESSURE_STYLE.LOW;

  const copyText = (text: string) => { navigator.clipboard.writeText(text); toast({ description: "Copied" }); };

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <a href="/legal-immigration" className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white hover:border-slate-600 transition-colors"><ArrowLeft className="w-4 h-4" /></a>
          <Gavel className="w-7 h-7 text-[#C41E18]" />
          <h1 className="text-2xl font-bold text-white">Legal Brief Generator</h1>
        </div>
        <p className="text-gray-400">4-stage AI pipeline: Research → Case Review → Validation → Pressure Check</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Input ─────────────────────────────────────────────── */}
        <div className="space-y-3">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-3">
            <h2 className="text-sm font-bold text-slate-300">Generate Brief</h2>
            <div className="space-y-1">
              <label className="text-xs text-slate-500">Worker</label>
              <select value={workerId} onChange={e => setWorkerId(e.target.value)}
                className="w-full text-sm bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-slate-200">
                <option value="">Select worker...</option>
                {workers.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-500">Rejection Text (optional)</label>
              <textarea value={rejectionText} onChange={e => setRejectionText(e.target.value)}
                placeholder="Paste rejection decision if available..."
                rows={4} className="w-full text-sm bg-slate-900 border border-slate-600 rounded px-2 py-2 text-slate-200 placeholder:text-slate-600 resize-none" />
            </div>
            <button onClick={() => generateMutation.mutate()}
              disabled={!workerId || generateMutation.isPending}
              className="w-full flex items-center justify-center gap-2 py-2 rounded bg-[#C41E18] hover:bg-[#A31814] disabled:opacity-50 text-white text-sm font-bold transition-colors">
              {generateMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Running pipeline...</> : <><Brain className="w-4 h-4" /> Generate Legal Brief</>}
            </button>
            {generateMutation.isPending && (
              <div className="text-[10px] text-slate-500 space-y-1">
                <p>Stage 1: Legal Research (Perplexity + Claude)...</p>
                <p>Stage 2: Case Review...</p>
                <p>Stage 3: Validation...</p>
                <p>Stage 4: Pressure Check...</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Results ───────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-4">
          {brief ? (
            <>
              {/* Status header */}
              <div className={`rounded-xl border p-3 flex items-center justify-between ${
                brief.status === "COMPLETE" ? "bg-emerald-500/10 border-emerald-500/20" :
                brief.status === "HALTED" ? "bg-red-500/10 border-red-500/20" : "bg-amber-500/10 border-amber-500/20"
              }`}>
                <div className="flex items-center gap-2">
                  {brief.status === "COMPLETE" ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> :
                   brief.status === "HALTED" ? <XOctagon className="w-4 h-4 text-red-400" /> :
                   <AlertTriangle className="w-4 h-4 text-amber-400" />}
                  <span className={`text-sm font-bold ${brief.status === "COMPLETE" ? "text-emerald-400" : brief.status === "HALTED" ? "text-red-400" : "text-amber-400"}`}>
                    {brief.status === "COMPLETE" ? "Brief Complete" : brief.status === "HALTED" ? `Pipeline Halted at ${brief.haltedAt}` : "Failed"}
                  </span>
                  <span className="text-[10px] text-slate-500">Confidence: {(brief.overallConfidence * 100).toFixed(0)}%</span>
                </div>
                <span className="text-[10px] font-bold bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded">REQUIRES LAWYER REVIEW</span>
              </div>

              {/* Decision Explanation */}
              {explanation && (explanation.decision !== "PROCEED" || explanation.confidence < 60) && (
                <DecisionExplanationCard explanation={explanation} compact={brief.status === "COMPLETE"} />
              )}

              {/* Pressure bar */}
              {s4 && (
                <div className={`rounded-xl border p-3 ${pressure.bg}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Zap className={`w-4 h-4 ${pressure.color}`} />
                    <span className={`text-sm font-bold ${pressure.color}`}>Pressure: {s4.pressureLevel}</span>
                    {s4.daysUntilDeadline !== null && (
                      <span className="text-xs text-slate-400">{s4.daysUntilDeadline < 0 ? `${Math.abs(s4.daysUntilDeadline)}d overdue` : `${s4.daysUntilDeadline}d remaining`}</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-300">{s4.deadlineRisk}</p>
                  {s4.immediateActions.length > 0 && (
                    <div className="mt-2 space-y-0.5">
                      {s4.immediateActions.map((a: string, i: number) => (
                        <p key={i} className="text-[11px] text-slate-300">- {a}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Stage tabs */}
              <div className="flex rounded-lg overflow-hidden border border-slate-700">
                {["Research", "Review", "Validate", "Pressure", "For Worker", "Appeal EN"].map((label, i) => {
                  const stageData = [s1, s2, s3, s4, s5, s6][i];
                  const isHalted = brief.status === "HALTED" && brief.haltedAt === `STAGE_${i + 1}`;
                  return (
                    <button key={i} onClick={() => setActiveStage(i)}
                      disabled={!stageData}
                      className={`flex-1 py-1.5 text-[10px] font-bold transition-colors ${
                        activeStage === i ? "bg-blue-600 text-white" :
                        isHalted ? "bg-red-600/20 text-red-400" :
                        stageData ? "bg-slate-900 text-slate-400 hover:text-white" : "bg-slate-900 text-slate-600 cursor-not-allowed"
                      }`}>
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* Stage content */}
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-3">
                {/* Stage 1: Research */}
                {activeStage === 0 && s1 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-purple-400">Legal Research</h3>
                    {s1.articles.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[10px] font-bold text-slate-500 uppercase">Applicable Articles</p>
                        {s1.articles.map((a: any, i: number) => (
                          <div key={i} className={`rounded-lg px-3 py-2 ${IMPACT_COLOR[a.impact] ?? IMPACT_COLOR.UNCLEAR}`}>
                            <div className="flex items-center gap-2 mb-1">
                              <Scale className="w-3 h-3" />
                              <span className="text-xs font-bold">{a.article}</span>
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-800">{a.impact}</span>
                            </div>
                            <p className="text-[11px] text-slate-300">{a.explanation}</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">Why: {a.whyItApplies}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {s1.proceduralNotes.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Procedural Notes</p>
                        {s1.proceduralNotes.map((n: string, i: number) => <p key={i} className="text-[11px] text-slate-300">- {n}</p>)}
                      </div>
                    )}
                    {s1.commonPatterns.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Common Patterns</p>
                        {s1.commonPatterns.map((p: string, i: number) => <p key={i} className="text-[11px] text-slate-400">- {p}</p>)}
                      </div>
                    )}
                    {s1.perplexityResearch && (
                      <details className="text-[10px]">
                        <summary className="text-slate-500 cursor-pointer">Raw Perplexity Research</summary>
                        <pre className="mt-1 text-slate-400 whitespace-pre-wrap bg-slate-900/60 rounded p-2 max-h-40 overflow-y-auto">{s1.perplexityResearch}</pre>
                      </details>
                    )}
                  </div>
                )}

                {/* Stage 2: Case Review */}
                {activeStage === 1 && s2 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-blue-400">Case Review</h3>
                    <div className="rounded bg-slate-900/60 px-3 py-2">
                      <p className="text-[10px] font-bold text-slate-500 mb-1">CASE SUMMARY</p>
                      <p className="text-xs text-slate-300">{s2.caseSummary}</p>
                    </div>
                    <div className="rounded bg-slate-900/60 px-3 py-2">
                      <p className="text-[10px] font-bold text-slate-500 mb-1">LIKELY ISSUE</p>
                      <p className="text-xs text-slate-300">{s2.likelyIssue}</p>
                    </div>
                    {s2.appealGrounds.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold text-emerald-400 uppercase mb-1">Appeal Grounds</p>
                        {s2.appealGrounds.map((g: string, i: number) => <p key={i} className="text-[11px] text-slate-300">{i + 1}. {g}</p>)}
                      </div>
                    )}
                    {s2.missingEvidence.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold text-amber-400 uppercase mb-1">Missing Evidence</p>
                        {s2.missingEvidence.map((e: string, i: number) => <p key={i} className="text-[11px] text-slate-300">- {e}</p>)}
                      </div>
                    )}
                    {s2.nextSteps.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Next Steps</p>
                        {s2.nextSteps.map((s: string, i: number) => <p key={i} className="text-[11px] text-slate-300">{i + 1}. {s}</p>)}
                      </div>
                    )}
                    {s2.lawyerReviewDraft && (
                      <div className="rounded bg-slate-900/60 px-3 py-2">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-[10px] font-bold text-slate-500">LAWYER NOTE (DRAFT)</p>
                          <button onClick={() => copyText(s2.lawyerReviewDraft)} className="text-slate-500 hover:text-white"><Copy className="w-3 h-3" /></button>
                        </div>
                        <p className="text-xs text-slate-300 whitespace-pre-wrap">{s2.lawyerReviewDraft}</p>
                      </div>
                    )}
                    {s2.appealOutlineDraft && (
                      <div className="rounded bg-blue-500/5 border border-blue-500/10 px-3 py-2">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-[10px] font-bold text-blue-400">APPEAL OUTLINE (DRAFT)</p>
                          <button onClick={() => copyText(s2.appealOutlineDraft)} className="text-slate-500 hover:text-white"><Copy className="w-3 h-3" /></button>
                        </div>
                        <pre className="text-xs text-slate-300 whitespace-pre-wrap font-sans">{s2.appealOutlineDraft}</pre>
                      </div>
                    )}
                  </div>
                )}

                {/* Stage 3: Validation */}
                {activeStage === 2 && s3 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-amber-400">Validation</h3>
                    <div className={`rounded-lg px-3 py-2 ${s3.isValid ? "bg-emerald-500/10" : "bg-red-500/10"}`}>
                      <div className="flex items-center gap-2">
                        {s3.isValid ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <XOctagon className="w-4 h-4 text-red-400" />}
                        <span className={`text-sm font-bold ${s3.isValid ? "text-emerald-400" : "text-red-400"}`}>
                          {s3.isValid ? "Validation Passed" : "Validation FAILED — Pipeline Halted"}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 mt-1">{s3.notes}</p>
                    </div>
                    {s3.issues.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-bold text-slate-500 uppercase">Issues Found</p>
                        {s3.issues.map((issue: any, i: number) => (
                          <div key={i} className={`text-[11px] rounded px-2 py-1 ${issue.severity === "CRITICAL" ? "bg-red-500/10 text-red-400" : issue.severity === "HIGH" ? "bg-orange-500/10 text-orange-400" : "bg-amber-500/10 text-amber-400"}`}>
                            <span className="font-bold">[{issue.severity}] {issue.type}:</span> {issue.description}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Stage 4: Pressure */}
                {activeStage === 3 && s4 && (
                  <div className="space-y-3">
                    <h3 className={`text-sm font-bold ${pressure.color}`}>Pressure Analysis</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded bg-slate-900/60 px-3 py-2">
                        <p className="text-[10px] text-slate-500">Pressure Level</p>
                        <p className={`text-lg font-black ${pressure.color}`}>{s4.pressureLevel}</p>
                      </div>
                      <div className="rounded bg-slate-900/60 px-3 py-2">
                        <p className="text-[10px] text-slate-500">Days to Deadline</p>
                        <p className={`text-lg font-black ${s4.daysUntilDeadline !== null && s4.daysUntilDeadline < 0 ? "text-red-400" : s4.daysUntilDeadline !== null && s4.daysUntilDeadline <= 7 ? "text-amber-400" : "text-slate-300"}`}>
                          {s4.daysUntilDeadline !== null ? (s4.daysUntilDeadline < 0 ? `${Math.abs(s4.daysUntilDeadline)}d overdue` : `${s4.daysUntilDeadline}d`) : "N/A"}
                        </p>
                      </div>
                    </div>
                    <div className="rounded bg-slate-900/60 px-3 py-2">
                      <p className="text-[10px] text-slate-500 mb-1">Deadline Risk</p>
                      <p className="text-xs text-slate-300">{s4.deadlineRisk}</p>
                    </div>
                    <div className="rounded bg-slate-900/60 px-3 py-2">
                      <p className="text-[10px] text-slate-500 mb-1">Delay Impact</p>
                      <p className="text-xs text-slate-300">{s4.delayImpact}</p>
                    </div>
                    {s4.immediateActions.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold text-red-400 uppercase mb-1">Immediate Actions Required</p>
                        {s4.immediateActions.map((a: string, i: number) => (
                          <p key={i} className="text-[11px] text-slate-300 flex items-start gap-1.5"><Zap className="w-3 h-3 text-red-400 mt-0.5 flex-shrink-0" />{a}</p>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Stage 5: Worker Explanation */}
                {activeStage === 4 && s5 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-green-400">Worker / Client Explanation</h3>
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded">Tone: {s5.toneCalibration}</span>
                        <span className="text-[9px] bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded">Lang: {s5.language}</span>
                        <button onClick={() => copyText([s5.greeting, s5.whatHappened, s5.whyItWasNegative, s5.whatWeAreDoing, s5.whatYouNeedToDo.map((t: string) => `- ${t}`).join("\n"), s5.timeline, s5.reassurance, s5.contactInfo].join("\n\n"))}
                          className="text-slate-400 hover:text-white"><Copy className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>

                    <div className="rounded-xl bg-white/5 border border-slate-600 p-5 space-y-4 text-sm text-slate-200 leading-relaxed">
                      <p className="font-semibold">{s5.greeting}</p>
                      <p>{s5.whatHappened}</p>
                      <p>{s5.whyItWasNegative}</p>
                      <p>{s5.whatWeAreDoing}</p>
                      {s5.whatYouNeedToDo.length > 0 && (
                        <div>
                          <p className="font-semibold text-xs text-slate-400 mb-1">What you need to do:</p>
                          <ul className="space-y-1">
                            {s5.whatYouNeedToDo.map((t: string, i: number) => (
                              <li key={i} className="flex items-start gap-2 text-[13px]">
                                <span className="text-green-400 mt-0.5">-</span><span>{t}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <p className="text-xs text-slate-400">{s5.timeline}</p>
                      <p>{s5.reassurance}</p>
                      <p className="text-xs text-slate-500 border-t border-slate-700 pt-3">{s5.contactInfo}</p>
                    </div>

                    <div className="flex items-center gap-2 text-[10px] text-amber-400 bg-amber-500/10 rounded px-3 py-2">
                      <AlertTriangle className="w-3 h-3" />
                      <span className="font-bold">Review before sharing with worker — this is AI-generated</span>
                    </div>
                  </div>
                )}

                {/* Stage 6: English Appeal */}
                {activeStage === 5 && s6 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-blue-400">Appeal — English Version</h3>
                      <div className="flex items-center gap-2">
                        {s6.alignedWithPolish ? (
                          <span className="text-[9px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded font-bold">Aligned with PL</span>
                        ) : (
                          <span className="text-[9px] bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded font-bold">Alignment issue</span>
                        )}
                        <button onClick={() => copyText(s6.englishAppealText)} className="text-slate-400 hover:text-white"><Copy className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>

                    <div className="rounded bg-slate-900/80 px-4 py-3 max-h-[500px] overflow-y-auto">
                      <pre className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap font-sans">{s6.englishAppealText}</pre>
                    </div>

                    {s6.translationNotes && (
                      <div className="rounded bg-slate-900/60 px-3 py-2">
                        <p className="text-[10px] font-bold text-slate-500 mb-1">Translation Notes</p>
                        <p className="text-[11px] text-slate-400">{s6.translationNotes}</p>
                      </div>
                    )}

                    {s6.structuralChanges.length > 0 && (
                      <div className="rounded bg-slate-900/60 px-3 py-2">
                        <p className="text-[10px] font-bold text-slate-500 mb-1">Structural Adaptations</p>
                        {s6.structuralChanges.map((c: string, i: number) => (
                          <p key={i} className="text-[11px] text-slate-400">- {c}</p>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center gap-2 text-[10px] text-slate-400 bg-slate-700/30 rounded px-3 py-2">
                      <Scale className="w-3 h-3" />
                      <span>For internal legal understanding only — not for submission to Polish authorities</span>
                    </div>
                  </div>
                )}

                {/* Stage 5 not available */}
                {activeStage === 4 && !s5 && (
                  <div className="text-center py-8 text-slate-500 text-xs">Worker explanation not available — pipeline may have halted before this stage</div>
                )}
                {activeStage === 5 && !s6 && (
                  <div className="text-center py-8 text-slate-500 text-xs">English appeal not available — no Polish appeal draft was generated (rejection text may be missing)</div>
                )}
              </div>
            </>
          ) : (
            <div className="text-center py-20 text-slate-500">
              <Gavel className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-lg font-semibold">Select a worker and generate</p>
              <p className="text-sm mt-1">6-stage pipeline: Research → Review → Validate → Pressure → Worker Explanation → Appeal EN</p>
              <p className="text-xs mt-2 text-slate-600">Uses Perplexity for real-time law research + Claude for analysis</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
