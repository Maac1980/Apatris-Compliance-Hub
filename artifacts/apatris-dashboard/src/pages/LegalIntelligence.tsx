import React, { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authHeaders, BASE } from "@/lib/api";
import { useSearch } from "wouter";
import {
  Search, FileText, Shield, Scale, Gavel, Clock, AlertTriangle,
  ChevronRight, Copy, Check, Loader2, BookOpen, Users, Building2,
  MapPin, Plus, Eye, Sparkles, CheckCircle2, Archive, Printer, Upload,
  Calendar, ArrowRight, FileDown, User, Building2 as Building
} from "lucide-react";
import { ContextUpload } from "@/components/ContextUpload";
import { CopilotPanel } from "@/components/CopilotPanel";
import {
  PageShell, PageHeader, TabBar, pageContentCls, sectionGap,
  cardCls as sharedCardCls, labelCls as sharedLabelCls, inputCls as sharedInputCls,
  sectionTitleCls, bodyCls, btnPrimary, tabBarCls,
} from "@/components/ui/layout";
import { exportToWord } from "@/lib/word-export";

// ═══ TYPES ══════════════════════════════════════════════════════════════════

interface MemoType { id: string; label: string; description: string }
interface Memo {
  id: string; title: string; memo_type: string; prompt: string;
  perplexity_answer: string; sources: string[]; summary: string;
  action_items: string[]; owner: string; linked_worker_id: string | null;
  linked_employer: string | null; linked_city: string | null;
  status: string; created_at: string;
}

interface PoaType { id: string; label: string; description: string }
interface DraftType { id: string; label: string; description: string }

interface Worker { id: string; name: string; nationality?: string }

type Tab = "research" | "appeal" | "poa" | "authority" | "reasoning" | "brief";

// ═══ COMPONENT ══════════════════════════════════════════════════════════════

export default function LegalIntelligence() {
  const [tab, setTab] = useState<Tab>("research");
  const qc = useQueryClient();

  // Read workerId from URL params (e.g., /legal-intelligence?workerId=xxx&tab=appeal)
  const searchStr = useSearch();
  const urlParams = new URLSearchParams(searchStr);
  const urlWorkerId = urlParams.get("workerId") ?? "";
  const urlTab = urlParams.get("tab") as Tab | null;

  useEffect(() => {
    if (urlTab && ["research", "appeal", "poa", "authority", "reasoning", "brief"].includes(urlTab)) {
      setTab(urlTab);
    }
  }, [urlTab]);

  const tabList: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "research", label: "Research", icon: Search },
    { id: "appeal", label: "Appeal", icon: Gavel },
    { id: "poa", label: "POA", icon: FileText },
    { id: "authority", label: "Authority", icon: Scale },
    { id: "brief", label: "Legal Brief", icon: Sparkles },
    { id: "reasoning", label: "Timeline", icon: Clock },
  ];

  return (
    <PageShell>
      <PageHeader icon={Shield} title="Legal Intelligence" subtitle="AI-Assisted Research · Drafting · Case Analysis" />
      <div className={pageContentCls}>
        <div className={sectionGap}>
          <TabBar tabs={tabList} active={tab} onChange={(id) => setTab(id as Tab)} />
          {tab === "research" && <ResearchTab initialWorkerId={urlWorkerId} />}
          {tab === "appeal" && <AppealTab initialWorkerId={urlWorkerId} />}
          {tab === "poa" && <PoaTab initialWorkerId={urlWorkerId} />}
          {tab === "authority" && <AuthorityTab initialWorkerId={urlWorkerId} />}
          {tab === "brief" && <BriefTab initialWorkerId={urlWorkerId} />}
          {tab === "reasoning" && <ReasoningTab initialWorkerId={urlWorkerId} />}
        </div>
      </div>
    </PageShell>
  );
}

// ═══ HELPERS ═════════════════════════════════════════════════════════════════

const inputCls = "w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500/60 placeholder:text-gray-600";
const labelCls = "block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5";
const cardCls = "rounded-xl border border-slate-700 bg-slate-800/50 p-4";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <button onClick={copy} className="p-1 rounded hover:bg-slate-700 text-slate-500 hover:text-white transition-colors" title="Copy">
      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function StatusPill({ status }: { status: string }) {
  const cls = status === "draft" ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
    : status === "in_review" || status === "reviewed" || status === "READY_FOR_REVIEW" ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
    : status === "approved" || status === "signed" || status === "APPROVED" ? "bg-green-500/20 text-green-400 border-green-500/30"
    : "bg-slate-600/30 text-slate-400 border-slate-500/30";
  return <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${cls}`}>{status}</span>;
}

/** Part 1 — Print/PDF button. Opens a print-friendly window with the content. */
function PrintButton({ title, contentPl, contentEn }: { title: string; contentPl: string; contentEn?: string }) {
  const print = () => {
    const w = window.open("", "_blank", "width=800,height=1000");
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
      <style>body{font-family:'Segoe UI',Tahoma,sans-serif;max-width:700px;margin:40px auto;padding:0 20px;color:#1e293b;line-height:1.6}
      h1{font-size:18px;border-bottom:2px solid #c41e18;padding-bottom:8px;margin-bottom:20px}
      .draft{background:#fef3c7;border:1px solid #f59e0b;padding:8px 12px;border-radius:6px;font-size:12px;font-weight:bold;color:#92400e;margin-bottom:16px}
      pre{white-space:pre-wrap;font-family:'Courier New',monospace;font-size:13px;line-height:1.7;background:#f8fafc;border:1px solid #e2e8f0;padding:16px;border-radius:8px}
      .section{margin-top:24px}.label{font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;color:#64748b;margin-bottom:6px}
      .footer{margin-top:40px;font-size:10px;color:#94a3b8;text-align:center;border-top:1px solid #e2e8f0;padding-top:12px}
      @media print{.no-print{display:none}body{margin:20px}}
      </style></head><body>
      <div class="no-print" style="margin-bottom:16px"><button onclick="window.print()" style="padding:8px 20px;background:#c41e18;color:white;border:none;border-radius:6px;font-weight:bold;cursor:pointer;font-size:13px">Print / Save as PDF</button></div>
      <div class="draft">PROJEKT / DRAFT — Requires review before use</div>
      <h1>${title}</h1>
      <pre>${contentPl.replace(/</g, "&lt;")}</pre>
      ${contentEn ? `<div class="section"><div class="label">English Translation</div><pre>${contentEn.replace(/</g, "&lt;")}</pre></div>` : ""}
      <div class="footer">Generated by Apatris Legal Intelligence · ${new Date().toLocaleDateString("en-GB")} · DRAFT</div>
      </body></html>`);
    w.document.close();
  };
  return (
    <button onClick={print} className="p-1 rounded hover:bg-slate-700 text-slate-500 hover:text-white transition-colors" title="Print / PDF">
      <Printer className="w-3.5 h-3.5" />
    </button>
  );
}

