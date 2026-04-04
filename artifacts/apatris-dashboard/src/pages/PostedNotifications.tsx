import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Globe, Plus, Send, CheckCircle2, AlertTriangle, ExternalLink } from "lucide-react";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

interface Notification { id: string; worker_name: string; company_name: string | null; host_country: string; start_date: string; end_date: string; role_type: string | null; notification_system: string; notification_ref: string | null; status: string; required_documents: any; }

const FLAGS: Record<string, string> = { BE: "��🇪", NL: "🇳🇱", PL: "🇵🇱", LT: "🇱🇹", SK: "🇸🇰", CZ: "🇨🇿", RO: "🇷🇴" };
const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  draft: { bg: "bg-slate-500/10 border-slate-500/20", text: "text-slate-400" },
  submitted: { bg: "bg-blue-500/10 border-blue-500/20", text: "text-blue-400" },
  confirmed: { bg: "bg-emerald-500/10 border-emerald-500/20", text: "text-emerald-400" },
  rejected: { bg: "bg-red-500/10 border-red-500/20", text: "text-red-400" },
  expired: { bg: "bg-red-900/20 border-red-800/30", text: "text-red-300" },
};

export default function PostedNotifications() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [countryFilter, setCountryFilter] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const { data: summary } = useQuery({
    queryKey: ["posted-summary"],
    queryFn: async () => { const r = await fetch(`${import.meta.env.BASE_URL}api/posted-workers/summary`, { headers: authHeaders() }); if (!r.ok) return {}; return r.json(); },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["posted-notifications", countryFilter],
    queryFn: async () => { const r = await fetch(`${import.meta.env.BASE_URL}api/posted-workers/notifications${countryFilter ? `?country=${countryFilter}` : ""}`, { headers: authHeaders() }); if (!r.ok) throw new Error("Failed"); return r.json() as Promise<{ notifications: Notification[] }>; },
  });

  const { data: workersData } = useQuery({ queryKey: ["workers-list"], queryFn: async () => { const r = await fetch(`${import.meta.env.BASE_URL}api/workers`, { headers: authHeaders() }); if (!r.ok) return { workers: [] }; return r.json(); } });

  const addMutation = useMutation({
    mutationFn: async (body: Record<string, any>) => { const r = await fetch(`${import.meta.env.BASE_URL}api/posted-workers/notifications`, { method: "POST", headers: authHeaders(), body: JSON.stringify(body) }); if (!r.ok) throw new Error("Failed"); return r.json(); },
    onSuccess: () => { toast({ description: "Notification created" }); queryClient.invalidateQueries({ queryKey: ["posted-notifications", "posted-summary"] }); setShowAdd(false); setForm({}); },
  });

  const submitMutation = useMutation({
    mutationFn: async (id: string) => { const r = await fetch(`${import.meta.env.BASE_URL}api/posted-workers/notifications/${id}/submit`, { method: "POST", headers: authHeaders() }); if (!r.ok) throw new Error("Failed"); return r.json(); },
    onSuccess: (d) => { toast({ description: `Submitted. Portal: ${d.portalUrl || d.message}` }); queryClient.invalidateQueries({ queryKey: ["posted-notifications", "posted-summary"] }); },
  });

  const s = summary ?? {};
  const notifications = data?.notifications ?? [];

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2"><Globe className="w-7 h-7 text-[#C41E18]" /><h1 className="text-3xl font-bold text-white">Posted Worker Notifications</h1></div>
        <p className="text-gray-400">7-country posting notifications — Limosa, WagwEU, PIP, VDI, NIP, SÚIP, ITM</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-slate-800 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">Total</p><p className="text-2xl font-bold text-white">{s.total ?? 0}</p></div>
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">Drafts</p><p className="text-2xl font-bold text-amber-400">{s.drafts ?? 0}</p></div>
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">Submitted</p><p className="text-2xl font-bold text-blue-400">{s.submitted ?? 0}</p></div>
        <div className={`rounded-xl p-4 ${(s.expiring ?? 0) > 0 ? "bg-red-500/10 border border-red-500/20" : "bg-emerald-500/10 border border-emerald-500/20"}`}><p className="text-xs text-gray-400 font-mono uppercase mb-1">Expiring (30d)</p><p className={`text-2xl font-bold ${(s.expiring ?? 0) > 0 ? "text-red-400" : "text-emerald-400"}`}>{s.expiring ?? 0}</p></div>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className="flex gap-1">
          {[{ code: "", label: "All" }, ...Object.keys(FLAGS).map(c => ({ code: c, label: `${FLAGS[c]} ${c}` }))].map(c => (
            <button key={c.code} onClick={() => setCountryFilter(c.code)} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${countryFilter === c.code ? "bg-[#C41E18] text-white" : "bg-slate-800 text-slate-400"}`}>{c.label}</button>
          ))}
        </div>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-2 bg-[#C41E18] text-white rounded-lg text-sm font-bold ml-auto"><Plus className="w-4 h-4" />New</button>
      </div>

      {isLoading ? <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-[#C41E18] border-t-transparent rounded-full" /></div> : notifications.length === 0 ? (
        <div className="text-center py-20 text-slate-500"><Globe className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="text-lg font-semibold">No notifications</p></div>
      ) : (
        <div className="space-y-3">
          {notifications.map(n => {
            const st = STATUS_STYLES[n.status] || STATUS_STYLES.draft;
            const days = n.end_date ? Math.ceil((new Date(n.end_date).getTime() - Date.now()) / 86_400_000) : null;
            const docs = typeof n.required_documents === "string" ? JSON.parse(n.required_documents) : (n.required_documents || []);
            return (
              <div key={n.id} className={`rounded-xl border p-4 ${st.bg}`}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">{FLAGS[n.host_country] || "🌍"}</span>
                      <p className="text-sm font-bold text-white">{n.worker_name}</p>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${st.text} bg-white/5`}>{n.status.toUpperCase()}</span>
                    </div>
                    <p className="text-xs text-slate-400">{n.notification_system} · {n.company_name || ""} · {n.role_type || ""}</p>
                  </div>
                  {n.status === "draft" && (
                    <button onClick={() => submitMutation.mutate(n.id)} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-lg text-xs font-bold"><Send className="w-3 h-3" />Submit</button>
                  )}
                </div>
                <div className="flex gap-3 text-xs text-slate-500 mb-2">
                  <span>{n.start_date ? new Date(n.start_date).toLocaleDateString("en-GB") : ""} — {n.end_date ? new Date(n.end_date).toLocaleDateString("en-GB") : ""}</span>
                  {n.notification_ref && <span className="font-mono">Ref: {n.notification_ref}</span>}
                  {days !== null && days <= 30 && <span className="text-red-400 font-bold">Expires in {days}d</span>}
                </div>
                {docs.length > 0 && (
                  <div className="flex flex-wrap gap-1">{docs.map((d: string) => <span key={d} className="px-2 py-0.5 bg-slate-800 text-slate-400 rounded text-[9px]">{d}</span>)}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowAdd(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-4">New Posting Notification</h3>
            <div className="space-y-3">
              <select value={form.workerId || ""} onChange={e => { const w = (workersData?.workers ?? []).find((w: any) => w.id === e.target.value); setForm({ ...form, workerId: e.target.value, workerName: w?.fullName || w?.full_name || "" }); }}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#C41E18]">
                <option value="">Select Worker</option>
                {(workersData?.workers ?? []).map((w: any) => <option key={w.id} value={w.id}>{w.fullName || w.full_name}</option>)}
              </select>
              <select value={form.hostCountry || ""} onChange={e => setForm({ ...form, hostCountry: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#C41E18]">
                <option value="">Host Country</option>
                {Object.entries(FLAGS).map(([code, flag]) => <option key={code} value={code}>{flag} {code}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-3">
                <input type="date" value={form.startDate || ""} onChange={e => setForm({ ...form, startDate: e.target.value })} className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none" />
                <input type="date" value={form.endDate || ""} onChange={e => setForm({ ...form, endDate: e.target.value })} className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none" />
              </div>
              <input placeholder="Role Type" value={form.roleType || ""} onChange={e => setForm({ ...form, roleType: e.target.value })} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none" />
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowAdd(false)} className="flex-1 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg text-sm font-bold">Cancel</button>
              <button onClick={() => addMutation.mutate(form)} disabled={!form.workerId || !form.hostCountry} className="flex-1 px-4 py-2 bg-[#C41E18] text-white rounded-lg text-sm font-bold disabled:opacity-50">Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
