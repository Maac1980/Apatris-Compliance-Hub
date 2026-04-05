import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Code, Plus, Key, Webhook, Trash2, Send, CheckCircle2, X } from "lucide-react";
import { authHeaders, BASE } from "@/lib/api";


export default function DeveloperPortal() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"keys" | "webhooks" | "logs">("keys");
  const [showAddKey, setShowAddKey] = useState(false);
  const [showAddWH, setShowAddWH] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({});
  const [newKey, setNewKey] = useState<string | null>(null);

  const { data: keysData } = useQuery({ queryKey: ["dev-keys"], queryFn: async () => { const r = await fetch(`${import.meta.env.BASE_URL}api/developer/keys`, { headers: authHeaders() }); if (!r.ok) return { keys: [] }; return r.json(); } });
  const { data: whData } = useQuery({ queryKey: ["dev-webhooks"], queryFn: async () => { const r = await fetch(`${import.meta.env.BASE_URL}api/developer/webhooks`, { headers: authHeaders() }); if (!r.ok) return { webhooks: [] }; return r.json(); }, enabled: tab === "webhooks" });
  const { data: logData } = useQuery({ queryKey: ["dev-logs"], queryFn: async () => { const r = await fetch(`${import.meta.env.BASE_URL}api/developer/webhook-logs`, { headers: authHeaders() }); if (!r.ok) return { logs: [] }; return r.json(); }, enabled: tab === "logs" });

  const createKeyMutation = useMutation({
    mutationFn: async (body: Record<string, any>) => { const r = await fetch(`${import.meta.env.BASE_URL}api/developer/keys`, { method: "POST", headers: authHeaders(), body: JSON.stringify(body) }); if (!r.ok) throw new Error("Failed"); return r.json(); },
    onSuccess: (d) => { setNewKey(d.key); toast({ description: "API key created — save it now!" }); queryClient.invalidateQueries({ queryKey: ["dev-keys"] }); setShowAddKey(false); },
  });

  const revokeKeyMutation = useMutation({
    mutationFn: async (id: string) => { const r = await fetch(`${import.meta.env.BASE_URL}api/developer/keys/${id}`, { method: "DELETE", headers: authHeaders() }); if (!r.ok) throw new Error("Failed"); return r.json(); },
    onSuccess: () => { toast({ description: "Key revoked" }); queryClient.invalidateQueries({ queryKey: ["dev-keys"] }); },
  });

  const createWHMutation = useMutation({
    mutationFn: async (body: Record<string, any>) => { const r = await fetch(`${import.meta.env.BASE_URL}api/developer/webhooks`, { method: "POST", headers: authHeaders(), body: JSON.stringify(body) }); if (!r.ok) throw new Error("Failed"); return r.json(); },
    onSuccess: (d) => { toast({ description: `Webhook created. Secret: ${d.secret?.slice(0, 20)}...` }); queryClient.invalidateQueries({ queryKey: ["dev-webhooks"] }); setShowAddWH(false); setForm({}); },
  });

  const testWHMutation = useMutation({
    mutationFn: async (id: string) => { const r = await fetch(`${import.meta.env.BASE_URL}api/developer/webhooks/test`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ webhookId: id }) }); if (!r.ok) throw new Error("Failed"); return r.json(); },
    onSuccess: (d) => toast({ description: d.delivered ? `Delivered (${d.status})` : `Failed (${d.status})` }),
  });

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2"><Code className="w-7 h-7 text-[#C41E18]" /><h1 className="text-3xl font-bold text-white">Developer Portal</h1></div>
        <p className="text-gray-400">API keys, webhooks, and integration management</p>
      </div>

      <div className="flex gap-1 mb-6 bg-slate-800/50 rounded-lg p-1 w-fit">
        {(["keys", "webhooks", "logs"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-md text-sm font-bold ${tab === t ? "bg-[#C41E18] text-white" : "text-slate-400"}`}>{t === "keys" ? "API Keys" : t === "webhooks" ? "Webhooks" : "Logs"}</button>
        ))}
      </div>

      {/* New key alert */}
      {newKey && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 mb-4">
          <p className="text-xs font-bold text-emerald-400 mb-1">New API Key — Copy Now (shown once)</p>
          <code className="text-xs text-white font-mono bg-slate-800 px-3 py-1.5 rounded block break-all">{newKey}</code>
          <button onClick={() => { navigator.clipboard.writeText(newKey); toast({ description: "Copied" }); }} className="mt-2 text-xs text-emerald-400 font-bold">Copy to Clipboard</button>
        </div>
      )}

      {tab === "keys" && (
        <>
          <div className="flex justify-end mb-4"><button onClick={() => setShowAddKey(true)} className="flex items-center gap-2 px-4 py-2 bg-[#C41E18] text-white rounded-lg text-sm font-bold"><Plus className="w-4 h-4" />Create Key</button></div>
          <div className="space-y-2">
            {(keysData?.keys ?? []).map((k: any) => (
              <div key={k.id} className={`bg-slate-900 border rounded-xl p-4 flex items-center justify-between ${k.status === "active" ? "border-slate-700" : "border-red-500/20 opacity-50"}`}>
                <div><p className="text-sm font-bold text-white">{k.name}</p><p className="text-xs text-slate-400 font-mono">{k.key_prefix}</p>
                  <div className="flex gap-1 mt-1">{(typeof k.permissions === "string" ? JSON.parse(k.permissions) : k.permissions || []).map((p: string) => <span key={p} className="px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded text-[9px]">{p}</span>)}</div>
                </div>
                {k.status === "active" && <button onClick={() => revokeKeyMutation.mutate(k.id)} className="px-2 py-1 bg-red-600/20 text-red-400 border border-red-500/30 rounded text-[10px] font-bold"><Trash2 className="w-3 h-3 inline mr-1" />Revoke</button>}
              </div>
            ))}
          </div>
        </>
      )}

      {tab === "webhooks" && (
        <>
          <div className="flex justify-end mb-4"><button onClick={() => { setShowAddWH(true); setForm({}); }} className="flex items-center gap-2 px-4 py-2 bg-[#C41E18] text-white rounded-lg text-sm font-bold"><Plus className="w-4 h-4" />Add Webhook</button></div>
          <div className="space-y-2">
            {(whData?.webhooks ?? []).map((w: any) => (
              <div key={w.id} className="bg-slate-900 border border-slate-700 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div><p className="text-sm font-bold text-white">{w.name}</p><p className="text-xs text-slate-400 font-mono truncate">{w.url}</p></div>
                  <button onClick={() => testWHMutation.mutate(w.id)} className="px-2 py-1 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded text-[10px] font-bold"><Send className="w-3 h-3 inline mr-1" />Test</button>
                </div>
                <div className="flex gap-1 flex-wrap">{(typeof w.events === "string" ? JSON.parse(w.events) : w.events || []).map((e: string) => <span key={e} className="px-1.5 py-0.5 bg-indigo-500/10 text-indigo-400 rounded text-[9px]">{e}</span>)}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === "logs" && (
        <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-700 bg-slate-800/50"><th className="text-left px-4 py-3 text-xs font-bold text-slate-400">Time</th><th className="text-left px-4 py-3 text-xs font-bold text-slate-400">Webhook</th><th className="text-left px-4 py-3 text-xs font-bold text-slate-400">Event</th><th className="text-left px-4 py-3 text-xs font-bold text-slate-400">Status</th></tr></thead>
            <tbody>{(logData?.logs ?? []).map((l: any) => (
              <tr key={l.id} className="border-b border-slate-800">
                <td className="px-4 py-3 text-slate-400 font-mono text-xs">{new Date(l.delivered_at).toLocaleString("en-GB")}</td>
                <td className="px-4 py-3 text-white text-xs">{l.webhook_name}</td>
                <td className="px-4 py-3 text-indigo-400 text-xs font-mono">{l.event}</td>
                <td className="px-4 py-3"><span className={`text-[10px] font-bold ${l.response_status >= 200 && l.response_status < 300 ? "text-emerald-400" : "text-red-400"}`}>{l.response_status || "Failed"}</span></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {showAddKey && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/50" onClick={() => setShowAddKey(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-4">Create API Key</h3>
            <input placeholder="Key Name" value={form.name || ""} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 mb-3 focus:outline-none" />
            <p className="text-xs text-slate-500 mb-2">Permissions:</p>
            <div className="flex flex-wrap gap-2 mb-4">{(keysData?.availablePermissions ?? []).map((p: string) => (
              <button key={p} onClick={() => { const perms = form.permissions || []; setForm({ ...form, permissions: perms.includes(p) ? perms.filter((x: string) => x !== p) : [...perms, p] }); }}
                className={`px-2 py-1 rounded text-xs font-bold border ${(form.permissions || []).includes(p) ? "bg-[#C41E18]/20 text-[#C41E18] border-[#C41E18]/30" : "bg-slate-800 text-slate-400 border-slate-700"}`}>{p}</button>
            ))}</div>
            <div className="flex gap-2"><button onClick={() => setShowAddKey(false)} className="flex-1 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg text-sm font-bold">Cancel</button>
              <button onClick={() => createKeyMutation.mutate(form)} disabled={!form.name} className="flex-1 px-4 py-2 bg-[#C41E18] text-white rounded-lg text-sm font-bold disabled:opacity-50">Create</button></div>
          </div>
        </div>
      )}

      {showAddWH && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/50" onClick={() => setShowAddWH(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-4">Add Webhook</h3>
            <input placeholder="Name" value={form.name || ""} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 mb-3 focus:outline-none" />
            <input placeholder="URL (https://...)" value={form.url || ""} onChange={e => setForm({ ...form, url: e.target.value })} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 mb-3 focus:outline-none" />
            <p className="text-xs text-slate-500 mb-2">Events:</p>
            <div className="flex flex-wrap gap-1 mb-4">{(whData?.availableEvents ?? []).map((e: string) => (
              <button key={e} onClick={() => { const evts = form.events || []; setForm({ ...form, events: evts.includes(e) ? evts.filter((x: string) => x !== e) : [...evts, e] }); }}
                className={`px-2 py-0.5 rounded text-[9px] font-bold border ${(form.events || []).includes(e) ? "bg-indigo-500/20 text-indigo-400 border-indigo-500/30" : "bg-slate-800 text-slate-500 border-slate-700"}`}>{e}</button>
            ))}</div>
            <div className="flex gap-2"><button onClick={() => setShowAddWH(false)} className="flex-1 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg text-sm font-bold">Cancel</button>
              <button onClick={() => createWHMutation.mutate(form)} disabled={!form.name || !form.url} className="flex-1 px-4 py-2 bg-[#C41E18] text-white rounded-lg text-sm font-bold disabled:opacity-50">Create</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
