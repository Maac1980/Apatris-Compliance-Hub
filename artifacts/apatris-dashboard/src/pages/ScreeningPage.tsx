/**
 * Recruitment Pipeline — full candidate journey:
 * Screening → Interview → Offer → Accept/Decline → Convert to Worker → Hired
 */

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { authHeaders, BASE, extractList, formatDate } from "@/lib/api";
import {
  Users, CheckCircle2, XCircle, X, Mail, Briefcase, Calendar,
  Loader2, ChevronRight, MessageSquare, Save, Star, UserPlus,
  DollarSign, ClipboardCheck, AlertTriangle,
} from "lucide-react";

const FILTERS = ["all", "screening", "interview", "approved", "offered", "accepted", "hired", "rejected", "declined"] as const;
type Filter = (typeof FILTERS)[number];

const BADGE: Record<string, string> = {
  screening: "bg-purple-900/50 text-purple-300 border border-purple-600/50",
  interview: "bg-blue-900/50 text-blue-300 border border-blue-600/50",
  approved: "bg-emerald-900/50 text-emerald-300 border border-emerald-600/50",
  offered: "bg-amber-900/50 text-amber-300 border border-amber-600/50",
  accepted: "bg-green-900/50 text-green-300 border border-green-600/50",
  hired: "bg-cyan-900/50 text-cyan-300 border border-cyan-600/50",
  rejected: "bg-red-900/50 text-red-300 border border-red-600/50",
  declined: "bg-slate-700/50 text-slate-300 border border-slate-600/50",
};

interface Candidate {
  id: string; name: string; email: string; phone: string; nationality: string;
  jobTitle: string; jobLocation: string; matchScore: number; stage: string;
  notes: string; appliedAt: string;
  interviewDate: string | null; interviewNotes: string | null; skillsScore: number | null; interviewResult: string | null;
  offeredRate: number | null; offerStatus: string | null; offerDate: string | null; startDate: string | null;
  convertedWorkerId: string | null;
}

function normalize(r: any): Candidate {
  return {
    id: r.id, name: r.worker_name ?? r.name ?? "", email: r.worker_email ?? r.email ?? "",
    phone: r.phone ?? "", nationality: r.nationality ?? "",
    jobTitle: r.job_title ?? r.jobTitle ?? "—", jobLocation: r.job_location ?? "",
    matchScore: Number(r.match_score ?? 0), stage: (r.stage ?? "screening").toLowerCase(),
    notes: r.notes ?? "", appliedAt: r.applied_at ?? "",
    interviewDate: r.interview_date ?? null, interviewNotes: r.interview_notes ?? null,
    skillsScore: r.skills_score != null ? Number(r.skills_score) : null, interviewResult: r.interview_result ?? null,
    offeredRate: r.offered_rate != null ? Number(r.offered_rate) : null, offerStatus: r.offer_status ?? null,
    offerDate: r.offer_date ?? null, startDate: r.start_date ?? null,
    convertedWorkerId: r.converted_worker_id ?? null,
  };
}

