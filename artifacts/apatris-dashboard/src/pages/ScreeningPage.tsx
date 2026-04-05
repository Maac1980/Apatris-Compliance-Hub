import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { authHeaders, BASE, extractList, formatDate } from "@/lib/api";
import {
  Users, CheckCircle2, XCircle, X, Mail, Briefcase, Calendar,
  Loader2, ChevronRight, MessageSquare, Save,
} from "lucide-react";

const FILTERS = ["all", "screening", "approved", "rejected"] as const;
type Filter = (typeof FILTERS)[number];

const BADGE: Record<string, string> = {
  screening: "bg-purple-900/50 text-purple-300 border border-purple-600/50",
  approved: "bg-emerald-900/50 text-emerald-300 border border-emerald-600/50",
  rejected: "bg-red-900/50 text-red-300 border border-red-600/50",
};

interface Candidate {
  id: string;
  name: string;
  email: string;
  jobTitle: string;
  jobLocation: string;
  matchScore: number;
  stage: string;
  notes: string;
  appliedAt: string;
}

function normalize(r: any): Candidate {
  return {
    id: r.id,
    name: r.worker_name ?? r.name ?? "",
    email: r.worker_email ?? r.email ?? "",
    jobTitle: r.job_title ?? r.jobTitle ?? "—",
    jobLocation: r.job_location ?? "",
    matchScore: Number(r.match_score ?? r.matchScore ?? 0),
    stage: (r.stage ?? "screening").toLowerCase(),
    notes: r.notes ?? "",
    appliedAt: r.applied_at ?? r.appliedAt ?? "",
  };
}