/** Part 2 — Case picker linked to a worker */
function CasePicker({ workerId, value, onChange }: { workerId: string; value: string; onChange: (v: string) => void }) {
  const { data } = useQuery<{ cases: any[] }>({
    queryKey: ["worker-legal-cases", workerId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/legal/cases/${workerId}`, { headers: authHeaders() });
      if (!res.ok) return { cases: [] };
      const json = await res.json();
      return { cases: json.cases ?? json ?? [] };
    },
    enabled: !!workerId,
    staleTime: 30_000,
  });
  const cases = data?.cases ?? [];
  if (!workerId) return <input value={value} onChange={e => onChange(e.target.value)} placeholder="Select worker first" className={inputCls} disabled />;
  if (cases.length === 0) return <div className="text-xs text-slate-500 py-2">No legal cases found for this worker</div>;
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className={inputCls}>
      <option value="">— Select Case (optional) —</option>
      {cases.map((c: any) => (
        <option key={c.id} value={c.id}>
          {c.case_type ?? c.type ?? "Case"} · {c.status} · {c.created_at ? new Date(c.created_at).toLocaleDateString() : ""}
          {c.appeal_deadline ? ` · Deadline: ${new Date(c.appeal_deadline).toLocaleDateString()}` : ""}
        </option>
      ))}
    </select>
  );
}

/**
 * OutputActions — unified action bar for all legal output cards.
 * Handles: status display, print, Word export, approve, next steps.
 */
function OutputActions({ title, contentPl, contentEn, entityType, entityId, status, workerName, documentType, onApproved }: {
  title: string; contentPl: string; contentEn?: string;
  entityType: string; entityId?: string; status: string;
  workerName?: string; documentType?: string; onApproved?: () => void;
}) {
  const [approving, setApproving] = useState(false);
  const [approvalResult, setApprovalResult] = useState<{ by?: string; at?: string } | null>(null);

  const isApproved = status === "approved" || status === "APPROVED" || !!approvalResult;

  const handleApprove = async () => {
    if (!entityId) return;
    setApproving(true);
    try {
      const res = await fetch(`${BASE}/api/v1/legal/approve`, {
        method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ entityType, entityId }),
      });
      const data = await res.json();
      setApprovalResult({ by: data.result?.approvedBy, at: data.result?.approvedAt });
      onApproved?.();
    } catch { /* failed */ }
    setApproving(false);
  };

  const handleWord = () => {
    exportToWord({
      title, contentPl, contentEn,
      isDraft: !isApproved,
      approvedBy: approvalResult?.by,
      approvedAt: approvalResult?.at,
      documentType, workerName,
    });
  };

  const NEXT_STEPS: Record<string, string[]> = {
    appeal_output: ["Ready for lawyer final review", "Print and prepare for filing", "Attach signed POA if needed"],
    poa_document: ["Ready for worker signature", "Attach 17 PLN opłata skarbowa receipt", "Submit to authority with case documents"],
    authority_draft: ["Ready for coordinator review", "Print on company letterhead", "Send to authority with tracking"],
    research_memo: ["Share with legal team", "Link findings to relevant cases"],
  };

  const btnCls = "px-2 py-1 rounded text-[10px] font-bold border transition-colors flex items-center gap-1";

  return (
    <div className="space-y-2">
      {/* Action buttons row */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <StatusPill status={isApproved ? "approved" : status} />
        <PrintButton title={title} contentPl={contentPl} contentEn={contentEn} />
        <button onClick={handleWord} className={`${btnCls} bg-blue-500/10 text-blue-400 border-blue-500/30 hover:bg-blue-500/20`} title="Export Word (.doc)">
          <FileDown className="w-3 h-3" /> Word
        </button>
        <CopyButton text={contentPl} />
        {entityId && !isApproved && (
          <button onClick={handleApprove} disabled={approving} className={`${btnCls} bg-green-500/10 text-green-400 border-green-500/30 hover:bg-green-500/20`}>
            {approving ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />} Approve
          </button>
        )}
      </div>

      {/* Approval details */}
      {isApproved && (
        <div className="flex items-center gap-2 text-[10px] text-green-400">
          <CheckCircle2 className="w-3 h-3" />
          <span className="font-bold">Approved</span>
          {approvalResult?.by && <span className="text-slate-500">by {approvalResult.by}</span>}
          {approvalResult?.at && <span className="text-slate-500">{new Date(approvalResult.at).toLocaleString()}</span>}
        </div>
      )}

      {/* Next steps after approval */}
      {isApproved && (
        <div className="p-2.5 rounded-lg bg-green-500/10 border border-green-500/20">
          <p className="text-[10px] font-bold text-green-400 uppercase tracking-widest mb-1 flex items-center gap-1"><ArrowRight className="w-3 h-3" /> Next Steps</p>
          {(NEXT_STEPS[entityType] ?? ["Ready for next step"]).map((s, i) => <p key={i} className="text-xs text-green-300/80">- {s}</p>)}
        </div>
      )}
    </div>
  );
}

/** Client/Worker explanation card — clearly separated from formal legal drafts */
function ExplanationCard({ label, audience, text, icon: Icon }: { label: string; audience: "worker" | "client"; text: string; icon: React.ElementType }) {
  if (!text) return null;
  const color = audience === "worker" ? "green" : "blue";
  return (
    <div className={`rounded-xl border bg-slate-800/50 p-4 border-${color}-500/20`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-3.5 h-3.5 text-${color}-400`} />
        <h3 className={`text-xs font-bold text-${color}-400`}>{label}</h3>
        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-${color}-500/10 text-${color}-400 border border-${color}-500/20`}>
          {audience === "worker" ? "Simple Explanation" : "Internal Communication"}
        </span>
      </div>
      <p className="text-sm text-slate-300 leading-relaxed">{text}</p>
      <p className="text-[10px] text-slate-600 mt-2">This is a plain-language explanation, not a formal legal document.</p>
    </div>
  );
}

/** Part 3 — Evidence upload directly in legal flow */
function EvidencePanel({ workerId }: { workerId: string }) {
  const { data, refetch } = useQuery<{ evidence: any[]; gaps: any; recommendedTypes: any[] }>({
    queryKey: ["worker-evidence", workerId],
    queryFn: () => fetch(`${BASE}/api/v1/legal/evidence/${workerId}`, { headers: authHeaders() }).then(r => r.json()),
    enabled: !!workerId,
  });

  if (!workerId || !data) return null;
  const { evidence = [], gaps } = data;
  return (
    <div className={cardCls}>
      <h3 className="text-xs font-bold text-white mb-2 flex items-center gap-2"><Archive className="w-3.5 h-3.5 text-blue-400" /> Evidence on File ({evidence.length})</h3>
      {evidence.length > 0 && (
        <div className="space-y-1 mb-3">
          {evidence.map((e: any) => (
            <div key={e.id} className="flex items-center justify-between text-xs p-1.5 rounded bg-slate-900">
              <span className="text-slate-300">{e.evidence_type ?? e.source_type ?? e.description ?? "Evidence"}</span>
              <div className="flex items-center gap-2">
                {e.filing_date && <span className="text-[10px] text-slate-500">{new Date(e.filing_date).toLocaleDateString()}</span>}
                <span className={`text-[10px] font-bold ${e.verified ? "text-green-400" : "text-yellow-400"}`}>{e.verified ? "Verified" : "Pending"}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      {evidence.length === 0 && <p className="text-xs text-slate-500 mb-3">No evidence uploaded yet.</p>}

      {/* Upload new evidence */}
      <div className="mt-2">
        <ContextUpload workerId={workerId} sourcePanel="legal_evidence" defaultDocType="filing_proof" compact onUploaded={() => refetch()} />
      </div>

      {gaps?.criticalMissing?.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] font-bold text-red-400 uppercase tracking-widest mb-1">Critical Missing</p>
          {gaps.criticalMissing.map((m: any) => (
            <div key={m.type} className="flex items-center gap-2 text-xs text-red-300 mb-0.5"><AlertTriangle className="w-3 h-3 flex-shrink-0" /> {m.label}</div>
          ))}
        </div>
      )}
      {gaps?.missing?.filter((m: any) => !m.critical).length > 0 && (
        <div className="mt-2">
          <p className="text-[10px] font-bold text-yellow-400 uppercase tracking-widest mb-1">Recommended</p>
          {gaps.missing.filter((m: any) => !m.critical).map((m: any) => (
            <div key={m.type} className="text-xs text-yellow-300/70 mb-0.5">- {m.label}</div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Part 5 — Document history panel for a worker */
function DocumentHistoryPanel({ workerId }: { workerId: string }) {
  const { data } = useQuery<{ documents: any[] }>({
    queryKey: ["worker-doc-history", workerId],
    queryFn: () => fetch(`${BASE}/api/v1/legal/documents-summary/${workerId}`, { headers: authHeaders() }).then(r => r.json()),
    enabled: !!workerId,
  });
  const docs = data?.documents ?? [];
  if (!workerId || docs.length === 0) return null;

  const sourceLabel = (suggestedBy: string | null, templateType: string) => {
    if (suggestedBy?.startsWith("APPEAL_ASSISTANT")) return "Appeal Assistant";
    if (suggestedBy?.startsWith("POA_GENERATOR")) return "POA Generator";
    if (suggestedBy?.startsWith("AUTHORITY_DRAFT")) return "Authority Drafting";
    if (suggestedBy?.startsWith("LEGAL_BRIEF")) return "Legal Brief";
    return templateType;
  };

  const sourceColor = (s: string) => {
    if (s === "Appeal Assistant") return "text-red-400 bg-red-500/10 border-red-500/20";
    if (s === "POA Generator") return "text-blue-400 bg-blue-500/10 border-blue-500/20";
    if (s === "Authority Drafting") return "text-green-400 bg-green-500/10 border-green-500/20";
    if (s === "Legal Brief") return "text-purple-400 bg-purple-500/10 border-purple-500/20";
    return "text-slate-400 bg-slate-500/10 border-slate-500/20";
  };

  return (
    <div className={cardCls}>
      <h3 className="text-xs font-bold text-white mb-3 flex items-center gap-2"><FileText className="w-3.5 h-3.5 text-purple-400" /> Document History ({docs.length})</h3>
      <div className="space-y-1.5">
        {docs.slice(0, 10).map((d: any, i: number) => {
          const src = sourceLabel(d.suggested_by, d.template_type);
          return (
            <div key={d.id ?? i} className="p-2 rounded-lg bg-slate-900 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-300 font-medium truncate">{d.title ?? d.template_type}</span>
                <StatusPill status={d.status} />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${sourceColor(src)}`}>{src}</span>
                <span className="text-[10px] text-slate-500">{d.created_at ? new Date(d.created_at).toLocaleDateString() : ""}</span>
                {d.approved_by && <span className="text-[10px] text-green-400">Approved by {d.approved_by}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WorkerSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { data } = useQuery<{ workers: Worker[] }>({
    queryKey: ["workers-list-mini"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/workers`, { headers: authHeaders() });
      if (!res.ok) return { workers: [] };
      const json = await res.json();
      return { workers: (json.workers ?? json ?? []).map((w: any) => ({ id: w.id, name: w.name, nationality: w.nationality })) };
    },
    staleTime: 60_000,
  });
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500/60">
      <option value="">— Select Worker —</option>
      {(data?.workers ?? []).map(w => <option key={w.id} value={w.id}>{w.name}{w.nationality ? ` (${w.nationality})` : ""}</option>)}
    </select>
  );
}

// ═══ RESEARCH TAB ═══════════════════════════════════════════════════════════

function ResearchTab({ initialWorkerId = "" }: { initialWorkerId?: string }) {
  const [title, setTitle] = useState("");
  const [memoType, setMemoType] = useState("legal_research");
  const [prompt, setPrompt] = useState("");
  const [workerId, setWorkerId] = useState(initialWorkerId);
  const [employer, setEmployer] = useState("");
  const [city, setCity] = useState("");
  const [viewMemo, setViewMemo] = useState<Memo | null>(null);
  const qc = useQueryClient();

  const { data: types } = useQuery<{ types: MemoType[] }>({
    queryKey: ["research-memo-types"],
    queryFn: () => fetch(`${BASE}/api/v1/legal/research-workspace/types`, { headers: authHeaders() }).then(r => r.json()),
  });

  const { data: memos } = useQuery<{ memos: Memo[] }>({
    queryKey: ["research-memos"],
    queryFn: () => fetch(`${BASE}/api/v1/legal/research-workspace`, { headers: authHeaders() }).then(r => r.json()),
  });

  const create = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/v1/legal/research-workspace/create`, {
        method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ title, memoType, prompt, linkedWorkerId: workerId || undefined, linkedEmployer: employer || undefined, linkedCity: city || undefined }),
      });
      return res.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["research-memos"] });
      setViewMemo(data.memo);
      setTitle(""); setPrompt(""); setWorkerId(""); setEmployer(""); setCity("");
    },
  });

  return (
    <div className="space-y-6">
      {/* Create Form */}
      <div className={cardCls}>
        <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2"><Plus className="w-4 h-4 text-blue-400" /> New Research Memo</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={labelCls}>Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. TRC renewal requirements for Ukrainian nationals" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Memo Type</label>
            <select value={memoType} onChange={e => setMemoType(e.target.value)} className={inputCls}>
              {(types?.types ?? []).map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Linked Worker</label>
            <WorkerSelect value={workerId} onChange={setWorkerId} />
          </div>
          <div>
            <label className={labelCls}>Employer (optional)</label>
            <input value={employer} onChange={e => setEmployer(e.target.value)} placeholder="Company name" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>City (optional)</label>
            <input value={city} onChange={e => setCity(e.target.value)} placeholder="e.g. Warszawa" className={inputCls} />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Research Prompt</label>
            <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={3} placeholder="What do you want to research?" className={inputCls} />
          </div>
          <div className="col-span-2">
            <button onClick={() => create.mutate()} disabled={create.isPending || !title || !prompt}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2">
              {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              {create.isPending ? "Researching..." : "Create Research Memo"}
            </button>
          </div>
        </div>
      </div>

      {/* View Memo */}
      {viewMemo && (
        <div className={`${cardCls} border-blue-500/30`}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-white">{viewMemo.title}</h3>
            <div className="flex items-center gap-2">
              <StatusPill status={viewMemo.status} />
              <CopyButton text={viewMemo.summary} />
            </div>
          </div>
          {viewMemo.summary && <div className="text-sm text-slate-300 whitespace-pre-wrap mb-3">{viewMemo.summary}</div>}
          {viewMemo.action_items?.length > 0 && (
            <div className="mb-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-blue-400 mb-1">Action Items</p>
              <ul className="space-y-1">
                {viewMemo.action_items.map((a, i) => <li key={i} className="text-xs text-slate-300 flex items-start gap-2"><ChevronRight className="w-3 h-3 mt-0.5 text-blue-400 flex-shrink-0" />{a}</li>)}
              </ul>
            </div>
          )}
          {viewMemo.sources?.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Sources ({viewMemo.sources.length})</p>
              <div className="space-y-0.5">
                {viewMemo.sources.map((s, i) => <a key={i} href={s} target="_blank" rel="noopener noreferrer" className="block text-[11px] text-blue-400 hover:text-blue-300 truncate">{s}</a>)}
              </div>
            </div>
          )}
          <button onClick={() => setViewMemo(null)} className="mt-3 text-xs text-slate-500 hover:text-white">Close</button>
        </div>
      )}

      {/* Memo List */}
      <div>
        <h2 className="text-sm font-bold text-white mb-3">Recent Memos</h2>
        {(memos?.memos ?? []).length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-8">No research memos yet.</p>
        ) : (
          <div className="space-y-2">
            {(memos?.memos ?? []).map(m => (
              <button key={m.id} onClick={() => setViewMemo(m)} className="w-full text-left p-3 rounded-lg bg-slate-800 border border-slate-700 hover:border-blue-500/30 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-white truncate">{m.title}</span>
                  <div className="flex items-center gap-2">
                    <StatusPill status={m.status} />
                    <Eye className="w-3.5 h-3.5 text-slate-500" />
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">{m.memo_type} · {m.owner} · {new Date(m.created_at).toLocaleDateString()}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══ APPEAL TAB ═════════════════════════════════════════════════════════════

function AppealTab({ initialWorkerId = "" }: { initialWorkerId?: string }) {
  const [workerId, setWorkerId] = useState(initialWorkerId);
  const [caseId, setCaseId] = useState("");
  const [rejectionText, setRejectionText] = useState("");
  const [uploadedDecision, setUploadedDecision] = useState<{ fileName: string } | null>(null);
  const [result, setResult] = useState<any>(null);
  const [outputView, setOutputView] = useState<"pl" | "en" | "simple">("pl");
  const decisionFileRef = useRef<HTMLInputElement>(null);
  const [uploadingDecision, setUploadingDecision] = useState(false);

  const run = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/v1/legal/appeal-assistant/run`, {
        method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ workerId, caseId: caseId || undefined, rejectionText: rejectionText || undefined }),
      });
      return res.json();
    },
    onSuccess: (data) => { setResult(data.output); setOutputView("pl"); },
  });

  // Upload decision file → store as worker file + extract text into rejectionText
  const handleDecisionUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !workerId) return;
    setUploadingDecision(true);
    try {
      // 1. Store file via worker-files endpoint
      const token = localStorage.getItem("apatris_jwt");
      const form = new FormData();
      form.append("file", file);
      form.append("docType", "rejection_letter");
      form.append("notes", "Decision/rejection uploaded from Appeal Assistant");
      if (caseId) form.append("caseId", caseId);
      await fetch(`${BASE}/api/workers/${workerId}/files`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });

      // 2. For text files / small PDFs, try to read text content
      if (file.type.startsWith("text/") || file.name.endsWith(".txt")) {
        const text = await file.text();
        setRejectionText(text.substring(0, 5000));
      }

      setUploadedDecision({ fileName: file.name });
    } catch { /* upload failed silently */ }
    setUploadingDecision(false);
    if (decisionFileRef.current) decisionFileRef.current.value = "";
  };

  // Determine what content is available for each output tab
  const hasPl = !!result?.appeal_draft_pl;
  const hasEn = !!result?.appeal_draft_en;
  const hasSimple = !!(result?.worker_explanation || result?.client_explanation);

  return (
    <div className="space-y-6">
      {/* ── Input Form ── */}
      <div className={cardCls}>
        <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2"><Gavel className="w-4 h-4 text-red-400" /> Appeal Assistant</h2>
        <p className="text-xs text-slate-500 mb-4">Upload the decision/rejection, then receive a Polish appeal draft, English translation, and simple explanation. All outputs are DRAFT.</p>
        <div className="space-y-3">
          <div><label className={labelCls}>Worker *</label><WorkerSelect value={workerId} onChange={setWorkerId} /></div>
          <div><label className={labelCls}>Linked Case</label><CasePicker workerId={workerId} value={caseId} onChange={setCaseId} /></div>

          {/* Decision Upload */}
          <div>
            <label className={labelCls}>Decision / Rejection Document</label>
            <input ref={decisionFileRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp,.txt" onChange={handleDecisionUpload} />
            <div className="flex items-center gap-2">
              <button
                onClick={() => decisionFileRef.current?.click()}
                disabled={uploadingDecision || !workerId}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 border-dashed text-xs font-bold transition-colors ${
                  uploadedDecision ? "bg-green-500/10 border-green-500/40 text-green-400" :
                  "bg-slate-900 border-slate-600 text-slate-400 hover:border-red-500/40 hover:text-red-400 cursor-pointer"
                } disabled:opacity-50`}
              >
                {uploadingDecision ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> :
                 uploadedDecision ? <CheckCircle2 className="w-3.5 h-3.5" /> :
                 <Upload className="w-3.5 h-3.5" />}
                {uploadingDecision ? "Uploading..." : uploadedDecision ? uploadedDecision.fileName : "Upload Decision (PDF/Image/Text)"}
              </button>
              {uploadedDecision && (
                <span className="text-[10px] text-green-400/70">Stored as evidence · auto-linked to worker{caseId ? " & case" : ""}</span>
              )}
            </div>
          </div>

          {/* Rejection text */}
          <div>
            <label className={labelCls}>Rejection Decision Text {uploadedDecision ? "(from upload or paste)" : "(paste full text)"}</label>
            <textarea value={rejectionText} onChange={e => setRejectionText(e.target.value)} rows={5}
              placeholder={uploadedDecision ? "Text extracted from upload, or paste/edit the full decision text here." : "Paste the rejection decision text here. Without this, the assistant can only provide general guidance."}
              className={inputCls} />
            {!rejectionText && <p className="text-[10px] text-yellow-500 mt-1">Without rejection text, appeal content will be limited to general guidance.</p>}
          </div>

          <button onClick={() => run.mutate()} disabled={run.isPending || !workerId}
            className="w-full py-2.5 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white rounded-lg text-sm font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2">
            {run.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gavel className="w-4 h-4" />}
            {run.isPending ? "Analyzing..." : "Run Appeal Assistant"}
          </button>
        </div>
      </div>

      {/* Evidence on file */}
      {workerId && <EvidencePanel workerId={workerId} />}

      {/* ── Results ── */}
      {result && (
        <div className="space-y-4">
          {/* Actions — View / Print / Word / Approve */}
          {hasPl && (
            <OutputActions
              title="Appeal Draft / Odwołanie"
              contentPl={result.appeal_draft_pl}
              contentEn={result.appeal_draft_en}
              entityType="appeal_output"
              entityId={result.id}
              status={result.status ?? "draft"}
              documentType="APPEAL"
            />
          )}

          {/* Validation Issues */}
          {result.validation_issues?.length > 0 && (
            <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
              <p className="text-xs font-bold text-yellow-400 mb-1">Validation Notes</p>
              {result.validation_issues.map((v: string, i: number) => <p key={i} className="text-xs text-yellow-300">{v}</p>)}
            </div>
          )}

          {/* Provider Status */}
          <div className="flex gap-2 flex-wrap">
            <span className={`px-2 py-1 rounded text-[10px] font-bold ${result.provider_status?.perplexity === "success" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
              Perplexity: {result.provider_status?.perplexity ?? "unknown"}
            </span>
            <span className={`px-2 py-1 rounded text-[10px] font-bold ${result.provider_status?.claude === "success" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
              Claude: {result.provider_status?.claude ?? "unknown"}
            </span>
            <span className="px-2 py-1 rounded text-[10px] font-bold bg-yellow-500/20 text-yellow-400">DRAFT — Requires Lawyer Review</span>
          </div>

          {/* Relevant Articles */}
          {result.relevant_articles?.length > 0 && (
            <div className={cardCls}>
              <h3 className="text-xs font-bold text-white mb-2">Relevant Articles</h3>
              <div className="space-y-1.5">
                {result.relevant_articles.map((a: any, i: number) => (
                  <div key={i} className="p-2 bg-slate-900 rounded-lg">
                    <p className="text-xs font-bold text-blue-400">{a.article}</p>
                    <p className="text-[11px] text-slate-400">{a.relevance}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Appeal Grounds + Missing Evidence */}
          {result.appeal_grounds?.length > 0 && (
            <div className={cardCls}>
              <h3 className="text-xs font-bold text-white mb-2">Appeal Grounds</h3>
              {result.appeal_grounds.map((g: string, i: number) => (
                <div key={i} className="flex items-start gap-2 mb-1.5">
                  <ChevronRight className="w-3 h-3 mt-0.5 text-green-400 flex-shrink-0" />
                  <p className="text-xs text-slate-300">{g}</p>
                </div>
              ))}
            </div>
          )}
          {result.missing_evidence?.length > 0 && (
            <div className={cardCls}>
              <h3 className="text-xs font-bold text-white mb-2 flex items-center gap-2"><AlertTriangle className="w-3.5 h-3.5 text-yellow-400" /> Missing Evidence</h3>
              {result.missing_evidence.map((ev: string, i: number) => <p key={i} className="text-xs text-yellow-300 mb-1">- {ev}</p>)}
            </div>
          )}

          {/* Lawyer Review Note */}
          {result.lawyer_review_note && (
            <div className={`${cardCls} border-purple-500/30`}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold text-purple-400">Lawyer Review Note</h3>
                <CopyButton text={result.lawyer_review_note} />
              </div>
              <p className="text-sm text-slate-300 whitespace-pre-wrap">{result.lawyer_review_note}</p>
            </div>
          )}

          {/* ── OUTPUT TABS: PL / EN / Simple ── */}
          {(hasPl || hasEn || hasSimple) && (
            <div className={`${cardCls} border-red-500/20`}>
              {/* Tab bar */}
              <div className="flex gap-0.5 p-1 bg-slate-900 rounded-lg border border-slate-700 mb-4">
                <button onClick={() => setOutputView("pl")}
                  className={`flex-1 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${outputView === "pl" ? "bg-red-700 text-white shadow" : "text-slate-500 hover:text-slate-300"}`}>
                  PL — Odwołanie
                </button>
                <button onClick={() => setOutputView("en")} disabled={!hasEn}
                  className={`flex-1 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${outputView === "en" ? "bg-blue-600 text-white shadow" : "text-slate-500 hover:text-slate-300"} disabled:opacity-30`}>
                  EN — Translation
                </button>
                <button onClick={() => setOutputView("simple")} disabled={!hasSimple}
                  className={`flex-1 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${outputView === "simple" ? "bg-green-600 text-white shadow" : "text-slate-500 hover:text-slate-300"} disabled:opacity-30`}>
                  Simple Explanation
                </button>
              </div>

              {/* PL — Formal Polish appeal */}
              {outputView === "pl" && hasPl && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-bold text-red-400">Formal Appeal Draft (Polish)</h3>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">Source Legal Version</span>
                    </div>
                    <CopyButton text={result.appeal_draft_pl} />
                  </div>
                  <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono bg-slate-900 p-3 rounded-lg max-h-[500px] overflow-y-auto leading-relaxed">{result.appeal_draft_pl}</pre>
                </div>
              )}

              {/* EN — Internal English translation */}
              {outputView === "en" && hasEn && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-bold text-blue-400">English Translation (Internal)</h3>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">Internal Only — Not for Filing</span>
                    </div>
                    <CopyButton text={result.appeal_draft_en} />
                  </div>
                  <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono bg-slate-900 p-3 rounded-lg max-h-[500px] overflow-y-auto leading-relaxed">{result.appeal_draft_en}</pre>
                </div>
              )}

              {/* Simple — Worker/Client explanation */}
              {outputView === "simple" && hasSimple && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-xs font-bold text-green-400">Simple Explanation</h3>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20">Plain Language — No Legal Jargon</span>
                  </div>
                  {result.worker_explanation && (
                    <div className="rounded-lg bg-green-500/5 border border-green-500/15 p-3">
                      <div className="flex items-center gap-2 mb-1.5">
                        <User className="w-3 h-3 text-green-400" />
                        <p className="text-[10px] font-bold text-green-400 uppercase tracking-widest">For Worker</p>
                      </div>
                      <p className="text-sm text-slate-300 leading-relaxed">{result.worker_explanation}</p>
                    </div>
                  )}
                  {result.client_explanation && (
                    <div className="rounded-lg bg-blue-500/5 border border-blue-500/15 p-3">
                      <div className="flex items-center gap-2 mb-1.5">
                        <Building className="w-3 h-3 text-blue-400" />
                        <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">For Client / Employer</p>
                      </div>
                      <p className="text-sm text-slate-300 leading-relaxed">{result.client_explanation}</p>
                    </div>
                  )}
                  <p className="text-[10px] text-slate-600">This explanation does not contain article references or legal terminology. It is not a formal document.</p>
                </div>
              )}
            </div>
          )}

          {/* Document history */}
          {workerId && <DocumentHistoryPanel workerId={workerId} />}

          {/* Copilot */}
          {workerId && <CopilotPanel workerId={workerId} panelContext="legal_case" />}
        </div>
      )}

      {/* Copilot when no result yet but worker selected */}
      {!result && workerId && <CopilotPanel workerId={workerId} panelContext="legal_case" compact />}
    </div>
  );
}

// ═══ POA TAB ════════════════════════════════════════════════════════════════

function PoaTab({ initialWorkerId = "" }: { initialWorkerId?: string }) {
  const [workerId, setWorkerId] = useState(initialWorkerId);
  const [caseId, setCaseId] = useState("");
  const [poaType, setPoaType] = useState("GENERAL");
  const [repName, setRepName] = useState("");
  const [repAddress, setRepAddress] = useState("");
  const [repBar, setRepBar] = useState("");
  const [result, setResult] = useState<any>(null);
  const qc = useQueryClient();

  const { data: types } = useQuery<{ types: PoaType[] }>({
    queryKey: ["poa-types"],
    queryFn: () => fetch(`${BASE}/api/v1/legal/poa/types`, { headers: authHeaders() }).then(r => r.json()),
  });

  const generate = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/v1/legal/poa/generate`, {
        method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ workerId, caseId: caseId || undefined, poaType, representativeName: repName, representativeAddress: repAddress || undefined, representativeBarNumber: repBar || undefined }),
      });
      return res.json();
    },
    onSuccess: (data) => setResult(data.poa),
  });

  return (
    <div className="space-y-6">
      <div className={cardCls}>
        <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2"><FileText className="w-4 h-4 text-blue-400" /> Generate Pełnomocnictwo</h2>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelCls}>Worker *</label><WorkerSelect value={workerId} onChange={setWorkerId} /></div>
          <div>
            <label className={labelCls}>POA Type</label>
            <select value={poaType} onChange={e => setPoaType(e.target.value)} className={inputCls}>
              {(types?.types ?? []).map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <div><label className={labelCls}>Linked Case</label><CasePicker workerId={workerId} value={caseId} onChange={setCaseId} /></div>
          <div><label className={labelCls}>Representative Name *</label><input value={repName} onChange={e => setRepName(e.target.value)} placeholder="Full name of attorney" className={inputCls} /></div>
          <div><label className={labelCls}>Address</label><input value={repAddress} onChange={e => setRepAddress(e.target.value)} placeholder="Office address" className={inputCls} /></div>
          <div className="col-span-2"><label className={labelCls}>Bar Number (optional)</label><input value={repBar} onChange={e => setRepBar(e.target.value)} placeholder="Nr wpisu" className={inputCls} /></div>
          <div className="col-span-2">
            <button onClick={() => generate.mutate()} disabled={generate.isPending || !workerId || !repName}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2">
              {generate.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              Generate POA
            </button>
          </div>
        </div>
      </div>

      {result && (
        <div className={`${cardCls} border-blue-500/30`}>
          <h3 className="text-sm font-bold text-white mb-3">Generated Pełnomocnictwo</h3>
          <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono bg-slate-900 p-4 rounded-lg mb-3">{result.content_pl}</pre>
          <OutputActions
            title="Pełnomocnictwo / Power of Attorney"
            contentPl={result.content_pl}
            entityType="poa_document"
            entityId={result.id}
            status={result.status ?? "draft"}
            documentType="POWER_OF_ATTORNEY"
          />
        </div>
      )}
    </div>
  );
}

// ═══ AUTHORITY TAB ══════════════════════════════════════════════════════════

function AuthorityTab({ initialWorkerId = "" }: { initialWorkerId?: string }) {
  const [workerId, setWorkerId] = useState(initialWorkerId);
  const [caseId, setCaseId] = useState("");
  const [draftType, setDraftType] = useState("CLARIFICATION_LETTER");
  const [authority, setAuthority] = useState("");
  const [caseRef, setCaseRef] = useState("");
  const [issue, setIssue] = useState("");
  const [result, setResult] = useState<any>(null);
  const [showLang, setShowLang] = useState<"pl" | "en">("pl");

  const { data: types } = useQuery<{ types: DraftType[] }>({
    queryKey: ["authority-draft-types"],
    queryFn: () => fetch(`${BASE}/api/v1/legal/authority-draft/types`, { headers: authHeaders() }).then(r => r.json()),
  });

  const generate = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/v1/legal/authority-draft/generate`, {
        method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ workerId, caseId: caseId || undefined, draftType, authorityName: authority || undefined, caseReference: caseRef || undefined, specificIssue: issue }),
      });
      return res.json();
    },
    onSuccess: (data) => setResult(data.draft),
  });

  return (
    <div className="space-y-6">
      <div className={cardCls}>
        <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2"><Scale className="w-4 h-4 text-green-400" /> Authority Response Drafting</h2>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelCls}>Worker *</label><WorkerSelect value={workerId} onChange={setWorkerId} /></div>
          <div>
            <label className={labelCls}>Draft Type</label>
            <select value={draftType} onChange={e => setDraftType(e.target.value)} className={inputCls}>
              {(types?.types ?? []).map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <div><label className={labelCls}>Linked Case</label><CasePicker workerId={workerId} value={caseId} onChange={setCaseId} /></div>
          <div><label className={labelCls}>Authority Name</label><input value={authority} onChange={e => setAuthority(e.target.value)} placeholder="e.g. Urząd Wojewódzki Mazowiecki" className={inputCls} /></div>
          <div><label className={labelCls}>Case Reference</label><input value={caseRef} onChange={e => setCaseRef(e.target.value)} placeholder="Case number" className={inputCls} /></div>
          <div className="col-span-2">
            <label className={labelCls}>Specific Issue *</label>
            <textarea value={issue} onChange={e => setIssue(e.target.value)} rows={3} placeholder="Describe what the authority is asking for or what needs to be clarified" className={inputCls} />
          </div>
          <div className="col-span-2">
            <button onClick={() => generate.mutate()} disabled={generate.isPending || !workerId || !issue}
              className="w-full py-2.5 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white rounded-lg text-sm font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2">
              {generate.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Scale className="w-4 h-4" />}
              Generate Draft
            </button>
          </div>
        </div>
      </div>

      {result && (
        <div className={`${cardCls} border-green-500/30`}>
          <h3 className="text-sm font-bold text-white mb-3">Generated Draft</h3>
          {/* Language toggle */}
          <div className="flex rounded-lg overflow-hidden border border-slate-700 mb-3 w-fit">
            <button onClick={() => setShowLang("pl")} className={`px-3 py-1.5 text-[10px] font-bold ${showLang === "pl" ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400"}`}>Polish</button>
            <button onClick={() => setShowLang("en")} className={`px-3 py-1.5 text-[10px] font-bold ${showLang === "en" ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400"}`}>English</button>
          </div>
          <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono bg-slate-900 p-4 rounded-lg max-h-96 overflow-y-auto mb-3">
            {showLang === "pl" ? result.content_pl : result.content_en}
          </pre>
          <OutputActions
            title={`Authority Draft — ${draftType}`}
            contentPl={result.content_pl}
            contentEn={result.content_en}
            entityType="authority_draft"
            entityId={result.id}
            status={result.status ?? "draft"}
            documentType={draftType}
          />
        </div>
      )}
    </div>
  );
}

// ═══ REASONING TAB ══════════════════════════════════════════════════════════

function ReasoningTab({ initialWorkerId = "" }: { initialWorkerId?: string }) {
  const [workerId, setWorkerId] = useState(initialWorkerId);
  const [panel, setPanel] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!workerId) return;
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/v1/legal/reasoning/${workerId}`, { headers: authHeaders() });
      const data = await res.json();
      setPanel(data.panel);
    } catch { /* failed */ }
    setLoading(false);
  };

  const urgencyColor = (u: string) => u === "CRITICAL" ? "text-red-400" : u === "HIGH" ? "text-orange-400" : u === "MEDIUM" ? "text-yellow-400" : "text-green-400";
  const eventColor = (t: string) => t === "deadline" ? "border-red-500/30 bg-red-500/5" : t === "filing" ? "border-green-500/30 bg-green-500/5" : t === "alert" ? "border-yellow-500/30 bg-yellow-500/5" : "border-slate-700 bg-slate-800/50";

  return (
    <div className="space-y-6">
      <div className={cardCls}>
        <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2"><Clock className="w-4 h-4 text-purple-400" /> Legal Reasoning Panel</h2>
        <div className="flex gap-3">
          <div className="flex-1"><WorkerSelect value={workerId} onChange={setWorkerId} /></div>
          <button onClick={load} disabled={loading || !workerId}
            className="px-4 py-2 bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white rounded-lg text-sm font-bold transition-all flex items-center gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
            Load
          </button>
        </div>
      </div>

      {panel && (
        <div className="space-y-4">
          {/* Urgency Banner */}
          <div className={`p-4 rounded-xl border ${panel.urgency === "CRITICAL" ? "border-red-500/50 bg-red-500/10" : panel.urgency === "HIGH" ? "border-orange-500/40 bg-orange-500/10" : "border-slate-700 bg-slate-800/50"}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Urgency</p>
                <p className={`text-lg font-black ${urgencyColor(panel.urgency)}`}>{panel.urgency}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-400">{panel.workerName}</p>
                <p className="text-xs text-slate-500">Status: {panel.legalStatus} · Risk: {panel.riskLevel}</p>
              </div>
            </div>
            {panel.urgencyReasons?.map((r: string, i: number) => <p key={i} className="text-xs text-slate-300 mt-1">- {r}</p>)}
          </div>

          {/* Legal Card Facts */}
          <div className={cardCls}>
            <h3 className="text-xs font-bold text-white mb-2">Legal Card Facts</h3>
            <div className="grid grid-cols-2 gap-1.5 text-xs">
              {Object.entries(panel.legalCardFacts ?? {}).map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span className="text-slate-500">{k}</span>
                  <span className="text-slate-300 font-mono">{String(v ?? "—")}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Active Case */}
          {panel.activeCase && (
            <div className={`${cardCls} border-blue-500/20`}>
              <h3 className="text-xs font-bold text-blue-400 mb-2">Active Case</h3>
              <div className="grid grid-cols-2 gap-1.5 text-xs">
                <div className="flex justify-between"><span className="text-slate-500">Type</span><span className="text-white">{panel.activeCase.type}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Status</span><span className="text-white">{panel.activeCase.status}</span></div>
                {panel.activeCase.appealDeadline && <div className="flex justify-between"><span className="text-slate-500">Appeal Deadline</span><span className="text-red-400 font-bold">{panel.activeCase.appealDeadline}</span></div>}
                {panel.activeCase.nextAction && <div className="flex justify-between col-span-2"><span className="text-slate-500">Next Action</span><span className="text-yellow-400">{panel.activeCase.nextAction}</span></div>}
              </div>
            </div>
          )}

          {/* Warnings + Required Actions */}
          {panel.warnings?.length > 0 && (
            <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
              <p className="text-[10px] font-bold text-yellow-400 mb-1">Warnings</p>
              {panel.warnings.map((w: string, i: number) => <p key={i} className="text-xs text-yellow-300">- {w}</p>)}
            </div>
          )}
          {panel.requiredActions?.length > 0 && (
            <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
              <p className="text-[10px] font-bold text-blue-400 mb-1">Required Actions</p>
              {panel.requiredActions.map((a: string, i: number) => <p key={i} className="text-xs text-blue-300">- {a}</p>)}
            </div>
          )}

          {/* Timeline */}
          <div className={cardCls}>
            <h3 className="text-xs font-bold text-white mb-3">Timeline</h3>
            <div className="space-y-2">
              {(panel.timeline ?? []).map((ev: any, i: number) => (
                <div key={i} className={`p-2.5 rounded-lg border ${eventColor(ev.type)}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">{ev.title}</span>
                    <span className="text-[10px] text-slate-500 font-mono">{new Date(ev.date).toLocaleDateString()}</span>
                  </div>
                  {ev.description && <p className="text-[11px] text-slate-400 mt-0.5">{ev.description}</p>}
                </div>
              ))}
              {(!panel.timeline || panel.timeline.length === 0) && <p className="text-xs text-slate-500 text-center py-4">No timeline events.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══ LEGAL BRIEF TAB (wraps existing pipeline) ═════════════════════════════

function BriefTab({ initialWorkerId = "" }: { initialWorkerId?: string }) {
  const [workerId, setWorkerId] = useState(initialWorkerId);
  const [rejectionText, setRejectionText] = useState("");
  const [result, setResult] = useState<any>(null);

  const run = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/v1/legal/intelligence/brief/generate`, {
        method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ workerId, rejectionText: rejectionText || undefined }),
      });
      return res.json();
    },
    onSuccess: (data) => setResult(data.brief),
  });

  const stageLabels = ["Research", "Case Review", "Validation", "Pressure", "Worker Explanation", "Appeal EN"];
  const stageKeys = ["stage1_research_json", "stage2_review_json", "stage3_validation_json", "stage4_pressure_json"];

  return (
    <div className="space-y-6">
      <div className={cardCls}>
        <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2"><Sparkles className="w-4 h-4 text-purple-400" /> 6-Stage Legal Brief Pipeline</h2>
        <p className="text-xs text-slate-500 mb-4">Full AI-powered legal analysis: Research → Case Review → Validation → Pressure Check → Worker Explanation → Appeal Translation</p>
        <div className="space-y-3">
          <div><label className={labelCls}>Worker *</label><WorkerSelect value={workerId} onChange={setWorkerId} /></div>
          <div>
            <label className={labelCls}>Rejection Text (optional)</label>
            <textarea value={rejectionText} onChange={e => setRejectionText(e.target.value)} rows={3} placeholder="Paste rejection decision text for appeal analysis" className={inputCls} />
          </div>
          <button onClick={() => run.mutate()} disabled={run.isPending || !workerId}
            className="w-full py-2.5 bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white rounded-lg text-sm font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2">
            {run.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {run.isPending ? "Running Pipeline..." : "Generate Legal Brief"}
          </button>
        </div>
      </div>

      {result && (
        <div className="space-y-4">
          {/* Status bar */}
          <div className="flex items-center gap-2 flex-wrap">
            <StatusPill status={result.status ?? "COMPLETE"} />
            {result.overall_confidence != null && (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${result.overall_confidence >= 0.7 ? "bg-green-500/20 text-green-400 border-green-500/30" : result.overall_confidence >= 0.4 ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" : "bg-red-500/20 text-red-400 border-red-500/30"}`}>
                Confidence: {(result.overall_confidence * 100).toFixed(0)}%
              </span>
            )}
            {result.pressure_level && <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${result.pressure_level === "CRITICAL" ? "bg-red-500/20 text-red-400 border-red-500/30" : "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"}`}>Pressure: {result.pressure_level}</span>}
            {result.pipeline_halted_at && <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-red-500/20 text-red-400 border-red-500/30">HALTED at {result.pipeline_halted_at}</span>}
          </div>

          {/* Stage results */}
          {stageKeys.map((key, i) => {
            const stage = result[key];
            if (!stage) return null;
            return (
              <div key={key} className={cardCls}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold text-white">Stage {i + 1}: {stageLabels[i]}</h3>
                  <CopyButton text={JSON.stringify(stage, null, 2)} />
                </div>
                <pre className="text-[11px] text-slate-300 whitespace-pre-wrap font-mono bg-slate-900 p-3 rounded-lg max-h-64 overflow-y-auto">
                  {typeof stage === "string" ? stage : JSON.stringify(stage, null, 2)}
                </pre>
              </div>
            );
          })}

          {/* Final brief */}
          {result.final_brief_json && (
            <div className={`${cardCls} border-purple-500/30`}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold text-purple-400">Final Brief</h3>
                <CopyButton text={JSON.stringify(result.final_brief_json, null, 2)} />
              </div>
              <pre className="text-[11px] text-slate-300 whitespace-pre-wrap font-mono bg-slate-900 p-3 rounded-lg max-h-96 overflow-y-auto">
                {JSON.stringify(result.final_brief_json, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
