import { useQuery } from "@tanstack/react-query";
import { Code, Key, Webhook } from "lucide-react";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

const API = import.meta.env.VITE_API_URL ?? "";

export function DeveloperTab() {
  const { data: keys } = useQuery({ queryKey: ["dev-keys"], queryFn: async () => { const r = await fetch(`${API}api/developer/keys`, { headers: authHeaders() }); if (!r.ok) return { keys: [] }; return r.json(); } });
  const { data: wh } = useQuery({ queryKey: ["dev-webhooks"], queryFn: async () => { const r = await fetch(`${API}api/developer/webhooks`, { headers: authHeaders() }); if (!r.ok) return { webhooks: [] }; return r.json(); } });

  return (
    <div className="p-4 min-h-full overflow-y-auto pb-24 bg-[#0c0c0e]">
      <div className="flex items-center gap-2 mb-4"><Code className="w-5 h-5 text-[#C41E18]" /><h2 className="text-lg font-bold text-white">Developer</h2></div>
      <div className="flex gap-2 mb-4">
        <div className="flex-1 px-3 py-2 bg-slate-500/10 border border-slate-500/20 rounded-xl text-center"><p className="text-lg font-black text-white">{(keys?.keys ?? []).filter((k: any) => k.status === "active").length}</p><p className="text-[9px] text-white/40 uppercase font-bold">API Keys</p></div>
        <div className="flex-1 px-3 py-2 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-center"><p className="text-lg font-black text-indigo-400">{(wh?.webhooks ?? []).length}</p><p className="text-[9px] text-indigo-400/60 uppercase font-bold">Webhooks</p></div>
      </div>
      <p className="text-xs font-bold text-white mb-2">API Keys</p>
      <div className="space-y-1.5 mb-4">{(keys?.keys ?? []).map((k: any) => (
        <div key={k.id} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 flex items-center justify-between">
          <div><p className="text-xs font-bold text-white">{k.name}</p><p className="text-[9px] text-white/30 font-mono">{k.key_prefix}</p></div>
          <span className={`text-[9px] font-bold ${k.status === "active" ? "text-emerald-400" : "text-red-400"}`}>{k.status}</span>
        </div>
      ))}</div>
      <p className="text-xs font-bold text-white mb-2">Webhooks</p>
      <div className="space-y-1.5">{(wh?.webhooks ?? []).map((w: any) => (
        <div key={w.id} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
          <p className="text-xs font-bold text-white">{w.name}</p><p className="text-[9px] text-white/30 font-mono truncate">{w.url}</p>
        </div>
      ))}</div>
    </div>
  );
}
