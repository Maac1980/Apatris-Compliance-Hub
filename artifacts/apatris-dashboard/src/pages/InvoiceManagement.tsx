import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Receipt, Plus, Loader2, Send, CheckCircle2, X, FileText,
} from "lucide-react";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}
const BASE = import.meta.env.BASE_URL;

interface Invoice {
  id: string;
  number: string;
  clientName: string;
  amount: number;
  vatRate: number;
  vatAmount: number;
  total: number;
  currency: string;
  status: "draft" | "sent" | "paid" | "overdue";
  dueDate: string;
  issuedDate: string;
}

type StatusFilter = "all" | "draft" | "sent" | "paid" | "overdue";

const emptyForm = { clientName: "", amount: 0, vatRate: 23, dueDate: "", currency: "PLN" };

export default function InvoiceManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const { data: invoices = [], isLoading } = useQuery<Invoice[]>({
    queryKey: ["invoices"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/invoices`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to fetch invoices");
      return res.json();
    },
  });

  const createInvoice = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}api/invoices`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Failed to create invoice");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast({ title: "Invoice Created", description: "New invoice saved as draft." });
      setShowForm(false);
      setForm(emptyForm);
    },
    onError: () => toast({ title: "Error", description: "Failed to create invoice", variant: "destructive" }),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await fetch(`${BASE}api/invoices/${id}/status`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast({ title: "Updated", description: "Invoice status updated." });
    },
    onError: () => toast({ title: "Error", description: "Failed to update invoice", variant: "destructive" }),
  });

  const filtered = filter === "all" ? invoices : invoices.filter((i) => i.status === filter);

  const totalRevenue = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + i.total, 0);
  const totalPending = invoices.filter((i) => i.status === "sent").reduce((s, i) => s + i.total, 0);
  const totalDraft = invoices.filter((i) => i.status === "draft").reduce((s, i) => s + i.total, 0);

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      draft: "bg-slate-800 text-slate-400 border border-slate-600/50",
      sent: "bg-blue-900/50 text-blue-300 border border-blue-600/50",
      paid: "bg-green-900/50 text-green-300 border border-green-600/50",
      overdue: "bg-red-900/50 text-red-300 border border-red-600/50",
    };
    return map[status] ?? "bg-card text-muted-foreground border border-border";
  };

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Receipt className="w-6 h-6 text-primary" /> Invoices
            </h1>
            <p className="text-muted-foreground text-sm mt-1">Manage invoices, track payments, and revenue</p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition"
          >
            <Plus className="w-4 h-4" /> New Invoice
          </button>
        </div>

        {/* Revenue Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Revenue (Paid)</p>
            <p className="text-2xl font-bold text-green-400 mt-1">{totalRevenue.toLocaleString()} PLN</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Pending (Sent)</p>
            <p className="text-2xl font-bold text-blue-400 mt-1">{totalPending.toLocaleString()} PLN</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Draft</p>
            <p className="text-2xl font-bold text-muted-foreground mt-1">{totalDraft.toLocaleString()} PLN</p>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2">
          {(["all", "draft", "sent", "paid", "overdue"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors capitalize ${
                filter === f
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-border hover:text-foreground"
              }`}
            >
              {f} {f !== "all" && `(${invoices.filter((i) => i.status === f).length})`}
            </button>
          ))}
        </div>

        {/* Form */}
        {showForm && (
          <div className="bg-card border border-border rounded-lg p-5 space-y-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-foreground font-semibold">New Invoice</h3>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
            <input value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} placeholder="Client name" className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm" />
            <div className="grid grid-cols-2 gap-3">
              <input value={form.amount || ""} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) || 0 })} placeholder="Net amount" type="number" className="px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm" />
              <input value={form.vatRate} onChange={(e) => setForm({ ...form, vatRate: Number(e.target.value) || 0 })} placeholder="VAT %" type="number" className="px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Due Date</label>
              <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm" />
            </div>
            {form.amount > 0 && (
              <p className="text-sm text-muted-foreground">
                VAT: {(form.amount * form.vatRate / 100).toFixed(2)} PLN | Total: <span className="text-foreground font-bold">{(form.amount * (1 + form.vatRate / 100)).toFixed(2)} PLN</span>
              </p>
            )}
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => createInvoice.mutate()}
                disabled={createInvoice.isPending || !form.clientName.trim() || !form.amount}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {createInvoice.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create Invoice"}
              </button>
              <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-card border border-border text-foreground rounded-lg text-sm">Cancel</button>
            </div>
          </div>
        )}

        {/* Invoice List */}
        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">No invoices found.</div>
        ) : (
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Invoice #</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Client</th>
                  <th className="text-right px-4 py-3 text-muted-foreground font-medium">Net</th>
                  <th className="text-right px-4 py-3 text-muted-foreground font-medium">VAT</th>
                  <th className="text-right px-4 py-3 text-muted-foreground font-medium">Total</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Due</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Status</th>
                  <th className="text-right px-4 py-3 text-muted-foreground font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((inv) => (
                  <tr key={inv.id} className="border-b border-border hover:bg-card/50 transition">
                    <td className="px-4 py-3 text-foreground font-mono flex items-center gap-2">
                      <FileText className="w-4 h-4 text-muted-foreground" /> {inv.number}
                    </td>
                    <td className="px-4 py-3 text-foreground">{inv.clientName}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground font-mono">{inv.amount.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground font-mono">{inv.vatAmount.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-foreground font-mono font-bold">{inv.total.toLocaleString()} {inv.currency}</td>
                    <td className="px-4 py-3 text-muted-foreground">{new Date(inv.dueDate).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-mono uppercase ${statusBadge(inv.status)}`}>{inv.status}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex gap-1 justify-end">
                        {inv.status === "draft" && (
                          <button
                            onClick={() => updateStatus.mutate({ id: inv.id, status: "sent" })}
                            className="p-1.5 rounded-lg bg-blue-900/30 text-blue-400 hover:bg-blue-900/50 transition"
                            title="Mark as Sent"
                          >
                            <Send className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {(inv.status === "sent" || inv.status === "overdue") && (
                          <button
                            onClick={() => updateStatus.mutate({ id: inv.id, status: "paid" })}
                            className="p-1.5 rounded-lg bg-green-900/30 text-green-400 hover:bg-green-900/50 transition"
                            title="Mark as Paid"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