export default function ScreeningPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [interviewNotesDraft, setInterviewNotesDraft] = useState("");
  const [skillsScoreDraft, setSkillsScoreDraft] = useState(3);
  const [offeredRateDraft, setOfferedRateDraft] = useState(31.40);
  const [startDateDraft, setStartDateDraft] = useState("");

  const { data: candidates = [], isLoading } = useQuery<Candidate[]>({
    queryKey: ["screening-pipeline"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/applications`, { headers: authHeaders() });
      if (!res.ok) return [];
      const json = await res.json();
      return extractList(json, "applications").map(normalize);
    },
  });

  const selected = candidates.find(c => c.id === selectedId) ?? null;
  const openCandidate = (c: Candidate) => {
    setSelectedId(c.id);
    setNotesDraft(c.notes);
    setInterviewNotesDraft(c.interviewNotes ?? "");
    setSkillsScoreDraft(c.skillsScore ?? 3);
    setOfferedRateDraft(c.offeredRate ?? 31.40);
    setStartDateDraft(c.startDate ?? "");
  };

  const invalidate = () => { qc.invalidateQueries({ queryKey: ["screening-pipeline"] }); qc.invalidateQueries({ queryKey: ["applications"] }); };

  const updateStage = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: string }) => {
      const res = await fetch(`${BASE}api/applications/${id}/stage`, { method: "PATCH", headers: authHeaders(), body: JSON.stringify({ stage }) });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: (_d, vars) => { invalidate(); toast({ description: `Moved to ${vars.stage}` }); },
  });

  const saveNotes = useMutation({
    mutationFn: async () => {
      if (!selectedId) return;
      const res = await fetch(`${BASE}api/applications/${selectedId}/notes`, { method: "PATCH", headers: authHeaders(), body: JSON.stringify({ notes: notesDraft }) });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => { invalidate(); toast({ description: "Notes saved" }); },
  });

  const saveInterview = useMutation({
    mutationFn: async () => {
      if (!selectedId) return;
      const res = await fetch(`${BASE}api/applications/${selectedId}/interview`, {
        method: "PATCH", headers: authHeaders(),
        body: JSON.stringify({ interviewNotes: interviewNotesDraft, skillsScore: skillsScoreDraft, interviewDate: new Date().toISOString().slice(0, 10), interviewResult: "Completed" }),
      });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => { invalidate(); toast({ description: "Interview saved" }); },
  });

  const createOffer = useMutation({
    mutationFn: async () => {
      if (!selectedId) return;
      const res = await fetch(`${BASE}api/applications/${selectedId}/offer`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ offeredRate: offeredRateDraft, startDate: startDateDraft || undefined }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error ?? "Failed"); }
    },
    onSuccess: () => { invalidate(); toast({ description: "Offer created" }); },
  });

  const offerResponse = useMutation({
    mutationFn: async ({ id, response }: { id: string; response: string }) => {
      const res = await fetch(`${BASE}api/applications/${id}/offer-response`, { method: "PATCH", headers: authHeaders(), body: JSON.stringify({ response }) });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: (_d, vars) => { invalidate(); toast({ description: `Offer ${vars.response.toLowerCase()}` }); },
  });

  const convertToWorker = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${BASE}api/applications/${id}/convert`, { method: "POST", headers: authHeaders(), body: JSON.stringify({}) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error ?? "Failed"); }
      return res.json();
    },
    onSuccess: (data) => { invalidate(); toast({ description: `Worker created: ${data.workerName}` }); },
    onError: (err) => toast({ description: (err as Error).message, variant: "destructive" }),
  });

  const filtered = filter === "all" ? candidates : candidates.filter(c => c.stage === filter);
  const count = (s: string) => candidates.filter(c => c.stage === s).length;

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Users className="w-6 h-6 text-purple-400" /> Recruitment Pipeline
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Screen → Interview → Offer → Hire</p>
        </div>

        {/* Funnel summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          {[
            { key: "screening", label: "Screening", color: "purple" },
            { key: "interview", label: "Interview", color: "blue" },
            { key: "approved", label: "Approved", color: "emerald" },
            { key: "offered", label: "Offered", color: "amber" },
            { key: "accepted", label: "Accepted", color: "green" },
            { key: "hired", label: "Hired", color: "cyan" },
            { key: "rejected", label: "Rejected", color: "red" },
            { key: "declined", label: "Declined", color: "slate" },
          ].map(s => (
            <div key={s.key} className={`bg-${s.color}-900/20 border border-${s.color}-600/30 rounded-lg p-3 text-center cursor-pointer hover:border-${s.color}-500/50`}
              onClick={() => setFilter(s.key as Filter)}>
              <p className={`text-[10px] text-${s.color}-400 uppercase tracking-wider`}>{s.label}</p>
              <p className={`text-xl font-bold text-${s.color}-300 mt-0.5`}>{count(s.key)}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-2.5 py-1 rounded text-xs font-bold border transition-colors capitalize ${
                filter === f ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border hover:text-foreground"
              }`}>
              {f} {f !== "all" && `(${count(f)})`}
            </button>
          ))}
        </div>

        {/* List */}
        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="font-medium">No candidates in this stage</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(c => (
              <button key={c.id} onClick={() => openCandidate(c)}
                className={`w-full text-left bg-card border rounded-lg p-4 transition-all hover:border-purple-500/40 ${
                  selectedId === c.id ? "border-purple-500/60 ring-1 ring-purple-500/30" : "border-border"
                }`}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <p className="text-foreground font-semibold">{c.name}</p>
                      <span className={`px-2 py-0.5 rounded text-xs font-mono uppercase ${BADGE[c.stage] ?? "bg-card text-muted-foreground border border-border"}`}>{c.stage}</span>
                      {c.skillsScore && <span className="text-xs text-amber-400 flex items-center gap-0.5"><Star className="w-3 h-3" />{c.skillsScore}/5</span>}
                      {c.offeredRate && <span className="text-xs text-green-400">{c.offeredRate} PLN/h</span>}
                    </div>
                    <div className="flex flex-wrap gap-4 mt-1.5 text-xs text-muted-foreground">
                      {c.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{c.email}</span>}
                      <span className="flex items-center gap-1"><Briefcase className="w-3 h-3" />{c.jobTitle}</span>
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{formatDate(c.appliedAt)}</span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ─── Detail Panel ─────────────────────────────────────────────────── */}
      {selected && (
        <div className="fixed inset-0 z-[250] flex justify-end" onClick={() => setSelectedId(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative w-full max-w-lg bg-slate-900 border-l border-slate-700 h-full overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-slate-900 border-b border-slate-700 px-6 py-4 flex items-center justify-between z-10">
              <div>
                <h2 className="text-lg font-bold text-white">{selected.name}</h2>
                <span className={`px-2 py-0.5 rounded text-xs font-mono uppercase ${BADGE[selected.stage] ?? ""}`}>{selected.stage}</span>
              </div>
              <button onClick={() => setSelectedId(null)} className="p-2 hover:bg-slate-800 rounded-lg"><X className="w-5 h-5 text-slate-400" /></button>
            </div>

            <div className="px-6 py-5 space-y-6">
              {/* Info */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-slate-500 text-xs">Email</p><p className="text-white">{selected.email || "—"}</p></div>
                <div><p className="text-slate-500 text-xs">Phone</p><p className="text-white">{selected.phone || "—"}</p></div>
                <div><p className="text-slate-500 text-xs">Position</p><p className="text-white">{selected.jobTitle}</p></div>
                <div><p className="text-slate-500 text-xs">Nationality</p><p className="text-white">{selected.nationality || "—"}</p></div>
                <div><p className="text-slate-500 text-xs">Match Score</p><p className="text-white font-mono">{selected.matchScore.toFixed(0)}%</p></div>
                <div><p className="text-slate-500 text-xs">Applied</p><p className="text-white">{formatDate(selected.appliedAt)}</p></div>
              </div>

              {/* Screening notes */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-slate-400 uppercase">Screening Notes</h3>
                <textarea value={notesDraft} onChange={e => setNotesDraft(e.target.value)} rows={3}
                  placeholder="Add screening notes..."
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-600 resize-none" />
                <button onClick={() => saveNotes.mutate()} disabled={saveNotes.isPending || notesDraft === selected.notes}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 border border-slate-600 text-slate-300 rounded text-xs font-medium hover:bg-slate-700 disabled:opacity-40">
                  <Save className="w-3 h-3" /> Save Notes
                </button>
              </div>

              {/* ── SCREENING ACTIONS ── */}
              {selected.stage === "screening" && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-slate-400 uppercase">Decision</h3>
                  <div className="flex gap-3">
                    <button onClick={() => updateStage.mutate({ id: selected.id, stage: "Interview" })}
                      className="flex-1 flex items-center justify-center gap-2 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-bold">
                      <ClipboardCheck className="w-4 h-4" /> Move to Interview
                    </button>
                    <button onClick={() => updateStage.mutate({ id: selected.id, stage: "Approved" })}
                      className="flex-1 flex items-center justify-center gap-2 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-sm font-bold">
                      <CheckCircle2 className="w-4 h-4" /> Approve
                    </button>
                    <button onClick={() => updateStage.mutate({ id: selected.id, stage: "Rejected" })}
                      className="px-4 flex items-center justify-center gap-2 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-bold">
                      <XCircle className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* ── INTERVIEW STAGE ── */}
              {(selected.stage === "interview" || selected.interviewNotes) && (
                <div className="space-y-3 bg-blue-500/5 border border-blue-500/20 rounded-xl p-4">
                  <h3 className="text-xs font-bold text-blue-400 uppercase">Interview Assessment</h3>
                  <div>
                    <label className="text-xs text-slate-500">Skills Score (1-5)</label>
                    <div className="flex gap-1 mt-1">
                      {[1, 2, 3, 4, 5].map(n => (
                        <button key={n} onClick={() => setSkillsScoreDraft(n)}
                          className={`w-8 h-8 rounded flex items-center justify-center text-sm font-bold transition ${
                            n <= skillsScoreDraft ? "bg-amber-500 text-white" : "bg-slate-800 text-slate-500"
                          }`}>{n}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Interview Notes</label>
                    <textarea value={interviewNotesDraft} onChange={e => setInterviewNotesDraft(e.target.value)} rows={3}
                      placeholder="Welding test results, language assessment, attitude..."
                      className="w-full mt-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white placeholder:text-slate-600 resize-none" />
                  </div>
                  {selected.stage === "interview" && (
                    <div className="flex gap-2">
                      <button onClick={() => saveInterview.mutate()} disabled={saveInterview.isPending}
                        className="flex-1 flex items-center justify-center gap-2 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-bold disabled:opacity-50">
                        {saveInterview.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save Interview
                      </button>
                      <button onClick={() => updateStage.mutate({ id: selected.id, stage: "Approved" })}
                        className="flex-1 flex items-center justify-center gap-2 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-sm font-bold">
                        <CheckCircle2 className="w-4 h-4" /> Approve
                      </button>
                      <button onClick={() => updateStage.mutate({ id: selected.id, stage: "Rejected" })}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-bold">
                        <XCircle className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ── APPROVED → MAKE OFFER ── */}
              {selected.stage === "approved" && (
                <div className="space-y-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4">
                  <h3 className="text-xs font-bold text-emerald-400 uppercase">Create Offer</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-500">Hourly Rate (PLN)</label>
                      <input type="number" step="0.10" value={offeredRateDraft} onChange={e => setOfferedRateDraft(Number(e.target.value))}
                        className="w-full mt-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white" />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500">Start Date</label>
                      <input type="date" value={startDateDraft} onChange={e => setStartDateDraft(e.target.value)}
                        className="w-full mt-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white" />
                    </div>
                  </div>
                  <button onClick={() => createOffer.mutate()} disabled={createOffer.isPending}
                    className="w-full flex items-center justify-center gap-2 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded text-sm font-bold disabled:opacity-50">
                    {createOffer.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <DollarSign className="w-4 h-4" />} Send Offer
                  </button>
                </div>
              )}

              {/* ── OFFERED → ACCEPT/DECLINE ── */}
              {selected.stage === "offered" && (
                <div className="space-y-3 bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
                  <h3 className="text-xs font-bold text-amber-400 uppercase">Offer Pending</h3>
                  <div className="text-sm text-slate-300">
                    <p>Rate: <span className="font-bold text-amber-400">{selected.offeredRate} PLN/h</span></p>
                    {selected.startDate && <p>Start: <span className="font-bold">{selected.startDate}</span></p>}
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => offerResponse.mutate({ id: selected.id, response: "Accepted" })}
                      className="flex-1 flex items-center justify-center gap-2 py-2 bg-green-600 hover:bg-green-700 text-white rounded text-sm font-bold">
                      <CheckCircle2 className="w-4 h-4" /> Accepted
                    </button>
                    <button onClick={() => offerResponse.mutate({ id: selected.id, response: "Declined" })}
                      className="flex-1 flex items-center justify-center gap-2 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded text-sm font-bold">
                      <XCircle className="w-4 h-4" /> Declined
                    </button>
                  </div>
                </div>
              )}

              {/* ── ACCEPTED → CONVERT TO WORKER ── */}
              {selected.stage === "accepted" && !selected.convertedWorkerId && (
                <div className="space-y-3 bg-green-500/5 border border-green-500/20 rounded-xl p-4">
                  <h3 className="text-xs font-bold text-green-400 uppercase">Convert to Worker</h3>
                  <p className="text-xs text-slate-400">Creates worker record, sets hourly rate to {selected.offeredRate} PLN/h, starts 10-step onboarding checklist.</p>
                  <button onClick={() => convertToWorker.mutate(selected.id)} disabled={convertToWorker.isPending}
                    className="w-full flex items-center justify-center gap-2 py-2 bg-green-600 hover:bg-green-700 text-white rounded text-sm font-bold disabled:opacity-50">
                    {convertToWorker.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />} Create Worker & Start Onboarding
                  </button>
                </div>
              )}

              {/* ── HIRED ── */}
              {(selected.stage === "hired" || selected.convertedWorkerId) && (
                <div className="p-4 bg-cyan-900/20 border border-cyan-600/30 rounded-xl text-center">
                  <CheckCircle2 className="w-8 h-8 text-cyan-400 mx-auto mb-2" />
                  <p className="text-cyan-300 font-bold">Hired — Worker Created</p>
                  {selected.convertedWorkerId && <p className="text-xs text-cyan-400/60 mt-1">Worker ID: {selected.convertedWorkerId}</p>}
                </div>
              )}

              {selected.stage === "rejected" && (
                <div className="p-4 bg-red-900/20 border border-red-600/30 rounded-xl text-center">
                  <XCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
                  <p className="text-red-300 font-bold">Rejected</p>
                </div>
              )}

              {selected.stage === "declined" && (
                <div className="p-4 bg-slate-800 border border-slate-600 rounded-xl text-center">
                  <XCircle className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <p className="text-slate-300 font-bold">Offer Declined</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
