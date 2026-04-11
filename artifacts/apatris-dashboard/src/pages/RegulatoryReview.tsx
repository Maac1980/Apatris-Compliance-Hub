/**
 * Regulatory Review Queue — Stage 4
 * Review, approve, or reject regulatory updates before deployment.
 */

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { authHeaders, BASE } from "@/lib/api";
import {
  Shield, CheckCircle2, XOctagon, Clock, Loader2, AlertTriangle, ChevronDown, ChevronUp,
} from "lucide-react";

const STATUS_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  PENDING:        { label: "Pending",    color: "text-blue-400",    bg: "bg-blue-500/20" },
  IN_REVIEW:      { label: "In Review",  color: "text-amber-400",   bg: "bg-amber-500/20" },
  APPROVED:       { label: "Approved",   color: "text-emerald-400", bg: "bg-emerald-500/20" },
  REJECTED:       { label: "Rejected",   color: "text-red-400",     bg: "bg-red-500/20" },
  EDIT_REQUESTED: { label: "Edit Req.",  color: "text-purple-400",  bg: "bg-purple-500/20" },
};

const SEV_COLOR: Record<string, string> = {
  CRITICAL: "text-red-400", HIGH: "text-orange-400", MEDIUM: "text-amber-400", LOW: "text-blue-400",
};

export default function RegulatoryReview() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [filter, setFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["reg-review-queue", filter],
    queryFn: async () => {
      const params = filter ? `?status=${filter}` : "";
      const res = await fetch(`${BASE}api/v1/regulatory/review-tasks${params}`, { headers: authHeaders() });
      if (!res.ok) return { tasks: [] };
      return res.json();
    },
  });

  const approveMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${BASE}api/v1/regulatory/review-tasks/${id}/approve`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ notes }) });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: (d) => { toast({ description: `Approved → ${d.updateStatus}` }); qc.invalidateQueries({ queryKey: ["reg-review-queue"] }); setNotes(""); },
  });

  const rejectMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${BASE}api/v1/regulatory/review-tasks/${id}/reject`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ notes }) });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => { toast({ description: "Rejected" }); qc.invalidateQueries({ queryKey: ["reg-review-queue"] }); setNotes(""); },
  });

  const editMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${BASE}api/v1/regulatory/review-tasks/${id}/request-edit`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ notes }) });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => { toast({ description: "Edit requested" }); qc.invalidateQueries({ queryKey: ["reg-review-queue"] }); setNotes(""); },
  });

  const tasks = data?.tasks ?? [];
  const pendingCount = tasks.filter((t: any) => t.task_status === "PENDING" || t.task_status === "IN_REVIEW").length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 overflow-y-auto pb-20">
      <div className="border-b border-slate-800 bg-slate-900/50 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-700/50 border border-slate-600 flex items-center justify-center">
              <Shield className="w-5 h-5 text-slate-300" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">Review Queue</h1>
              <p className="text-xs text-slate-500 font-mono uppercase tracking-widest mt-1">Approve · Reject · Gate Deployment</p>
            </div>
          </div>
          {pendingCount > 0 && <span className="text-xs font-bold bg-amber-500/20 text-amber-400 px-3 py-1 rounded-full">{pendingCount} pending</span>}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-4">
        <div className="flex gap-2">
          {["", "PENDING", "IN_REVIEW", "APPROVED", "REJECTED"].map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={`text-xs px-3 py-1 rounded font-bold ${filter === s ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"}`}>
              {s || "All"}
            </button>
          ))}
        </div>

        {isLoading ? <div className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin text-slate-500 mx-auto" /></div>
        : tasks.length === 0 ? <div className="text-center py-12 text-slate-600"><CheckCircle2 className="w-10 h-10 mx-auto mb-2 opacity-30" /><p>No review tasks{filter ? ` with status ${filter}` : ""}.</p></div>
        : tasks.map((t: any) => {
          const st = STATUS_STYLE[t.task_status] ?? STATUS_STYLE.PENDING;
          const isExpanded = expandedId === t.id;
          const dueDate = t.due_date ? new Date(t.due_date) : null;
          const overdue = dueDate && dueDate < new Date();

          return (
            <div key={t.id} className={`rounded-xl border p-4 ${overdue && t.task_status === "PENDING" ? "bg-red-500/5 border-red-500/20" : "bg-slate-900 border-slate-800"}`}>
              <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : t.id)}>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-white">{t.update_title || "Untitled update"}</span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${st.bg} ${st.color}`}>{st.label}</span>
                    <span className="text-[9px] bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded">{t.review_type}</span>
                    <span className={`text-[9px] font-bold ${SEV_COLOR[t.update_severity] ?? ""}`}>{t.update_severity}</span>
                    {overdue && t.task_status === "PENDING" && <span className="text-[9px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded font-bold">OVERDUE</span>}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-500">
                    <span>Role: {t.assigned_role}</span>
                    {t.assigned_user_id && <span>Assigned: {t.assigned_user_id}</span>}
                    {dueDate && <span className={overdue ? "text-red-400" : ""}>Due: {dueDate.toLocaleDateString("pl-PL")} {dueDate.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}</span>}
                  </div>
                </div>
                {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
              </div>

              {isExpanded && (
                <div className="mt-3 space-y-3 border-t border-slate-700/30 pt-3">
                  {t.notes && <p className="text-xs text-slate-400">{t.notes}</p>}

                  {(t.task_status === "PENDING" || t.task_status === "IN_REVIEW") && (
                    <div className="space-y-2">
                      <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Review notes (optional)..." rows={2}
                        className="w-full text-xs bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder:text-slate-600 resize-none" />
                      <div className="flex gap-2">
                        <button onClick={() => approveMut.mutate(t.id)} disabled={approveMut.isPending}
                          className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold hover:bg-emerald-600/30 disabled:opacity-50">
                          {approveMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />} Approve
                        </button>
                        <button onClick={() => rejectMut.mutate(t.id)} disabled={rejectMut.isPending}
                          className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-red-600/20 text-red-400 border border-red-500/30 text-xs font-bold hover:bg-red-600/30 disabled:opacity-50">
                          <XOctagon className="w-3 h-3" /> Reject
                        </button>
                        <button onClick={() => editMut.mutate(t.id)} disabled={editMut.isPending}
                          className="px-4 flex items-center justify-center gap-2 py-2 rounded-lg bg-purple-600/20 text-purple-400 border border-purple-500/30 text-xs font-bold hover:bg-purple-600/30 disabled:opacity-50">
                          Edit
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="text-[9px] text-slate-600">Task: {t.id?.slice(0, 8)} · Update: {t.update_id?.slice(0, 8)}</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
