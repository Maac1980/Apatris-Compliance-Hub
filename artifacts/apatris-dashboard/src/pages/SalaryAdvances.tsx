import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { DollarSign, CheckCircle2, X, Clock, Search, AlertTriangle } from "lucide-react";
import { authHeaders, BASE } from "@/lib/api";


interface Advance {
  id: string; worker_name: string; amount_requested: string; reason: string | null;
  status: string; requested_at: string; reviewed_by: string | null; reviewed_at: string | null;
  notes: string | null; deduction_month: number | null; deduction_year: number | null;
}

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  pending:  { bg: "bg-amber-500/10 border-amber-500/20", text: "text-amber-400" },
  approved: { bg: "bg-emerald-500/10 border-emerald-500/20", text: "text-emerald-400" },
  rejected: { bg: "bg-red-500/10 border-red-500/20", text: "text-red-400" },
  deducted: { bg: "bg-slate-500/10 border-slate-500/20", text: "text-slate-400" },
};

export default function SalaryAdvances() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("");
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["advances"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/advances`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ advances: Advance[] }>;
    },
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ id, status, notes }: { id: string; status: string; notes?: string }) => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/advances/${id}`, {
        method: "PATCH", headers: authHeaders(), body: JSON.stringify({ status, notes }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => { toast({ description: "Updated" }); queryClient.invalidateQueries({ queryKey: ["advances"] }); },
    onError: (err) => { toast({ description: err instanceof Error ? err.message : "Failed", variant: "destructive" }); },
  });

  const advances = data?.advances ?? [];
  const filtered = useMemo(() => {
    if (!filter) return advances;
    return advances.filter(a => a.status === filter);
  }, [advances, filter]);

  const pendingTotal = advances.filter(a => a.status === "pending").reduce((s, a) => s + Number(a.amount_requested), 0);
  const approvedTotal = advances.filter(a => a.status === "approved").reduce((s, a) => s + Number(a.amount_requested), 0);
  const fmtPln = (n: number) => n.toLocaleString("pl", { minimumFractionDigits: 2 }) + " PLN";

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <DollarSign className="w-7 h-7 text-[#C41E18]" />
          <h1 className="text-3xl font-bold text-white">Salary Advances</h1>
        </div>
        <p className="text-gray-400">Worker advance requests — approve, reject, track deductions</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
          <p className="text-xs text-gray-400 font-mono uppercase mb-1">Pending</p>
          <p className="text-xl font-bold text-amber-400">{fmtPln(pendingTotal)}</p>
        </div>
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
          <p className="text-xs text-gray-400 font-mono uppercase mb-1">Approved</p>
          <p className="text-xl font-bold text-emerald-400">{fmtPln(approvedTotal)}</p>
        </div>
        <div className="bg-slate-800 rounded-xl p-4">
          <p className="text-xs text-gray-400 font-mono uppercase mb-1">Total Requests</p>
          <p className="text-2xl font-bold text-white">{advances.length}</p>
        </div>
        <div className="bg-slate-800 rounded-xl p-4">
          <p className="text-xs text-gray-400 font-mono uppercase mb-1">Pending Count</p>
          <p className="text-2xl font-bold text-amber-400">{advances.filter(a => a.status === "pending").length}</p>
        </div>
      </div>

      <div className="flex gap-1.5 mb-4">
        {["", "pending", "approved", "rejected"].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${filter === s ? "bg-[#C41E18] text-white" : "bg-slate-800 text-slate-400 hover:text-white"}`}>
            {s || "All"}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-[#C41E18] border-t-transparent rounded-full" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-slate-500"><DollarSign className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="text-lg font-semibold">No requests</p></div>
      ) : (
        <div className="space-y-3">
          {filtered.map(a => {
            const st = STATUS_STYLES[a.status] || STATUS_STYLES.pending;
            return (
              <div key={a.id} className={`rounded-xl border p-4 ${st.bg}`}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm font-bold text-white">{a.worker_name}</p>
                    <p className="text-xs text-slate-400">{new Date(a.requested_at).toLocaleDateString("en-GB")}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-lg font-black font-mono ${st.text}`}>{fmtPln(Number(a.amount_requested))}</p>
                    <span className={`text-[10px] font-bold uppercase ${st.text}`}>{a.status}</span>
                  </div>
                </div>
                {a.reason && <p className="text-xs text-slate-400 mb-2">Reason: {a.reason}</p>}
                {a.deduction_month && <p className="text-[10px] text-slate-500 font-mono mb-2">Deduction: {a.deduction_month}/{a.deduction_year}</p>}
                {a.notes && <p className="text-[10px] text-slate-500 mb-2">Notes: {a.notes}</p>}

                {a.status === "pending" && (
                  <div className="flex gap-2 mt-3">
                    <input placeholder="Notes (optional)" value={reviewNotes[a.id] || ""} onChange={e => setReviewNotes({ ...reviewNotes, [a.id]: e.target.value })}
                      className="flex-1 px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white placeholder:text-slate-600 focus:outline-none" />
                    <button onClick={() => reviewMutation.mutate({ id: a.id, status: "approved", notes: reviewNotes[a.id] })}
                      disabled={reviewMutation.isPending}
                      className="px-3 py-1.5 bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 rounded text-xs font-bold hover:bg-emerald-600/30 disabled:opacity-50">
                      <CheckCircle2 className="w-3 h-3 inline mr-1" />Approve
                    </button>
                    <button onClick={() => reviewMutation.mutate({ id: a.id, status: "rejected", notes: reviewNotes[a.id] })}
                      disabled={reviewMutation.isPending}
                      className="px-3 py-1.5 bg-red-600/20 text-red-400 border border-red-500/30 rounded text-xs font-bold hover:bg-red-600/30 disabled:opacity-50">
                      <X className="w-3 h-3 inline mr-1" />Reject
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
