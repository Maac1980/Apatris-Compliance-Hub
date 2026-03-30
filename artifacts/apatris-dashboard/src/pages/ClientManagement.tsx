import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Building2, Plus, Loader2, Pencil, Trash2, X, Phone, Mail, User,
} from "lucide-react";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}
const BASE = import.meta.env.BASE_URL;

interface Client {
  id: string;
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  nip: string;
  billingRate: number;
  currency: string;
}

const emptyForm = { name: "", contactPerson: "", email: "", phone: "", nip: "", billingRate: 0, currency: "PLN" };

export default function ClientManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const { data: clients = [], isLoading } = useQuery<Client[]>({
    queryKey: ["clients"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/clients`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to fetch clients");
      return res.json();
    },
  });

  const saveClient = useMutation({
    mutationFn: async () => {
      const url = editId ? `${BASE}api/clients/${editId}` : `${BASE}api/clients`;
      const method = editId ? "PATCH" : "POST";
      const res = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(form) });
      if (!res.ok) throw new Error("Failed to save client");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast({ title: editId ? "Client Updated" : "Client Created", description: "Client saved successfully." });
      resetForm();
    },
    onError: () => toast({ title: "Error", description: "Failed to save client", variant: "destructive" }),
  });

  const deleteClient = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${BASE}api/clients/${id}`, { method: "DELETE", headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast({ title: "Client Deleted", description: "Client removed successfully." });
      setDeleteConfirm(null);
    },
    onError: () => toast({ title: "Error", description: "Failed to delete client", variant: "destructive" }),
  });

  const resetForm = () => { setShowForm(false); setEditId(null); setForm(emptyForm); };

  const startEdit = (c: Client) => {
    setForm({ name: c.name, contactPerson: c.contactPerson, email: c.email, phone: c.phone, nip: c.nip, billingRate: c.billingRate, currency: c.currency });
    setEditId(c.id);
    setShowForm(true);
  };

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Building2 className="w-6 h-6 text-primary" /> Client Management
            </h1>
            <p className="text-muted-foreground text-sm mt-1">Manage client companies, contacts, and billing rates</p>
          </div>
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition"
          >
            <Plus className="w-4 h-4" /> Add Client
          </button>
        </div>

        {/* Form */}
        {showForm && (
          <div className="bg-card border border-border rounded-lg p-5 space-y-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-foreground font-semibold">{editId ? "Edit Client" : "New Client"}</h3>
              <button onClick={resetForm} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Company name" className="px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm" />
              <input value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} placeholder="Contact person" className="px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm" />
              <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" type="email" className="px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm" />
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone" className="px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm" />
              <input value={form.nip} onChange={(e) => setForm({ ...form, nip: e.target.value })} placeholder="NIP (Tax ID)" className="px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm" />
              <input value={form.billingRate || ""} onChange={(e) => setForm({ ...form, billingRate: Number(e.target.value) || 0 })} placeholder="Billing rate (PLN/h)" type="number" className="px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm" />
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => saveClient.mutate()}
                disabled={saveClient.isPending || !form.name.trim()}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {saveClient.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : editId ? "Update" : "Create"}
              </button>
              <button onClick={resetForm} className="px-4 py-2 bg-card border border-border text-foreground rounded-lg text-sm">Cancel</button>
            </div>
          </div>
        )}

        {/* Client List */}
        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : clients.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">No clients found. Add your first client.</div>
        ) : (
          <div className="grid gap-4">
            {clients.map((c) => (
              <div key={c.id} className="bg-card border border-border rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-foreground font-semibold text-lg">{c.name}</h3>
                    <div className="flex flex-wrap gap-4 mt-2 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1"><User className="w-3 h-3" /> {c.contactPerson}</span>
                      <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {c.email}</span>
                      <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {c.phone}</span>
                    </div>
                    <div className="flex gap-4 mt-2 text-sm">
                      <span className="text-muted-foreground">NIP: <span className="text-foreground font-mono">{c.nip}</span></span>
                      <span className="text-muted-foreground">Rate: <span className="text-foreground font-mono">{c.billingRate} {c.currency}/h</span></span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => startEdit(c)} className="p-2 rounded-lg bg-card border border-border text-muted-foreground hover:text-foreground transition">
                      <Pencil className="w-4 h-4" />
                    </button>
                    {deleteConfirm === c.id ? (
                      <div className="flex gap-1">
                        <button onClick={() => deleteClient.mutate(c.id)} className="px-2 py-1 rounded bg-red-900/50 text-red-300 text-xs font-medium">Confirm</button>
                        <button onClick={() => setDeleteConfirm(null)} className="px-2 py-1 rounded bg-card border border-border text-muted-foreground text-xs">Cancel</button>
                      </div>
                    ) : (
                      <button onClick={() => setDeleteConfirm(c.id)} className="p-2 rounded-lg bg-card border border-border text-muted-foreground hover:text-red-400 transition">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
