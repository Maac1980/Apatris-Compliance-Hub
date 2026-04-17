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
import { useLocation } from "wouter";
import {
  Shield, Users, XOctagon, AlertTriangle, CheckCircle2, Loader2, Stamp,
  Scale, FileSignature, Brain, ChevronRight, Radio, Zap, Search, BookOpen, ArrowLeft, Download,
  Clock, Copy, UserCheck,
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

type ToolkitTab = "appeal" | "authority" | "reasoning" | "brief" | "poa" | "timeline";

function downloadAsDoc(content: string, filename: string) {
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>${filename}</title></head><body style="font-family:Arial,sans-serif;font-size:12px;line-height:1.6;">${content.replace(/\n/g, "<br>")}</body></html>`;
  const blob = new Blob([html], { type: "application/msword" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `${filename}.doc`; a.click();
  URL.revokeObjectURL(url);
}

function AppealDraftingTab({ snapshot }: { snapshot: any }) {
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const basis = snapshot?.appealBasis ?? [];
  const deadline = snapshot?.appealDeadlineNote;
  const workerName = snapshot?.workerName ?? "Worker";

  const getPlainText = () => {
    const lines = [
      `APPEAL DRAFT — ${workerName}`,
      `Date: ${new Date().toLocaleDateString("en-GB")}`,
      `Employer: Apatris Sp. z o.o., NIP: 5252828706`,
      ``,
      `APPEAL BASIS:`,
      ...basis.map((b: string) => `- ${b}`),
      deadline ? `\nDeadline Note: ${deadline}` : "",
      `\nAPPEAL TEXT:`,
      draft || "(Draft your appeal text in the textarea above)",
    ].filter(Boolean);
    return lines.join("\n");
  };

  const exportAppeal = () => {
    const content = [
      `<h2>Appeal Draft — ${workerName}</h2>`,
      `<p><strong>Date:</strong> ${new Date().toLocaleDateString("en-GB")}</p>`,
      `<p><strong>Employer:</strong> Apatris Sp. z o.o., NIP: 5252828706</p>`,
      `<hr>`,
      `<h3>Appeal Basis</h3>`,
      `<ul>${basis.map((b: string) => `<li>${b}</li>`).join("")}</ul>`,
      deadline ? `<p><strong>Deadline Note:</strong> ${deadline}</p>` : "",
      `<h3>Appeal Text</h3>`,
      `<p>${draft || "(Draft your appeal text in the textarea above)"}</p>`,
      `<hr>`,
      `<p style="color:#999;font-size:10px;">Generated by Apatris Compliance Hub — ${new Date().toISOString()}</p>`,
    ].join("\n");
    downloadAsDoc(content, `appeal-${workerName.replace(/\s+/g, "-").toLowerCase()}`);
  };

  const copyAppeal = () => {
    navigator.clipboard.writeText(getPlainText()).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Appeal Drafting</p>
        {basis.length > 0 && (
          <div className="flex gap-1">
            <button onClick={copyAppeal} className="flex items-center gap-1 px-2 py-1 rounded bg-slate-700 text-slate-300 text-[9px] font-bold hover:bg-slate-600">
              <Copy className="w-3 h-3" /> {copied ? "Copied!" : "Copy"}
            </button>
            <button onClick={exportAppeal} className="flex items-center gap-1 px-2 py-1 rounded bg-purple-500/20 text-purple-400 text-[9px] font-bold hover:bg-purple-500/30">
              <Download className="w-3 h-3" /> Export .doc
            </button>
          </div>
        )}
      </div>
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
  const [copied, setCopied] = useState(false);
  const ctx = snapshot?.authorityDraftContext;
  if (!ctx) return <p className="text-xs text-slate-600 py-4">No authority draft context available. This section activates for non-VALID legal statuses.</p>;

  const getPlainText = () => {
    const lines = [
      `AUTHORITY LETTER — ${ctx.workerName ?? "Worker"}`,
      `Date: ${new Date().toLocaleDateString("en-GB")}`,
      `From: Apatris Sp. z o.o., NIP: 5252828706, ul. Chlodna 51, 00-867 Warszawa`,
      ctx.caseReference ? `Case Reference: ${ctx.caseReference}` : "",
      ``,
      `Worker: ${ctx.workerName ?? "—"}`,
      ctx.employerName ? `Employer: ${ctx.employerName}` : "",
      `Current Status: ${ctx.currentStatus?.replace(/_/g, " ") ?? "—"}`,
      ctx.decisionOutcome ? `Decision: ${ctx.decisionOutcome}` : "",
      ctx.keyFacts?.length > 0 ? `\nKEY FACTS:\n${ctx.keyFacts.map((f: string) => `- ${f}`).join("\n")}` : "",
      ctx.missingDocuments?.length > 0 ? `\nMISSING DOCUMENTS:\n${ctx.missingDocuments.map((d: string) => `- ${d}`).join("\n")}` : "",
      ctx.nextAuthorityActions?.length > 0 ? `\nREQUIRED ACTIONS:\n${ctx.nextAuthorityActions.map((a: string, i: number) => `${i + 1}. ${a}`).join("\n")}` : "",
      `\n\nSincerely,\n_________________________\nApatris Sp. z o.o.`,
    ].filter(Boolean);
    return lines.join("\n");
  };

  const exportLetter = () => {
    const content = [
      `<h2>Authority Letter — ${ctx.workerName ?? "Worker"}</h2>`,
      `<p><strong>Date:</strong> ${new Date().toLocaleDateString("en-GB")}</p>`,
      `<p><strong>From:</strong> Apatris Sp. z o.o., NIP: 5252828706, ul. Chlodna 51, 00-867 Warszawa</p>`,
      ctx.caseReference ? `<p><strong>Case Reference:</strong> ${ctx.caseReference}</p>` : "",
      `<hr>`,
      `<p><strong>Worker:</strong> ${ctx.workerName ?? "—"}</p>`,
      ctx.employerName ? `<p><strong>Employer:</strong> ${ctx.employerName}</p>` : "",
      `<p><strong>Current Status:</strong> ${ctx.currentStatus?.replace(/_/g, " ") ?? "—"}</p>`,
      ctx.decisionOutcome ? `<p><strong>Decision:</strong> ${ctx.decisionOutcome}</p>` : "",
      ctx.keyFacts?.length > 0 ? `<h3>Key Facts</h3><ul>${ctx.keyFacts.map((f: string) => `<li>${f}</li>`).join("")}</ul>` : "",
      ctx.missingDocuments?.length > 0 ? `<h3>Missing Documents</h3><ul>${ctx.missingDocuments.map((d: string) => `<li>${d}</li>`).join("")}</ul>` : "",
      ctx.nextAuthorityActions?.length > 0 ? `<h3>Required Actions</h3><ol>${ctx.nextAuthorityActions.map((a: string) => `<li>${a}</li>`).join("")}</ol>` : "",
      `<br><br>`,
      `<p>Sincerely,</p>`,
      `<p>_________________________</p>`,
      `<p>Apatris Sp. z o.o.</p>`,
      `<hr>`,
      `<p style="color:#999;font-size:10px;">Generated by Apatris Compliance Hub — ${new Date().toISOString()}</p>`,
    ].join("\n");
    downloadAsDoc(content, `authority-letter-${(ctx.workerName ?? "worker").replace(/\s+/g, "-").toLowerCase()}`);
  };

  const copyLetter = () => {
    navigator.clipboard.writeText(getPlainText()).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Authority Letter Context</p>
        <div className="flex gap-1">
          <button onClick={copyLetter} className="flex items-center gap-1 px-2 py-1 rounded bg-slate-700 text-slate-300 text-[9px] font-bold hover:bg-slate-600">
            <Copy className="w-3 h-3" /> {copied ? "Copied!" : "Copy"}
          </button>
          <button onClick={exportLetter} className="flex items-center gap-1 px-2 py-1 rounded bg-slate-700 text-slate-300 text-[9px] font-bold hover:bg-slate-600">
            <Download className="w-3 h-3" /> Export .doc
          </button>
        </div>
      </div>
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

// ═══ TAB 4: LEGAL BRIEF ══════════════════════════════════════════════════════

const PRESET_QUESTIONS = [
  { label: "Work permit status", q: "What is the current work permit status and what actions are needed?" },
  { label: "TRC renewal steps", q: "What are the steps to renew a TRC (Temporary Residence Card) application?" },
  { label: "Art. 108 eligibility", q: "Is this worker eligible for Art. 108 continuity protection?" },
  { label: "Employer obligations", q: "What are the employer obligations for this worker under Polish law?" },
  { label: "Penalty risks", q: "What fines or penalties could apply if compliance is not maintained?" },
  { label: "Document checklist", q: "What documents are required for this worker's legal compliance?" },
];

function LegalBriefTab({ snapshot, workerName }: { snapshot: any; workerName: string }) {
  const [answer, setAnswer] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [activeQ, setActiveQ] = useState<string | null>(null);
  const [briefCopied, setBriefCopied] = useState(false);

  const copyBrief = () => {
    if (!answer) return;
    const text = [
      answer.answer,
      answer.legal_basis?.length > 0 ? `\nLegal Basis:\n${answer.legal_basis.map((lb: any) => typeof lb === "string" ? `- ${lb}` : `- ${lb.law ?? ""} ${lb.article ?? ""}: ${lb.explanation ?? ""}`).join("\n")}` : "",
      answer.next_actions?.length > 0 || answer.actionItems?.length > 0 ? `\nNext Actions:\n${(answer.next_actions ?? answer.actionItems ?? []).map((a: string, i: number) => `${i + 1}. ${a}`).join("\n")}` : "",
    ].filter(Boolean).join("\n");
    navigator.clipboard.writeText(text).then(() => { setBriefCopied(true); setTimeout(() => setBriefCopied(false), 2000); });
  };

  const askQuestion = useCallback(async (question: string) => {
    setLoading(true);
    setActiveQ(question);
    setAnswer(null);
    try {
      const status = snapshot?.legalStatus ?? "unknown";
      const missing = (snapshot?.missingRequirements ?? []).join(", ") || "none identified";
      const contextQuery = `Regarding worker "${workerName}" (current status: ${status}, missing documents: ${missing}): ${question}`;

      const res = await fetch(`${BASE}api/immigration/search`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ query: contextQuery, language: "en" }),
      });
      if (!res.ok) throw new Error("Search failed");
      setAnswer(await res.json());
    } catch {
      setAnswer({ answer: "Failed to retrieve answer. Please try again.", decision: "CAUTION", confidence: 0 });
    }
    setLoading(false);
  }, [snapshot, workerName]);

  return (
    <div className="space-y-3">
      <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Legal Brief — Quick Q&A</p>

      {/* Preset buttons */}
      <div className="flex flex-wrap gap-1.5">
        {PRESET_QUESTIONS.map((pq, i) => (
          <button
            key={i}
            onClick={() => askQuestion(pq.q)}
            disabled={loading}
            className={`px-2.5 py-1.5 rounded-lg text-[10px] font-medium border transition-colors disabled:opacity-50 ${
              activeQ === pq.q ? "bg-[#C41E18]/10 border-[#C41E18]/30 text-white" : "bg-slate-800 border-slate-700 text-slate-400 hover:text-white hover:border-slate-600"
            }`}
          >
            {pq.label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-2 py-4 justify-center">
          <Loader2 className="w-4 h-4 text-slate-500 animate-spin" />
          <span className="text-xs text-slate-500">Searching legal knowledge...</span>
        </div>
      )}

      {/* Answer */}
      {answer && !loading && (
        <div className="space-y-2.5">
          {/* Decision badge + confidence + copy */}
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
              answer.decision === "PROCEED" ? "bg-emerald-500/20 text-emerald-400" :
              answer.decision === "BLOCKED" ? "bg-red-500/20 text-red-400" :
              "bg-amber-500/20 text-amber-400"
            }`}>{answer.decision ?? "CAUTION"}</span>
            {typeof answer.confidence === "number" && (
              <span className="text-[9px] text-slate-500">{Math.round(answer.confidence * 100)}% confidence</span>
            )}
            <button onClick={copyBrief} className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded bg-slate-700 text-slate-300 text-[9px] font-bold hover:bg-slate-600">
              <Copy className="w-3 h-3" /> {briefCopied ? "Copied!" : "Copy"}
            </button>
          </div>

          {/* Main answer */}
          <p className="text-[11px] text-slate-300 leading-relaxed">{answer.answer}</p>

          {/* Structured fields */}
          {answer.legal_basis?.length > 0 && (
            <div>
              <p className="text-[9px] text-slate-500 uppercase font-bold mb-0.5">Legal Basis</p>
              {answer.legal_basis.map((lb: any, i: number) => (
                <p key={i} className="text-[10px] text-slate-400 ml-2">
                  {typeof lb === "string" ? lb : `${lb.law ?? ""} ${lb.article ?? ""} — ${lb.explanation ?? ""}`}
                </p>
              ))}
            </div>
          )}

          {answer.risks?.length > 0 && (
            <div>
              <p className="text-[9px] text-red-400/70 uppercase font-bold mb-0.5">Risks</p>
              {answer.risks.map((r: string, i: number) => (
                <p key={i} className="text-[10px] text-red-300/80 ml-2">- {r}</p>
              ))}
            </div>
          )}

          {answer.deadlines?.length > 0 && (
            <div>
              <p className="text-[9px] text-amber-400/70 uppercase font-bold mb-0.5">Deadlines</p>
              {answer.deadlines.map((d: string, i: number) => (
                <p key={i} className="text-[10px] text-amber-300/80 ml-2">- {d}</p>
              ))}
            </div>
          )}

          {(answer.next_actions?.length > 0 || answer.actionItems?.length > 0) && (
            <div>
              <p className="text-[9px] text-blue-400/70 uppercase font-bold mb-0.5">Next Actions</p>
              {(answer.next_actions ?? answer.actionItems ?? []).map((a: string, i: number) => (
                <p key={i} className="text-[10px] text-blue-300/80 ml-2">{i + 1}. {a}</p>
              ))}
            </div>
          )}

          {answer.required_documents?.length > 0 && (
            <div>
              <p className="text-[9px] text-slate-500 uppercase font-bold mb-0.5">Required Documents</p>
              {answer.required_documents.map((d: string, i: number) => (
                <p key={i} className="text-[10px] text-slate-400 ml-2">- {d}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {!answer && !loading && (
        <p className="text-xs text-slate-600 py-4">Select a question above to get a worker-specific legal brief.</p>
      )}
    </div>
  );
}

// ═══ TAB 5: POA GENERATOR ════════════════════════════════════════════════════

function POAGeneratorTab({ snapshot }: { snapshot: any }) {
  const [poaType, setPoaType] = useState<"general" | "mos" | "voivodeship">("general");
  const [copied, setCopied] = useState(false);
  const workerName = snapshot?.workerName ?? "Worker";
  const passportNo = snapshot?.trustedInputs?.find((t: any) => t.field === "passport_number")?.value ?? "[PASSPORT_NO]";
  const pesel = snapshot?.trustedInputs?.find((t: any) => t.field === "pesel")?.value ?? "[PESEL]";

  const templates: Record<string, { title: string; content: string }> = {
    general: {
      title: "General Power of Attorney",
      content: `PELNOMOCNICTWO OGOLNE / GENERAL POWER OF ATTORNEY

I, ${workerName}, holder of passport no. ${passportNo}, PESEL: ${pesel},

hereby authorize Apatris Sp. z o.o. (NIP: 5252828706, KRS: 0001058153), registered at ul. Chlodna 51, 00-867 Warszawa, represented by Manish Shetty (CEO),

to act on my behalf in all matters related to:
- Filing and managing immigration applications (TRC, work permits, Oswiadczenie)
- Correspondence with voivodeship offices and the MOS 2.0 portal
- Collecting and submitting documents required for legal stay and employment in Poland
- Representing me before Polish administrative authorities

This power of attorney is valid from ${new Date().toLocaleDateString("en-GB")} until revoked in writing.

Signed: _________________________
${workerName}
Date: ${new Date().toLocaleDateString("en-GB")}
Place: Warszawa`,
    },
    mos: {
      title: "MOS 2.0 Portal Power of Attorney",
      content: `PELNOMOCNICTWO DO OBSLUGI MOS 2.0

I, ${workerName}, passport no. ${passportNo}, PESEL: ${pesel},

hereby authorize Apatris Sp. z o.o. (NIP: 5252828706), acting through its designated representatives, to:

1. Access and manage my applications on the MOS 2.0 portal (Modul Obslugi Spraw)
2. Submit Temporary Residence Card (TRC) applications electronically
3. Upload supporting documents including Annex 1 (employer attachment)
4. Receive and acknowledge electronic notifications (UPO) on my behalf
5. Sign documents using the employer's Trusted Profile (Profil Zaufany)

This authorization covers all electronic filings required under the April 2026 digital mandate.

Valid from: ${new Date().toLocaleDateString("en-GB")}
Valid until: revoked in writing

Signed: _________________________
${workerName}`,
    },
    voivodeship: {
      title: "Voivodeship Office Representation",
      content: `PELNOMOCNICTWO DO REPREZENTACJI PRZED URZEDEM WOJEWODZKIM

I, ${workerName}, passport no. ${passportNo}, PESEL: ${pesel},

hereby authorize Apatris Sp. z o.o. (NIP: 5252828706, KRS: 0001058153), to represent me before the Voivodeship Office in all matters concerning:

- Temporary Residence Card (Karta Pobytu) applications and renewals
- Work permit applications (Type A, B, C)
- Collection of decisions, stamps, and documents
- Filing appeals against negative decisions
- Submitting additional documents and clarifications

The authorized representative: Manish Shetty (CEO) or any designated employee of Apatris Sp. z o.o.

Stamp duty: 17 PLN paid to the account of the relevant municipality.

Valid from: ${new Date().toLocaleDateString("en-GB")}
Valid until: revoked in writing

Signed: _________________________
${workerName}
Date: ${new Date().toLocaleDateString("en-GB")}`,
    },
  };

  const current = templates[poaType];

  const exportPOA = () => {
    const html = [
      `<h2>${current.title}</h2>`,
      `<pre style="font-family:Arial;font-size:12px;white-space:pre-wrap;">${current.content}</pre>`,
      `<hr>`,
      `<p style="color:#999;font-size:10px;">Generated by Apatris Compliance Hub — ${new Date().toISOString()}</p>`,
    ].join("\n");
    downloadAsDoc(html, `poa-${poaType}-${workerName.replace(/\s+/g, "-").toLowerCase()}`);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(current.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Power of Attorney Generator</p>
        <div className="flex gap-1">
          <button onClick={copyToClipboard} className="flex items-center gap-1 px-2 py-1 rounded bg-slate-700 text-slate-300 text-[9px] font-bold hover:bg-slate-600">
            <Copy className="w-3 h-3" /> {copied ? "Copied!" : "Copy"}
          </button>
          <button onClick={exportPOA} className="flex items-center gap-1 px-2 py-1 rounded bg-violet-500/20 text-violet-400 text-[9px] font-bold hover:bg-violet-500/30">
            <Download className="w-3 h-3" /> Export .doc
          </button>
        </div>
      </div>
      <div className="flex gap-1">
        {([
          { key: "general" as const, label: "General POA" },
          { key: "mos" as const, label: "MOS 2.0 Portal" },
          { key: "voivodeship" as const, label: "Voivodeship Office" },
        ]).map(t => (
          <button key={t.key} onClick={() => setPoaType(t.key)}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-colors ${
              poaType === t.key ? "bg-violet-500/20 text-violet-400 border border-violet-500/30" : "text-slate-500 hover:text-slate-300"
            }`}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3 max-h-64 overflow-y-auto">
        <p className="text-[10px] font-bold text-white mb-2">{current.title}</p>
        <pre className="text-[10px] text-slate-300 whitespace-pre-wrap font-sans leading-relaxed">{current.content}</pre>
      </div>
    </div>
  );
}

// ═══ TAB 6: WORKER LEGAL TIMELINE ═══════════════════════════════════════════

function WorkerTimelineTab({ snapshot, workerId }: { snapshot: any; workerId: string | null }) {
  const workerName = snapshot?.workerName ?? "Worker";

  const events = useMemo(() => {
    if (!snapshot) return [];
    const items: { date: string; label: string; detail: string; status: "ok" | "warn" | "danger" | "info" }[] = [];

    if (snapshot.trcExpiry) {
      const exp = new Date(snapshot.trcExpiry);
      items.push({
        date: snapshot.trcExpiry,
        label: "TRC Expiry",
        detail: `Karta Pobytu expires ${exp.toLocaleDateString("en-GB")}`,
        status: exp.getTime() < Date.now() ? "danger" : exp.getTime() < Date.now() + 60 * 86_400_000 ? "warn" : "ok",
      });
    }

    if (snapshot.workPermitExpiry) {
      const exp = new Date(snapshot.workPermitExpiry);
      items.push({
        date: snapshot.workPermitExpiry,
        label: "Work Permit Expiry",
        detail: `Work authorization expires ${exp.toLocaleDateString("en-GB")}`,
        status: exp.getTime() < Date.now() ? "danger" : exp.getTime() < Date.now() + 60 * 86_400_000 ? "warn" : "ok",
      });
    }

    if (snapshot.passportExpiry) {
      const exp = new Date(snapshot.passportExpiry);
      items.push({
        date: snapshot.passportExpiry,
        label: "Passport Expiry",
        detail: `Passport expires ${exp.toLocaleDateString("en-GB")}`,
        status: exp.getTime() < Date.now() ? "danger" : exp.getTime() < Date.now() + 90 * 86_400_000 ? "warn" : "ok",
      });
    }

    if (snapshot.art108Active) {
      items.push({ date: new Date().toISOString().slice(0, 10), label: "Art. 108 Active", detail: "Legal stay protected under Art. 108 continuity while TRC application is pending", status: "info" });
    }

    if (snapshot.upoDate) {
      items.push({ date: snapshot.upoDate, label: "UPO Filed", detail: "Digital filing receipt (UPO) received via MOS portal", status: "ok" });
    }

    if (snapshot.mosStatus && snapshot.mosStatus !== "not_filed") {
      items.push({ date: new Date().toISOString().slice(0, 10), label: `MOS: ${snapshot.mosStatus.replace(/_/g, " ")}`, detail: "MOS 2.0 application status", status: snapshot.mosStatus === "correct_submission" ? "ok" : snapshot.mosStatus === "rejected" ? "danger" : "info" });
    }

    (snapshot.trustedInputs ?? []).forEach((ti: any) => {
      if (ti.approvedAt) {
        items.push({ date: ti.approvedAt, label: `${ti.field?.replace(/_/g, " ")} Verified`, detail: `Value: ${ti.value} — Source: ${ti.source === "ai" ? "AI" : "Manual"}`, status: "ok" });
      }
    });

    items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return items;
  }, [snapshot]);

  const statusStyle = {
    ok: { color: "text-emerald-400", bg: "bg-emerald-500" },
    warn: { color: "text-amber-400", bg: "bg-amber-500" },
    danger: { color: "text-red-400", bg: "bg-red-500" },
    info: { color: "text-blue-400", bg: "bg-blue-500" },
  };

  return (
    <div className="space-y-3">
      <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Legal Timeline — {workerName}</p>
      {events.length === 0 ? (
        <p className="text-xs text-slate-600 py-4">No timeline events available. Select a worker to view their legal history.</p>
      ) : (
        <div className="relative">
          <div className="absolute left-[7px] top-2 bottom-2 w-px bg-slate-800" />
          <div className="space-y-3">
            {events.map((ev, i) => {
              const s = statusStyle[ev.status];
              return (
                <div key={i} className="flex items-start gap-3 relative">
                  <div className={`w-[15px] h-[15px] rounded-full ${s.bg} border-2 border-slate-950 z-10 flex-shrink-0 mt-0.5`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-[11px] font-bold ${s.color}`}>{ev.label}</span>
                      <span className="text-[9px] text-slate-500">{new Date(ev.date).toLocaleDateString("en-GB")}</span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">{ev.detail}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
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
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error((e as any).error || "Failed to load data"); }
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
    { key: "appeal", label: "Appeals", icon: Scale },
    { key: "authority", label: "Letters", icon: FileSignature },
    { key: "reasoning", label: "Reasoning", icon: Brain },
    { key: "brief", label: "Brief", icon: BookOpen },
    { key: "poa", label: "POA", icon: UserCheck },
    { key: "timeline", label: "Timeline", icon: Clock },
  ];

  return (
    <div className="h-screen flex flex-col bg-slate-950 text-slate-200 overflow-hidden">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-900/50 px-4 py-3 flex items-center gap-3 flex-shrink-0">
        <a href="/legal-immigration" className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white hover:border-slate-600 transition-colors" title="Back to Legal Immigration">
          <ArrowLeft className="w-4 h-4" />
        </a>
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
                  {toolkitTab === "brief" && <LegalBriefTab snapshot={legalStatus} workerName={legalStatus?.workerName ?? "Worker"} />}
                  {toolkitTab === "poa" && <POAGeneratorTab snapshot={legalStatus} />}
                  {toolkitTab === "timeline" && <WorkerTimelineTab snapshot={legalStatus} workerId={selectedWorkerId} />}
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
