import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DollarSign, CheckCircle2, X, Clock, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

const API = import.meta.env.VITE_API_URL ?? "";

interface Advance {
  id: string; worker_name: string; amount_requested: string; reason: string | null;
  status: string; requested_at: string; notes: string | null;
  deduction_month: number | null; deduction_year: number | null;
}

export function AdvancesTab() {
  const { toast } = useToast();
  const { role, user } = useAuth();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [showForm, setShowForm] = useState(false);

  const isManager = role === "Executive" || role === "LegalHead" || role === "TechOps";

  const { data, isLoading } = useQuery({
    queryKey: ["advances"],
    queryFn: async () => {
      const res = await fetch(`${API}api/advances`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ advances: Advance[] }>;
    },
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API}api/advances`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ workerId: "self", workerName: user?.name || "Worker", amountRequested: Number(amount), reason }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Failed"); }
      return res.json();
    },
    onSuccess: () => { toast({ description: "Advance request submitted" }); setShowForm(false); setAmount(""); setReason(""); queryClient.invalidateQueries({ queryKey: ["advances"] }); },
    onError: (err) => { toast({ description: err instanceof Error ? err.message : "Failed", variant: "destructive" }); },
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await fetch(`${API}api/advances/${id}`, { method: "PATCH", headers: authHeaders(), body: JSON.stringify({ status }) });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => { toast({ description: "Updated" }); queryClient.invalidateQueries({ queryKey: ["advances"] }); },
  });

  const advances = data?.advances ?? [];
  const fmtPln = (n: number) => n.toLocaleString("pl", { minimumFractionDigits: 2 }) + " PLN";

  return (
    <div className="p-4 min-h-full overflow-y-auto pb-24 bg-[#0c0c0e]">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-[#C41E18]" />
          <h2 className="text-lg font-bold text-white">Advances</h2>
        </div>
        {!isManager && (
          <button onClick={() => setShowForm(!showForm)}
            className="px-3 py-1.5 bg-[#C41E18] text-white rounded-xl text-xs font-bold active:scale-95">
            {showForm ? "Cancel" : "Request"}
          </button>
        )}
      </div>

      {/* Submit form for T5 */}
      {showForm && (
        <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-4 mb-4">
          <input type="number" placeholder="Amount (PLN)" value={amount} onChange={e => setAmount(e.target.value)}
            className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.06] rounded-xl text-sm text-white placeholder:text-white/20 mb-2 focus:outline-none focus:ring-1 focus:ring-[#C41E18]" />
          <textarea placeholder="Reason (optional)" value={reason} onChange={e => setReason(e.target.value)} rows={2}
            className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.06] rounded-xl text-sm text-white placeholder:text-white/20 mb-2 resize-none focus:outline-none focus:ring-1 focus:ring-[#C41E18]" />
          <button onClick={() => submitMutation.mutate()} disabled={!amount || Number(amount) <= 0 || submitMutation.isPending}
            className="w-full py-2.5 bg-[#C41E18] text-white rounded-xl text-sm font-bold active:scale-[0.98] disabled:opacity-40">
            {submitMutation.isPending ? "Submitting..." : "Submit Request"}
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16"><div className="animate-spin w-6 h-6 border-2 border-[#C41E18] border-t-transparent rounded-full" /></div>
      ) : advances.length === 0 ? (
        <div className="text-center py-16 text-white/30"><DollarSign className="w-10 h-10 mx-auto mb-2 opacity-30" /><p className="text-sm font-semibold">No advance requests</p></div>
      ) : (
        <div className="space-y-2">
          {advances.map(a => {
            const isPending = a.status === "pending";
            const isApproved = a.status === "approved";
            return (
              <div key={a.id} className={cn("rounded-2xl border p-3.5",
                isPending ? "bg-amber-500/5 border-amber-500/15" :
                isApproved ? "bg-emerald-500/5 border-emerald-500/15" :
                a.status === "rejected" ? "bg-red-500/5 border-red-500/15" :
                "bg-white/[0.03] border-white/[0.06]"
              )}>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-bold text-white">{a.worker_name}</p>
                  <span className={cn("text-[10px] font-bold uppercase",
                    isPending ? "text-amber-400" : isApproved ? "text-emerald-400" : "text-red-400"
                  )}>{a.status}</span>
                </div>
                <p className={cn("text-lg font-black font-mono",
                  isPending ? "text-amber-400" : isApproved ? "text-emerald-400" : "text-red-400"
                )}>{fmtPln(Number(a.amount_requested))}</p>
                {a.reason && <p className="text-[10px] text-white/40 mt-1">{a.reason}</p>}
                {a.deduction_month && <p className="text-[9px] text-white/20 font-mono mt-0.5">Deduction: {a.deduction_month}/{a.deduction_year}</p>}
                <p className="text-[9px] text-white/20 font-mono mt-0.5">{new Date(a.requested_at).toLocaleDateString("en-GB")}</p>

                {isPending && isManager && (
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => reviewMutation.mutate({ id: a.id, status: "approved" })}
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 rounded-xl text-[10px] font-bold active:scale-95">
                      <CheckCircle2 className="w-3 h-3" />Approve
                    </button>
                    <button onClick={() => reviewMutation.mutate({ id: a.id, status: "rejected" })}
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-red-500/15 text-red-400 border border-red-500/25 rounded-xl text-[10px] font-bold active:scale-95">
                      <X className="w-3 h-3" />Reject
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
