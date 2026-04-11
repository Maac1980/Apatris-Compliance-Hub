/**
 * Regulatory Source Registry — manage monitored sources.
 * Add/edit/enable/disable sources. View trust level and polling config.
 */

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { authHeaders, BASE } from "@/lib/api";
import { Settings, Plus, Loader2, CheckCircle2, XOctagon } from "lucide-react";

const TRUST_STYLE: Record<string, string> = {
  official: "bg-emerald-500/20 text-emerald-400", primary_law: "bg-purple-500/20 text-purple-400", secondary: "bg-slate-600 text-slate-400",
};

export default function RegulatorySourceRegistry() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["reg-sources"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/v1/regulatory/sources`, { headers: authHeaders() });
      if (!res.ok) return { sources: [] };
      return res.json();
    },
  });

  const seedMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}api/v1/regulatory/seed-sources`, { method: "POST", headers: authHeaders() });
      if (!res.ok) throw new Error("Seed failed");
      return res.json();
    },
    onSuccess: (d) => { toast({ description: `Seeded ${d.seeded} sources` }); qc.invalidateQueries({ queryKey: ["reg-sources"] }); },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const res = await fetch(`${BASE}api/v1/regulatory/sources/${id}`, { method: "PATCH", headers: authHeaders(), body: JSON.stringify({ active }) });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reg-sources"] }),
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}api/v1/regulatory/sources`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ name: form.name, sourceType: form.sourceType || "page", baseUrl: form.baseUrl, jurisdiction: form.jurisdiction || "PL", trustLevel: form.trustLevel || "secondary", pollingFrequency: form.pollingFrequency || "daily", language: form.language || "pl" }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => { toast({ description: "Source added" }); qc.invalidateQueries({ queryKey: ["reg-sources"] }); setShowAdd(false); setForm({}); },
    onError: (err) => toast({ description: (err as Error).message, variant: "destructive" }),
  });

  const sources = data?.sources ?? [];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 overflow-y-auto pb-20">
      <div className="border-b border-slate-800 bg-slate-900/50 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-700/50 border border-slate-600 flex items-center justify-center">
              <Settings className="w-5 h-5 text-slate-300" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">Source Registry</h1>
              <p className="text-xs text-slate-500 font-mono uppercase tracking-widest mt-1">Monitored regulatory sources</p>
            </div>
          </div>
          <div className="flex gap-2">
            {sources.length === 0 && <button onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-bold"><Plus className="w-4 h-4" /> Seed Defaults</button>}
            <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold"><Plus className="w-4 h-4" /> Add Source</button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-3">
        {isLoading ? <div className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin text-slate-500 mx-auto" /></div>
        : sources.length === 0 ? <div className="text-center py-12 text-slate-600"><Settings className="w-10 h-10 mx-auto mb-2 opacity-30" /><p>No sources. Click "Seed Defaults" to add Polish regulatory sources.</p></div>
        : sources.map((s: any) => (
          <div key={s.id} className={`rounded-xl border p-4 ${s.active ? "bg-slate-900 border-slate-800" : "bg-slate-900/50 border-slate-800/50 opacity-60"}`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white">{s.name}</span>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${TRUST_STYLE[s.trust_level] ?? TRUST_STYLE.secondary}`}>{s.trust_level}</span>
                  <span className="text-[9px] bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded">{s.source_type}</span>
                  <span className="text-[9px] bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded">{s.jurisdiction}</span>
                  <span className="text-[9px] bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded">{s.language}</span>
                  <span className="text-[9px] bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded">{s.polling_frequency}</span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-500">
                  <span className="truncate max-w-[400px]">{s.base_url}</span>
                  {s.last_scanned_at && <span>Scanned: {new Date(s.last_scanned_at).toLocaleDateString("pl-PL")}</span>}
                  {s.last_error && <span className="text-red-400 truncate max-w-[200px]">Error: {s.last_error}</span>}
                </div>
              </div>
              <button onClick={() => toggleMutation.mutate({ id: s.id, active: !s.active })}
                className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-bold ${s.active ? "bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30" : "bg-slate-700 text-slate-400 hover:bg-slate-600"}`}>
                {s.active ? <><CheckCircle2 className="w-3 h-3" /> Active</> : <><XOctagon className="w-3 h-3" /> Disabled</>}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add Source Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60" onClick={() => setShowAdd(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-white mb-4">Add Regulatory Source</h2>
            <div className="space-y-3">
              <div><label className="text-xs text-slate-500">Name *</label><input type="text" value={form.name ?? ""} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full mt-1 text-sm bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white" /></div>
              <div><label className="text-xs text-slate-500">URL *</label><input type="text" value={form.baseUrl ?? ""} onChange={e => setForm(f => ({ ...f, baseUrl: e.target.value }))} className="w-full mt-1 text-sm bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-slate-500">Type</label>
                  <select value={form.sourceType ?? "page"} onChange={e => setForm(f => ({ ...f, sourceType: e.target.value }))} className="w-full mt-1 text-sm bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white">
                    <option value="rss">RSS</option><option value="page">Page</option>
                  </select></div>
                <div><label className="text-xs text-slate-500">Trust Level</label>
                  <select value={form.trustLevel ?? "secondary"} onChange={e => setForm(f => ({ ...f, trustLevel: e.target.value }))} className="w-full mt-1 text-sm bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white">
                    <option value="official">Official</option><option value="primary_law">Primary Law</option><option value="secondary">Secondary</option>
                  </select></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="text-xs text-slate-500">Jurisdiction</label><input type="text" value={form.jurisdiction ?? "PL"} onChange={e => setForm(f => ({ ...f, jurisdiction: e.target.value }))} className="w-full mt-1 text-sm bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white" /></div>
                <div><label className="text-xs text-slate-500">Language</label><input type="text" value={form.language ?? "pl"} onChange={e => setForm(f => ({ ...f, language: e.target.value }))} className="w-full mt-1 text-sm bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white" /></div>
                <div><label className="text-xs text-slate-500">Polling</label>
                  <select value={form.pollingFrequency ?? "daily"} onChange={e => setForm(f => ({ ...f, pollingFrequency: e.target.value }))} className="w-full mt-1 text-sm bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white">
                    <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="hourly">Hourly</option>
                  </select></div>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowAdd(false)} className="flex-1 py-2 rounded-lg bg-slate-700 text-slate-300 text-sm font-bold hover:bg-slate-600">Cancel</button>
              <button onClick={() => addMutation.mutate()} disabled={!form.name || !form.baseUrl || addMutation.isPending}
                className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-50">
                {addMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Add Source"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
