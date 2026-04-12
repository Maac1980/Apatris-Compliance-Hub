/**
 * Legal Intelligence — AI-powered research, drafting, case analysis.
 * 6 tabs: Research, Appeal, POA, Authority, Legal Brief, Reasoning
 */

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { authHeaders, BASE, extractList } from "@/lib/api";
import {
  Brain, Search, Gavel, FileText, Shield, Scale, Clock, Loader2,
  Copy, AlertTriangle, CheckCircle2, Upload, ChevronDown, ChevronUp, ArrowLeft,
} from "lucide-react";

const TABS = [
  { key: "research", label: "Research", icon: Search },
  { key: "appeal", label: "Appeal", icon: Gavel },
  { key: "poa", label: "POA", icon: FileText },
  { key: "authority", label: "Authority", icon: Shield },
  { key: "brief", label: "Legal Brief", icon: Scale },
  { key: "reasoning", label: "Reasoning", icon: Brain },
] as const;

export default function LegalIntelligence() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<string>("research");

  const { data: workersData } = useQuery({
    queryKey: ["workers-li"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/workers`, { headers: authHeaders() });
      if (!res.ok) return [];
      return extractList<any>(await res.json(), "workers").slice(0, 200).map((w: any) => ({ id: w.id, name: w.full_name ?? w.name ?? w.id }));
    },
  });
  const workers = workersData ?? [];

  const copyText = (text: string) => { navigator.clipboard.writeText(text); toast({ description: "Copied" }); };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 overflow-y-auto pb-20">
      <div className="border-b border-slate-800 bg-slate-900/50 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <a href="/legal-immigration" className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white hover:border-slate-600 transition-colors"><ArrowLeft className="w-4 h-4" /></a>
          <div className="w-10 h-10 rounded-xl bg-slate-700/50 border border-slate-600 flex items-center justify-center">
            <Brain className="w-5 h-5 text-slate-300" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Legal Intelligence</h1>
            <p className="text-xs text-slate-500 font-mono uppercase tracking-widest mt-1">AI-Assisted Research · Drafting · Case Analysis</p>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6">
        {/* Tabs */}
        <div className="flex border-b border-slate-800 mb-6 overflow-x-auto no-scrollbar">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-bold whitespace-nowrap border-b-2 transition-colors ${
                  tab === t.key ? "border-blue-500 text-blue-400" : "border-transparent text-slate-500 hover:text-white"
                }`}>
                <Icon className="w-4 h-4" /> {t.label}
              </button>
            );
          })}
        </div>

        {tab === "research" && <ResearchTab workers={workers} copyText={copyText} />}
        {tab === "appeal" && <AppealTab workers={workers} copyText={copyText} />}
        {tab === "poa" && <POATab workers={workers} />}
        {tab === "authority" && <AuthorityTab workers={workers} copyText={copyText} />}
        {tab === "brief" && <BriefTab workers={workers} />}
        {tab === "reasoning" && <ReasoningTab workers={workers} />}
      </div>
    </div>
  );
}

// ═══ SHARED ═════════════════════════════════════════════════════════════════