export default function ScreeningPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState("");

  // Fetch all candidates in screening pipeline (screening + approved + rejected)
  const { data: candidates = [], isLoading } = useQuery<Candidate[]>({
    queryKey: ["screening-pipeline"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/applications`, { headers: authHeaders() });
      if (!res.ok) return [];
      const json = await res.json();
      const all = extractList(json, "applications").map(normalize);
      // Only show candidates that have entered the screening pipeline
      return all.filter(c => ["screening", "approved", "rejected"].includes(c.stage));
    },
  });

  const selected = candidates.find(c => c.id === selectedId) ?? null;

  // Open detail panel
  const openCandidate = (c: Candidate) => {
    setSelectedId(c.id);
    setNotesDraft(c.notes);
  };

  // Stage transition
  const updateStage = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: string }) => {
      const res = await fetch(`${BASE}api/applications/${id}/stage`, {
        method: "PATCH", headers: authHeaders(), body: JSON.stringify({ stage }),
      });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["screening-pipeline"] });
      qc.invalidateQueries({ queryKey: ["applications"] });
      toast({ title: "Updated", description: `Candidate moved to ${vars.stage}.` });
    },
    onError: () => toast({ title: "Error", description: "Failed to update stage", variant: "destructive" }),
  });

  // Save notes
  const saveNotes = useMutation({
    mutationFn: async () => {
      if (!selectedId) return;
      const res = await fetch(`${BASE}api/applications/${selectedId}/notes`, {
        method: "PATCH", headers: authHeaders(), body: JSON.stringify({ notes: notesDraft }),
      });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["screening-pipeline"] });
      toast({ title: "Notes Saved" });
    },
    onError: () => toast({ title: "Error", description: "Failed to save notes", variant: "destructive" }),
  });

  const filtered = filter === "all" ? candidates : candidates.filter(c => c.stage === filter);
  const counts = {
    screening: candidates.filter(c => c.stage === "screening").length,
    approved: candidates.filter(c => c.stage === "approved").length,
    rejected: candidates.filter(c => c.stage === "rejected").length,
  };

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Users className="w-6 h-6 text-purple-400" /> Candidate Screening
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Review, assess, and decide on candidates in the screening pipeline
          </p>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Pipeline</p>
            <p className="text-2xl font-bold text-foreground mt-1">{candidates.length}</p>
          </div>
          <div className="bg-purple-900/20 border border-purple-600/30 rounded-lg p-4">
            <p className="text-xs text-purple-400 uppercase tracking-wider">In Screening</p>
            <p className="text-2xl font-bold text-purple-300 mt-1">{counts.screening}</p>
          </div>
          <div className="bg-emerald-900/20 border border-emerald-600/30 rounded-lg p-4">
            <p className="text-xs text-emerald-400 uppercase tracking-wider">Approved</p>
            <p className="text-2xl font-bold text-emerald-300 mt-1">{counts.approved}</p>
          </div>
          <div className="bg-red-900/20 border border-red-600/30 rounded-lg p-4">
            <p className="text-xs text-red-400 uppercase tracking-wider">Rejected</p>
            <p className="text-2xl font-bold text-red-300 mt-1">{counts.rejected}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          {FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors capitalize ${
                filter === f
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-border hover:text-foreground"
              }`}
            >
              {f} {f !== "all" && `(${counts[f as keyof typeof counts] ?? 0})`}
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
            <p className="text-xs mt-1">Move applications to screening from the Applications Feed</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(c => (
              <button
                key={c.id}
                onClick={() => openCandidate(c)}
                className={`w-full text-left bg-card border rounded-lg p-4 transition-all hover:border-purple-500/40 ${
                  selectedId === c.id ? "border-purple-500/60 ring-1 ring-purple-500/30" : "border-border"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <p className="text-foreground font-semibold">{c.name}</p>
                      <span className={`px-2 py-0.5 rounded text-xs font-mono uppercase ${BADGE[c.stage] ?? "bg-card text-muted-foreground border border-border"}`}>
                        {c.stage}
                      </span>
                      {c.matchScore > 0 && (
                        <span className="text-xs text-muted-foreground font-mono">{c.matchScore.toFixed(0)}% match</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-4 mt-1.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {c.email}</span>
                      <span className="flex items-center gap-1"><Briefcase className="w-3 h-3" /> {c.jobTitle}</span>
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {formatDate(c.appliedAt)}</span>
                    </div>
                    {c.notes && <p className="text-xs text-muted-foreground mt-1 truncate max-w-md"><MessageSquare className="w-3 h-3 inline mr-1" />{c.notes}</p>}
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
          <div
            className="relative w-full max-w-lg bg-slate-900 border-l border-slate-700 h-full overflow-y-auto shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Panel header */}
            <div className="sticky top-0 bg-slate-900 border-b border-slate-700 px-6 py-4 flex items-center justify-between z-10">
              <div>
                <h2 className="text-lg font-bold text-white">{selected.name}</h2>
                <span className={`px-2 py-0.5 rounded text-xs font-mono uppercase ${BADGE[selected.stage] ?? ""}`}>
                  {selected.stage}
                </span>
              </div>
              <button onClick={() => setSelectedId(null)} className="p-2 hover:bg-slate-800 rounded-lg">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-6">
              {/* Candidate info */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Candidate Details</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-slate-500 text-xs">Email</p><p className="text-white">{selected.email}</p></div>
                  <div><p className="text-slate-500 text-xs">Applied</p><p className="text-white">{formatDate(selected.appliedAt)}</p></div>
                  <div><p className="text-slate-500 text-xs">Position</p><p className="text-white">{selected.jobTitle}</p></div>
                  <div><p className="text-slate-500 text-xs">Location</p><p className="text-white">{selected.jobLocation || "—"}</p></div>
                  <div><p className="text-slate-500 text-xs">Match Score</p><p className="text-white font-mono">{selected.matchScore.toFixed(1)}%</p></div>
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Screening Notes</h3>
                <textarea
                  value={notesDraft}
                  onChange={e => setNotesDraft(e.target.value)}
                  rows={4}
                  placeholder="Add notes about this candidate — interview feedback, skill assessment, concerns..."
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-600 resize-none focus:outline-none focus:border-purple-500/50"
                />
                <button
                  onClick={() => saveNotes.mutate()}
                  disabled={saveNotes.isPending || notesDraft === selected.notes}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 border border-slate-600 text-slate-300 rounded-lg text-xs font-medium hover:bg-slate-700 disabled:opacity-40 transition"
                >
                  {saveNotes.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                  Save Notes
                </button>
              </div>

              {/* Actions */}
              {selected.stage === "screening" && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Decision</h3>
                  <div className="flex gap-3">
                    <button
                      onClick={() => updateStage.mutate({ id: selected.id, stage: "Approved" })}
                      disabled={updateStage.isPending}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-bold transition disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-4 h-4" /> Approve
                    </button>
                    <button
                      onClick={() => updateStage.mutate({ id: selected.id, stage: "Rejected" })}
                      disabled={updateStage.isPending}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-bold transition disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4" /> Reject
                    </button>
                  </div>
                </div>
              )}

              {selected.stage === "approved" && (
                <div className="p-4 bg-emerald-900/20 border border-emerald-600/30 rounded-lg text-center">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                  <p className="text-emerald-300 font-bold">Approved — Ready for Hire</p>
                  <p className="text-xs text-emerald-400/60 mt-1">This candidate has been approved and can be assigned to a position</p>
                </div>
              )}

              {selected.stage === "rejected" && (
                <div className="p-4 bg-red-900/20 border border-red-600/30 rounded-lg text-center">
                  <XCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
                  <p className="text-red-300 font-bold">Rejected</p>
                  <p className="text-xs text-red-400/60 mt-1">This candidate was not selected for the position</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
