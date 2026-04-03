import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Receipt, CheckCircle2, Clock, Send, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

const API = import.meta.env.VITE_API_URL ?? "";

interface Invoice {
  id: string;
  invoice_number: string;
  client_name: string | null;
  amount_gross: string;
  total: string;
  due_date: string | null;
  computed_status: string;
}

const STATUS_STYLE: Record<string, { text: string; dot: string; label: string }> = {
  draft:   { text: "text-slate-400",   dot: "bg-slate-400",   label: "DRAFT" },
  sent:    { text: "text-blue-400",    dot: "bg-blue-400",    label: "SENT" },
  paid:    { text: "text-emerald-400", dot: "bg-emerald-400", label: "PAID" },
  overdue: { text: "text-red-400",     dot: "bg-red-400",     label: "OVERDUE" },
};

export function InvoiceTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      const res = await fetch(`${API}api/invoices`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ invoices: Invoice[]; outstanding: number }>;
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${API}api/invoices/${id}`, {
        method: "PATCH", headers: authHeaders(), body: JSON.stringify({ status: "paid" }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => { toast({ description: "Marked as paid" }); queryClient.invalidateQueries({ queryKey: ["invoices"] }); },
    onError: () => { toast({ description: "Failed", variant: "destructive" }); },
  });

  const invoices = data?.invoices ?? [];
  const outstanding = data?.outstanding ?? 0;
  const fmtEur = (n: number | string) => Number(n).toLocaleString("en", { style: "currency", currency: "EUR" });

  return (
    <div className="p-4 min-h-full overflow-y-auto pb-24 bg-[#0c0c0e]">
      <div className="flex items-center gap-2 mb-3">
        <Receipt className="w-5 h-5 text-[#C41E18]" />
        <h2 className="text-lg font-bold text-white">Invoices</h2>
      </div>

      {/* Outstanding pill */}
      <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-xl">
        <AlertTriangle className="w-4 h-4 text-red-400" />
        <p className="text-sm font-black text-red-400 font-mono">{fmtEur(outstanding)}</p>
        <p className="text-[10px] text-red-400/60 ml-auto">Outstanding</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin w-6 h-6 border-2 border-[#C41E18] border-t-transparent rounded-full" />
        </div>
      ) : invoices.length === 0 ? (
        <div className="text-center py-16 text-white/30">
          <Receipt className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm font-semibold">No invoices</p>
        </div>
      ) : (
        <div className="space-y-2">
          {invoices.map(inv => {
            const st = STATUS_STYLE[inv.computed_status] || STATUS_STYLE.draft;
            const gross = Number(inv.amount_gross || inv.total || 0);
            return (
              <div key={inv.id} className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-3.5">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-black text-white font-mono">{inv.invoice_number}</p>
                  <span className={cn("flex items-center gap-1.5 text-[9px] font-bold", st.text)}>
                    <span className={cn("w-1.5 h-1.5 rounded-full", st.dot)} />{st.label}
                  </span>
                </div>
                <p className="text-[11px] text-white/40">{inv.client_name || "—"}</p>
                <div className="flex items-center justify-between mt-2">
                  <p className="text-sm font-black text-emerald-400 font-mono">{fmtEur(gross)}</p>
                  <div className="flex gap-1.5">
                    {inv.computed_status !== "paid" && (
                      <button
                        onClick={() => markPaidMutation.mutate(inv.id)}
                        disabled={markPaidMutation.isPending}
                        className="flex items-center gap-1 px-2 py-1 bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 rounded-lg text-[10px] font-bold active:scale-95 disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-3 h-3" />Paid
                      </button>
                    )}
                  </div>
                </div>
                {inv.due_date && (
                  <p className="text-[9px] text-white/20 font-mono mt-1">Due: {new Date(inv.due_date).toLocaleDateString("en-GB")}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
