import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Calendar, CheckCircle2, Clock, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

const API = import.meta.env.VITE_API_URL ?? "";

interface Leave { id: string; leave_type: string; start_date: string; end_date: string; days: number; status: string; reason: string | null; }

export function LeaveTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["self-leaves"],
    queryFn: async () => {
      const res = await fetch(`${API}api/self-service/leave`, { headers: authHeaders() });
      if (!res.ok) return { leaves: [] };
      return res.json() as Promise<{ leaves: Leave[] }>;
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (body: Record<string, string>) => {
      const res = await fetch(`${API}api/self-service/leave`, { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Failed"); }
      return res.json();
    },
    onSuccess: () => { toast({ description: "Leave request submitted" }); queryClient.invalidateQueries({ queryKey: ["self-leaves"] }); setShowForm(false); setForm({}); },
    onError: (err) => { toast({ description: err instanceof Error ? err.message : "Failed", variant: "destructive" }); },
  });

  const leaves = data?.leaves ?? [];

  return (
    <div className="p-4 min-h-full overflow-y-auto pb-24 bg-[#0c0c0e]">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-[#C41E18]" />
          <h2 className="text-lg font-bold text-white">Leave</h2>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="px-3 py-1.5 bg-[#C41E18] text-white rounded-xl text-xs font-bold active:scale-95">
          {showForm ? "Cancel" : "Request"}
        </button>
      </div>

      {showForm && (
        <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-4 mb-4">
          <select value={form.leaveType || "annual"} onChange={e => setForm({ ...form, leaveType: e.target.value })}
            className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.06] rounded-xl text-sm text-white mb-2 focus:outline-none">
            <option value="annual">Annual</option><option value="sick">Sick</option><option value="unpaid">Unpaid</option>
          </select>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <input type="date" value={form.startDate || ""} onChange={e => setForm({ ...form, startDate: e.target.value })}
              className="px-3 py-2 bg-white/[0.03] border border-white/[0.06] rounded-xl text-sm text-white focus:outline-none" />
            <input type="date" value={form.endDate || ""} onChange={e => setForm({ ...form, endDate: e.target.value })}
              className="px-3 py-2 bg-white/[0.03] border border-white/[0.06] rounded-xl text-sm text-white focus:outline-none" />
          </div>
          <input placeholder="Reason (optional)" value={form.reason || ""} onChange={e => setForm({ ...form, reason: e.target.value })}
            className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.06] rounded-xl text-sm text-white placeholder:text-white/20 mb-2 focus:outline-none" />
          <button onClick={() => submitMutation.mutate(form)} disabled={!form.startDate || !form.endDate}
            className="w-full py-2.5 bg-[#C41E18] text-white rounded-xl text-sm font-bold active:scale-[0.98] disabled:opacity-40">Submit</button>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16"><div className="animate-spin w-6 h-6 border-2 border-[#C41E18] border-t-transparent rounded-full" /></div>
      ) : leaves.length === 0 ? (
        <div className="text-center py-16 text-white/30"><Calendar className="w-10 h-10 mx-auto mb-2 opacity-30" /><p className="text-sm font-semibold">No leave requests</p></div>
      ) : (
        <div className="space-y-2">
          {leaves.map(l => (
            <div key={l.id} className={cn("rounded-2xl border p-3.5",
              l.status === "approved" ? "bg-emerald-500/5 border-emerald-500/15" :
              l.status === "rejected" ? "bg-red-500/5 border-red-500/15" :
              "bg-amber-500/5 border-amber-500/15"
            )}>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-bold text-white">{l.leave_type} · {l.days} days</p>
                <span className={cn("flex items-center gap-1 text-[10px] font-bold",
                  l.status === "approved" ? "text-emerald-400" : l.status === "rejected" ? "text-red-400" : "text-amber-400"
                )}>
                  {l.status === "approved" ? <CheckCircle2 className="w-3 h-3" /> : l.status === "rejected" ? <X className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                  {l.status.toUpperCase()}
                </span>
              </div>
              <p className="text-[10px] text-white/40 font-mono">{new Date(l.start_date).toLocaleDateString("en-GB")} — {new Date(l.end_date).toLocaleDateString("en-GB")}</p>
              {l.reason && <p className="text-[9px] text-white/30 mt-0.5">{l.reason}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