function WorkerSelect({ value, onChange, workers }: { value: string; onChange: (v: string) => void; workers: any[] }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="w-full text-sm bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200">
      <option value="">— Select Worker —</option>
      {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
    </select>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = status === "success" ? "bg-emerald-500/20 text-emerald-400" : status === "error" ? "bg-red-500/20 text-red-400" : "bg-slate-700 text-slate-400";
  return <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${s}`}>{status}</span>;
}

function DraftBanner() {
  return (
    <div className="flex items-center gap-2 text-xs bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 text-amber-400">
      <AlertTriangle className="w-3.5 h-3.5" />
      <span className="font-bold">DRAFT — Requires lawyer review before use</span>
    </div>
  );
}

// ═══ 1. RESEARCH TAB ════════════════════════════════════════════════════════

function ResearchTab({ workers, copyText }: { workers: any[]; copyText: (t: string) => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [workerId, setWorkerId] = useState("");
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");

  const { data: memosData } = useQuery({
    queryKey: ["research-memos"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/v1/legal-intel/research`, { headers: authHeaders() });
      if (!res.ok) return { memos: [] };
      return res.json();
    },
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}api/v1/legal-intel/research`, {
        method: "POST", headers: authHeaders(), body: JSON.stringify({ workerId, title, prompt }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error ?? "Failed"); }
      return res.json();
    },
    onSuccess: () => { toast({ description: "Research memo created" }); qc.invalidateQueries({ queryKey: ["research-memos"] }); setTitle(""); setPrompt(""); },
    onError: (err) => toast({ description: (err as Error).message, variant: "destructive" }),
  });

  const memos = memosData?.memos ?? [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-bold text-slate-300">New Research Memo</h2>
          <div><label className="text-xs text-slate-500">Title</label><input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. TRC renewal requirements for Ukrainian nationals" className="w-full mt-1 text-sm bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder:text-slate-600" /></div>
          <div><label className="text-xs text-slate-500">Linked Worker</label><div className="mt-1"><WorkerSelect value={workerId} onChange={setWorkerId} workers={workers} /></div></div>
          <div><label className="text-xs text-slate-500">Research Prompt</label><textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="What do you want to research?" rows={4} className="w-full mt-1 text-sm bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder:text-slate-600 resize-none" /></div>
          <button onClick={() => mutation.mutate()} disabled={!workerId || !title || !prompt || mutation.isPending}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold transition-colors">
            {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {mutation.isPending ? "Researching with Perplexity + Claude..." : "Create Research Memo"}
          </button>
        </div>
      </div>
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-slate-400">Recent Memos</h3>
        {memos.length === 0 ? <p className="text-xs text-slate-600">No research memos yet</p> : memos.slice(0, 10).map((m: any) => (
          <MemoCard key={m.id} memo={m} copyText={copyText} />
        ))}
      </div>
    </div>
  );
}

function MemoCard({ memo, copyText }: { memo: any; copyText: (t: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div>
          <p className="text-sm font-semibold text-white">{memo.title}</p>
          <p className="text-[10px] text-slate-500">{new Date(memo.created_at).toLocaleDateString("pl-PL")} · {memo.owner || "—"}</p>
        </div>
        <div className="flex items-center gap-2">
          {memo.sources?.length > 0 && <span className="text-[9px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">{memo.sources.length} sources</span>}
          {expanded ? <ChevronUp className="w-3 h-3 text-slate-500" /> : <ChevronDown className="w-3 h-3 text-slate-500" />}
        </div>
      </div>
      {expanded && (
        <div className="mt-3 space-y-2 border-t border-slate-800 pt-3">
          {memo.summary && <div className="bg-slate-950 rounded-lg px-3 py-2"><pre className="text-xs text-slate-300 whitespace-pre-wrap font-sans">{memo.summary}</pre></div>}
          {memo.action_items?.length > 0 && (
            <div><p className="text-[10px] font-bold text-emerald-400 uppercase mb-1">Action Items</p>
              {memo.action_items.map((a: string, i: number) => <p key={i} className="text-xs text-slate-300">- {a}</p>)}
            </div>
          )}
          <button onClick={() => copyText(memo.summary || memo.perplexity_answer || "")} className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1"><Copy className="w-3 h-3" /> Copy</button>
        </div>
      )}
    </div>
  );
}

// ═══ 2. APPEAL TAB ══════════════════════════════════════════════════════════

function AppealTab({ workers, copyText }: { workers: any[]; copyText: (t: string) => void }) {
  const { toast } = useToast();
  const [workerId, setWorkerId] = useState("");
  const [rejectionText, setRejectionText] = useState("");
  const [result, setResult] = useState<any>(null);
  const [showPL, setShowPL] = useState(true);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}api/v1/legal-intel/appeal`, {
        method: "POST", headers: authHeaders(), body: JSON.stringify({ workerId, rejectionText: rejectionText || undefined }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error ?? "Failed"); }
      return res.json();
    },
    onSuccess: (data) => { setResult(data.output); toast({ description: "Appeal analysis complete" }); },
    onError: (err) => toast({ description: (err as Error).message, variant: "destructive" }),
  });

  const o = result;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-bold text-slate-300">Appeal Assistant</h2>
          <p className="text-xs text-slate-500">Upload the decision/rejection, then receive a Polish appeal draft, English translation, and simple explanation. All outputs are DRAFT.</p>
          <div><label className="text-xs text-slate-500">Worker *</label><div className="mt-1"><WorkerSelect value={workerId} onChange={setWorkerId} workers={workers} /></div></div>
          <div><label className="text-xs text-slate-500">Rejection Decision Text</label><textarea value={rejectionText} onChange={e => setRejectionText(e.target.value)} placeholder="Paste the rejection decision text here..." rows={6} className="w-full mt-1 text-sm bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder:text-slate-600 resize-none" /></div>
          {!rejectionText && <p className="text-[10px] text-amber-400">Without rejection text, appeal content will be limited to general guidance.</p>}
          <button onClick={() => mutation.mutate()} disabled={!workerId || mutation.isPending}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#C41E18] hover:bg-red-700 disabled:opacity-50 text-white text-sm font-bold">
            {mutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing with AI...</> : <><Gavel className="w-4 h-4" /> Run Appeal Assistant</>}
          </button>
        </div>
      </div>
      <div className="space-y-4">
        {o ? (
          <>
            <DraftBanner />
            {o.appeal_grounds?.length > 0 && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <p className="text-[10px] font-bold text-emerald-400 uppercase mb-2">Appeal Grounds</p>
                {o.appeal_grounds.map((g: string, i: number) => <p key={i} className="text-xs text-slate-300 mb-1">{i + 1}. {g}</p>)}
              </div>
            )}
            {o.relevant_articles?.length > 0 && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <p className="text-[10px] font-bold text-purple-400 uppercase mb-2">Relevant Articles</p>
                {o.relevant_articles.map((a: any, i: number) => <p key={i} className="text-xs text-slate-300 mb-1"><span className="text-purple-400 font-bold">{a.article}</span> — {a.relevance ?? a.law}</p>)}
              </div>
            )}
            {(o.appeal_draft_pl || o.appeal_draft_en) && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-bold text-blue-400 uppercase">Appeal Draft</p>
                  <div className="flex gap-1">
                    <button onClick={() => setShowPL(true)} className={`text-[10px] px-2 py-0.5 rounded font-bold ${showPL ? "bg-blue-600 text-white" : "bg-slate-700 text-slate-400"}`}>PL</button>
                    <button onClick={() => setShowPL(false)} className={`text-[10px] px-2 py-0.5 rounded font-bold ${!showPL ? "bg-blue-600 text-white" : "bg-slate-700 text-slate-400"}`}>EN</button>
                    <button onClick={() => copyText(showPL ? o.appeal_draft_pl : o.appeal_draft_en)} className="text-slate-400 hover:text-white p-0.5"><Copy className="w-3 h-3" /></button>
                  </div>
                </div>
                <pre className="text-xs text-slate-300 whitespace-pre-wrap font-sans max-h-[400px] overflow-y-auto bg-slate-950 rounded-lg p-3">{showPL ? o.appeal_draft_pl : o.appeal_draft_en || "English translation not available"}</pre>
              </div>
            )}
            {o.worker_explanation && (
              <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-4">
                <p className="text-[10px] font-bold text-green-400 uppercase mb-2">Worker Explanation</p>
                <p className="text-xs text-slate-300 leading-relaxed">{o.worker_explanation}</p>
              </div>
            )}
            {o.lawyer_note && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Lawyer Note</p>
                <p className="text-xs text-slate-400">{o.lawyer_note}</p>
              </div>
            )}
            {o.provider_status && (
              <div className="flex gap-2 text-[10px]">
                <span className="text-slate-500">Perplexity: <StatusBadge status={o.provider_status.perplexity} /></span>
                <span className="text-slate-500">Claude: <StatusBadge status={o.provider_status.claude} /></span>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-16 text-slate-600"><Gavel className="w-10 h-10 mx-auto mb-2 opacity-30" /><p>Select a worker and run the appeal assistant</p></div>
        )}
      </div>
    </div>
  );
}

