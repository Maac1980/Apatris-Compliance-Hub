import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { authHeaders, BASE } from "@/lib/api";
import {
  Receipt, Plus, Send, CheckCircle2, Clock, AlertTriangle, Search,
} from "lucide-react";


interface Invoice {
  id: string;
  invoice_number: string;
  client_name: string | null;
  client_id: string | null;
  amount_net: string;
  vat_amount: string;
  amount_gross: string;
  total: string;
  subtotal: string;
  due_date: string | null;
  status: string;
  computed_status: string;
  created_at: string;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; icon: React.ElementType }> = {
  draft:   { bg: "bg-slate-500/10 border-slate-500/20", text: "text-slate-400", icon: Clock },
  sent:    { bg: "bg-blue-500/10 border-blue-500/20",   text: "text-blue-400",  icon: Send },
  paid:    { bg: "bg-emerald-500/10 border-emerald-500/20", text: "text-emerald-400", icon: CheckCircle2 },
  overdue: { bg: "bg-red-500/10 border-red-500/20",     text: "text-red-400",   icon: AlertTriangle },
};

export default function InvoiceManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/invoices`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ invoices: Invoice[]; outstanding: number }>;
    },
  });

  const { data: companiesData } = useQuery({
    queryKey: ["crm-companies"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/crm/companies`, { headers: authHeaders() });
      if (!res.ok) return { companies: [] };
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (body: Record<string, any>) => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/invoices`, { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => { toast({ description: "Invoice created" }); queryClient.invalidateQueries({ queryKey: ["invoices"] }); setShowCreate(false); setForm({}); },
    onError: (err) => { toast({ description: err instanceof Error ? err.message : "Failed", variant: "destructive" }); },
  });

  const sendMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/invoices/${id}/send`, { method: "POST", headers: authHeaders() });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Failed"); }
      return res.json();
    },
    onSuccess: (data) => { toast({ description: `Sent to ${data.to}` }); queryClient.invalidateQueries({ queryKey: ["invoices"] }); },
    onError: (err) => { toast({ description: err instanceof Error ? err.message : "Send failed", variant: "destructive" }); },
  });

  const markPaidMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/invoices/${id}`, {
        method: "PATCH", headers: authHeaders(), body: JSON.stringify({ status: "paid" }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => { toast({ description: "Marked as paid" }); queryClient.invalidateQueries({ queryKey: ["invoices"] }); },
  });

  const invoices = data?.invoices ?? [];
  const outstanding = data?.outstanding ?? 0;
  const filtered = useMemo(() => {
    if (!search) return invoices;
    const q = search.toLowerCase();
    return invoices.filter(i => (i.client_name || "").toLowerCase().includes(q) || i.invoice_number.toLowerCase().includes(q));
  }, [invoices, search]);

  const counts = useMemo(() => {
    const c = { draft: 0, sent: 0, paid: 0, overdue: 0 };
    for (const i of invoices) { const s = i.computed_status as keyof typeof c; if (s in c) c[s]++; }
    return c;
  }, [invoices]);

  const fmtEur = (n: number | string) => Number(n).toLocaleString("en", { style: "currency", currency: "EUR" });

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Receipt className="w-7 h-7 text-[#C41E18]" />
          <h1 className="text-3xl font-bold text-white">Invoices</h1>
        </div>
        <p className="text-gray-400">Faktura VAT — manage, send, and track payments</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
          <p className="text-xs text-gray-400 font-mono uppercase mb-1">Outstanding</p>
          <p className="text-xl font-bold text-red-400">{fmtEur(outstanding)}</p>
        </div>
        {(["draft", "sent", "overdue", "paid"] as const).map(s => {
          const st = STATUS_STYLES[s];
          return (
            <div key={s} className={`${st.bg} border rounded-xl p-4`}>
              <p className="text-xs text-gray-400 font-mono uppercase mb-1">{s}</p>
              <p className={`text-2xl font-bold ${st.text}`}>{counts[s]}</p>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input type="text" placeholder="Search invoices..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C41E18]" />
        </div>
        <button onClick={() => { setShowCreate(true); setForm({}); }}
          className="flex items-center gap-2 px-4 py-2 bg-[#C41E18] text-white rounded-lg text-sm font-bold hover:bg-[#a51914]">
          <Plus className="w-4 h-4" />New Invoice
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-[#C41E18] border-t-transparent rounded-full" /></div>
      ) : (
        <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 bg-slate-800/50">
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase">Invoice #</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase">Client</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase">Net</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase">VAT</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase">Gross</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase">Due</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase">Status</th>
                <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(inv => {
                const st = STATUS_STYLES[inv.computed_status] || STATUS_STYLES.draft;
                const Icon = st.icon;
                const gross = Number(inv.amount_gross || inv.total || 0);
                const net = Number(inv.amount_net || inv.subtotal || 0);
                const vat = Number(inv.vat_amount || 0);
                return (
                  <tr key={inv.id} className="border-b border-slate-800 hover:bg-slate-800/40">
                    <td className="px-4 py-3 font-mono font-bold text-white text-xs">{inv.invoice_number}</td>
                    <td className="px-4 py-3 text-slate-300">{inv.client_name || "—"}</td>
                    <td className="px-4 py-3 text-slate-300 font-mono text-xs">{fmtEur(net)}</td>
                    <td className="px-4 py-3 text-amber-400 font-mono text-xs">{fmtEur(vat)}</td>
                    <td className="px-4 py-3 text-emerald-400 font-mono text-xs font-bold">{fmtEur(gross)}</td>
                    <td className="px-4 py-3 text-slate-400 font-mono text-xs">{inv.due_date ? new Date(inv.due_date).toLocaleDateString("en-GB") : "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${st.bg} ${st.text}`}>
                        <Icon className="w-2.5 h-2.5" />{inv.computed_status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5">
                        {(inv.computed_status === "draft" || inv.computed_status === "overdue") && (
                          <button onClick={() => sendMutation.mutate(inv.id)} disabled={sendMutation.isPending}
                            className="px-2 py-1 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded text-[10px] font-bold hover:bg-blue-600/30 disabled:opacity-50">
                            <Send className="w-3 h-3 inline mr-1" />Send
                          </button>
                        )}
                        {inv.computed_status !== "paid" && (
                          <button onClick={() => markPaidMutation.mutate(inv.id)} disabled={markPaidMutation.isPending}
                            className="px-2 py-1 bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 rounded text-[10px] font-bold hover:bg-emerald-600/30 disabled:opacity-50">
                            <CheckCircle2 className="w-3 h-3 inline mr-1" />Paid
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/50" onClick={() => setShowCreate(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-4">New Invoice</h3>
            <div className="space-y-3">
              <select value={form.clientId || ""} onChange={e => {
                const co = (companiesData?.companies ?? []).find((c: any) => c.id === e.target.value);
                setForm({ ...form, clientId: e.target.value, clientName: co?.company_name || "" });
              }}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#C41E18]">
                <option value="">Select Company</option>
                {(companiesData?.companies ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
              </select>
              <input type="number" placeholder="Net Amount (EUR)" value={form.amountNet || ""} onChange={e => setForm({ ...form, amountNet: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C41E18]" />
              <p className="text-xs text-slate-500">VAT 23% = {fmtEur(Number(form.amountNet || 0) * 0.23)} | Gross = {fmtEur(Number(form.amountNet || 0) * 1.23)}</p>
              <input placeholder="Notes" value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C41E18]" />
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowCreate(false)} className="flex-1 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg text-sm font-bold">Cancel</button>
              <button onClick={() => createMutation.mutate(form)} disabled={!form.clientId || !form.amountNet}
                className="flex-1 px-4 py-2 bg-[#C41E18] text-white rounded-lg text-sm font-bold disabled:opacity-50">Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