// ═══ 3. POA TAB ═════════════════════════════════════════════════════════════

function POATab({ workers }: { workers: any[] }) {
  const { toast } = useToast();
  const [workerId, setWorkerId] = useState("");
  const [poaType, setPoaType] = useState("GENERAL");
  const [repName, setRepName] = useState("");
  const [result, setResult] = useState<any>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}api/v1/legal-intel/poa`, {
        method: "POST", headers: authHeaders(), body: JSON.stringify({ workerId, poaType, representativeName: repName }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error ?? "Failed"); }
      return res.json();
    },
    onSuccess: (data) => { setResult(data.poa); toast({ description: "POA generated" }); },
    onError: (err) => toast({ description: (err as Error).message, variant: "destructive" }),
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-bold text-slate-300">Generate Pełnomocnictwo</h2>
        <div><label className="text-xs text-slate-500">Worker *</label><div className="mt-1"><WorkerSelect value={workerId} onChange={setWorkerId} workers={workers} /></div></div>
        <div><label className="text-xs text-slate-500">POA Type</label>
          <select value={poaType} onChange={e => setPoaType(e.target.value)} className="w-full mt-1 text-sm bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white">
            <option value="GENERAL">General</option><option value="TRC_PROCEEDINGS">TRC Proceedings</option><option value="APPEAL">Appeal</option><option value="FILE_INSPECTION">File Inspection</option><option value="WORK_PERMIT">Work Permit</option>
          </select>
        </div>
        <div><label className="text-xs text-slate-500">Representative Name *</label><input type="text" value={repName} onChange={e => setRepName(e.target.value)} placeholder="Full name of attorney" className="w-full mt-1 text-sm bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder:text-slate-600" /></div>
        <button onClick={() => mutation.mutate()} disabled={!workerId || !repName || mutation.isPending}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold">
          {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />} Generate POA
        </button>
      </div>
      <div>
        {result ? (
          <div className="space-y-3">
            <DraftBanner />
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <pre className="text-xs text-slate-300 whitespace-pre-wrap font-sans">{result.content_pl}</pre>
            </div>
          </div>
        ) : (
          <div className="text-center py-16 text-slate-600"><FileText className="w-10 h-10 mx-auto mb-2 opacity-30" /><p>Generate a power of attorney document</p></div>
        )}
      </div>
    </div>
  );
}

// ═══ 4. AUTHORITY TAB ═══════════════════════════════════════════════════════

function AuthorityTab({ workers, copyText }: { workers: any[]; copyText: (t: string) => void }) {
  const { toast } = useToast();
  const [workerId, setWorkerId] = useState("");
  const [draftType, setDraftType] = useState("correspondence");
  const [authorityName, setAuthorityName] = useState("");
  const [issue, setIssue] = useState("");
  const [result, setResult] = useState<any>(null);
  const [showPL, setShowPL] = useState(true);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}api/v1/legal-intel/authority-draft`, {
        method: "POST", headers: authHeaders(), body: JSON.stringify({ workerId, draftType, specificIssue: issue, authorityName: authorityName || undefined }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error ?? "Failed"); }
      return res.json();
    },
    onSuccess: (data) => { setResult(data.draft); toast({ description: "Draft generated" }); },
    onError: (err) => toast({ description: (err as Error).message, variant: "destructive" }),
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-bold text-slate-300">Authority Response Drafting</h2>
        <div><label className="text-xs text-slate-500">Worker *</label><div className="mt-1"><WorkerSelect value={workerId} onChange={setWorkerId} workers={workers} /></div></div>
        <div><label className="text-xs text-slate-500">Draft Type</label>
          <select value={draftType} onChange={e => setDraftType(e.target.value)} className="w-full mt-1 text-sm bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white">
            <option value="correspondence">Correspondence</option><option value="document_request">Document Request Response</option><option value="status_inquiry">Status Inquiry</option><option value="correction">Correction Submission</option>
          </select>
        </div>
        <div><label className="text-xs text-slate-500">Authority Name</label><input type="text" value={authorityName} onChange={e => setAuthorityName(e.target.value)} placeholder="e.g. Urząd Wojewódzki Mazowiecki" className="w-full mt-1 text-sm bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder:text-slate-600" /></div>
        <div><label className="text-xs text-slate-500">Specific Issue *</label><textarea value={issue} onChange={e => setIssue(e.target.value)} placeholder="Describe what needs to be addressed" rows={3} className="w-full mt-1 text-sm bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder:text-slate-600 resize-none" /></div>
        <button onClick={() => mutation.mutate()} disabled={!workerId || !issue || mutation.isPending}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold">
          {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />} Generate Draft
        </button>
      </div>
      <div>
        {result ? (
          <div className="space-y-3">
            <DraftBanner />
            <div className="flex gap-1 mb-2">
              <button onClick={() => setShowPL(true)} className={`text-[10px] px-2 py-0.5 rounded font-bold ${showPL ? "bg-blue-600 text-white" : "bg-slate-700 text-slate-400"}`}>PL</button>
              <button onClick={() => setShowPL(false)} className={`text-[10px] px-2 py-0.5 rounded font-bold ${!showPL ? "bg-blue-600 text-white" : "bg-slate-700 text-slate-400"}`}>EN</button>
              <button onClick={() => copyText(showPL ? result.content_pl : result.content_en)} className="text-slate-400 hover:text-white p-0.5 ml-1"><Copy className="w-3 h-3" /></button>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <pre className="text-xs text-slate-300 whitespace-pre-wrap font-sans">{showPL ? result.content_pl : result.content_en || "English version not available"}</pre>
            </div>
          </div>
        ) : (
          <div className="text-center py-16 text-slate-600"><Shield className="w-10 h-10 mx-auto mb-2 opacity-30" /><p>Draft a response to an authority request</p></div>
        )}
      </div>
    </div>
  );
}

// ═══ 5. BRIEF TAB (delegates to Legal Brief page) ═══════════════════════════

function BriefTab({ workers }: { workers: any[] }) {
  const { toast } = useToast();
  const [workerId, setWorkerId] = useState("");
  const [rejectionText, setRejectionText] = useState("");
  const [result, setResult] = useState<any>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}api/v1/legal/brief/generate`, {
        method: "POST", headers: authHeaders(), body: JSON.stringify({ workerId, rejectionText: rejectionText || undefined }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error ?? "Failed"); }
      return res.json();
    },
    onSuccess: (data) => { setResult(data); toast({ description: data.status === "HALTED" ? "Pipeline halted" : "Legal brief generated" }); },
    onError: (err) => toast({ description: (err as Error).message, variant: "destructive" }),
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-bold text-slate-300">6-Stage Legal Brief Pipeline</h2>
        <p className="text-xs text-slate-500">Full AI-powered analysis: Research → Case Review → Validation → Pressure → Worker Explanation → Appeal Translation</p>
        <div><label className="text-xs text-slate-500">Worker *</label><div className="mt-1"><WorkerSelect value={workerId} onChange={setWorkerId} workers={workers} /></div></div>
        <div><label className="text-xs text-slate-500">Rejection Text (optional)</label><textarea value={rejectionText} onChange={e => setRejectionText(e.target.value)} placeholder="Paste rejection decision text for appeal analysis" rows={4} className="w-full mt-1 text-sm bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder:text-slate-600 resize-none" /></div>
        <button onClick={() => mutation.mutate()} disabled={!workerId || mutation.isPending}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#C41E18] hover:bg-red-700 disabled:opacity-50 text-white text-sm font-bold">
          {mutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Running pipeline...</> : <><Scale className="w-4 h-4" /> Generate Legal Brief</>}
        </button>
      </div>
      <div>
        {result ? (
          <div className="space-y-3">
            <div className={`rounded-xl border p-3 ${result.status === "COMPLETE" ? "bg-emerald-500/10 border-emerald-500/20" : "bg-red-500/10 border-red-500/20"}`}>
              <div className="flex items-center gap-2">
                {result.status === "COMPLETE" ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 text-red-400" />}
                <span className={`text-sm font-bold ${result.status === "COMPLETE" ? "text-emerald-400" : "text-red-400"}`}>{result.status}</span>
                <span className="text-[10px] text-slate-500">Confidence: {((result.overallConfidence ?? 0) * 100).toFixed(0)}%</span>
              </div>
            </div>
            {result.stage2?.caseSummary && <div className="bg-slate-900 border border-slate-800 rounded-xl p-4"><p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Case Summary</p><p className="text-xs text-slate-300">{result.stage2.caseSummary}</p></div>}
            {result.stage4 && <div className={`rounded-xl border p-3 ${result.stage4.pressureLevel === "CRITICAL" ? "bg-red-500/10 border-red-500/20 text-red-400" : result.stage4.pressureLevel === "HIGH" ? "bg-amber-500/10 border-amber-500/20 text-amber-400" : "bg-slate-900 border-slate-800 text-slate-400"}`}><p className="text-xs font-bold">Pressure: {result.stage4.pressureLevel} {result.stage4.daysUntilDeadline !== null && `(${result.stage4.daysUntilDeadline}d)`}</p></div>}
            <a href="/legal-brief" className="block text-center text-[10px] text-blue-400 hover:text-blue-300 underline">Open full Legal Brief page →</a>
          </div>
        ) : (
          <div className="text-center py-16 text-slate-600"><Scale className="w-10 h-10 mx-auto mb-2 opacity-30" /><p>Run the full 6-stage legal brief pipeline</p></div>
        )}
      </div>
    </div>
  );
}

// ═══ 6. REASONING TAB ═══════════════════════════════════════════════════════

function ReasoningTab({ workers }: { workers: any[] }) {
  const { toast } = useToast();
  const [workerId, setWorkerId] = useState("");
  const [result, setResult] = useState<any>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}api/v1/legal-intel/reasoning/${workerId}`, { headers: authHeaders() });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error ?? "Failed"); }
      return res.json();
    },
    onSuccess: (data) => { setResult(data); },
    onError: (err) => toast({ description: (err as Error).message, variant: "destructive" }),
  });

  const r = result?.reasoning;
  const s = result?.snapshot;

  return (
    <div className="max-w-3xl space-y-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-bold text-slate-300">Legal Reasoning Panel</h2>
        <p className="text-xs text-slate-500">Understand WHY the legal engine assigned a specific status to a worker.</p>
        <div className="flex gap-3">
          <div className="flex-1"><WorkerSelect value={workerId} onChange={setWorkerId} workers={workers} /></div>
          <button onClick={() => mutation.mutate()} disabled={!workerId || mutation.isPending}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold">
            {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Load"}
          </button>
        </div>
      </div>

      {r && (
        <>
          {s && (
            <div className="grid grid-cols-3 gap-3">
              <div className={`rounded-xl p-3 text-center ${s.status === "VALID" ? "bg-emerald-500/10 border border-emerald-500/20" : s.status === "PROTECTED_PENDING" ? "bg-blue-500/10 border border-blue-500/20" : s.status === "EXPIRED_NOT_PROTECTED" ? "bg-red-500/10 border border-red-500/20" : "bg-amber-500/10 border border-amber-500/20"}`}>
                <p className="text-[10px] text-slate-500">Status</p><p className="text-sm font-bold text-white">{s.status}</p>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center">
                <p className="text-[10px] text-slate-500">Basis</p><p className="text-sm font-bold text-white">{s.basis}</p>
              </div>
              <div className={`rounded-xl p-3 text-center ${s.risk === "LOW" ? "bg-emerald-500/10 border border-emerald-500/20" : s.risk === "CRITICAL" ? "bg-red-500/10 border border-red-500/20" : "bg-amber-500/10 border border-amber-500/20"}`}>
                <p className="text-[10px] text-slate-500">Risk</p><p className="text-sm font-bold text-white">{s.risk}</p>
              </div>
            </div>
          )}

          {r.statusExplanation && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Why This Status</p>
              <p className="text-xs text-slate-300 leading-relaxed">{r.statusExplanation}</p>
            </div>
          )}

          {r.applicableArticles?.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <p className="text-[10px] font-bold text-purple-400 uppercase mb-2">Applicable Articles</p>
              {r.applicableArticles.map((a: any, i: number) => (
                <div key={i} className="mb-2"><span className="text-purple-400 font-bold text-xs">{a.article}</span><p className="text-[11px] text-slate-400">{a.why}</p></div>
              ))}
            </div>
          )}

          {r.whatCouldChange?.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <p className="text-[10px] font-bold text-amber-400 uppercase mb-2">What Could Change</p>
              {r.whatCouldChange.map((c: any, i: number) => (
                <div key={i} className="flex items-start gap-2 mb-1.5 text-xs"><span className="text-amber-400">→</span><span className="text-slate-300">{c.scenario}: <span className="font-bold">{c.newStatus}</span></span></div>
              ))}
            </div>
          )}

          {r.watchList?.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <p className="text-[10px] font-bold text-red-400 uppercase mb-2">Watch List</p>
              {r.watchList.map((w: string, i: number) => <p key={i} className="text-xs text-slate-300 mb-1">- {w}</p>)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
