import { useQuery } from "@tanstack/react-query";
import { Globe, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

const API = import.meta.env.VITE_API_URL ?? "";
const FLAGS: Record<string, string> = { BE: "🇧🇪", NL: "🇳🇱", PL: "🇵🇱", LT: "🇱🇹", SK: "🇸🇰", CZ: "🇨🇿", RO: "🇷🇴" };

interface Notif { id: string; worker_name: string; host_country: string; notification_system: string; status: string; start_date: string; end_date: string; }

export function PostedNotifTab() {
  const { data: summary } = useQuery({
    queryKey: ["posted-summary"],
    queryFn: async () => { const r = await fetch(`${API}api/posted-workers/summary`, { headers: authHeaders() }); if (!r.ok) return {}; return r.json(); },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["posted-notifications"],
    queryFn: async () => { const r = await fetch(`${API}api/posted-workers/notifications`, { headers: authHeaders() }); if (!r.ok) return { notifications: [] }; return r.json() as Promise<{ notifications: Notif[] }>; },
  });

  const notifications = data?.notifications ?? [];
  const s = summary ?? {};

  return (
    <div className="p-4 min-h-full overflow-y-auto pb-24 bg-[#0c0c0e]">
      <div className="flex items-center gap-2 mb-3"><Globe className="w-5 h-5 text-[#C41E18]" /><h2 className="text-lg font-bold text-white">Posted Workers</h2></div>

      <div className="flex gap-2 mb-4">
        <div className="flex-1 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-center"><p className="text-lg font-black text-amber-400">{s.drafts ?? 0}</p><p className="text-[9px] text-amber-400/60 uppercase font-bold">Drafts</p></div>
        <div className="flex-1 px-3 py-2 bg-blue-500/10 border border-blue-500/20 rounded-xl text-center"><p className="text-lg font-black text-blue-400">{s.submitted ?? 0}</p><p className="text-[9px] text-blue-400/60 uppercase font-bold">Submitted</p></div>
        <div className={cn("flex-1 px-3 py-2 rounded-xl text-center", (s.expiring ?? 0) > 0 ? "bg-red-500/10 border border-red-500/20" : "bg-emerald-500/10 border border-emerald-500/20")}><p className={cn("text-lg font-black", (s.expiring ?? 0) > 0 ? "text-red-400" : "text-emerald-400")}>{s.expiring ?? 0}</p><p className="text-[9px] text-white/40 uppercase font-bold">Expiring</p></div>
      </div>

      {isLoading ? <div className="flex justify-center py-16"><div className="animate-spin w-6 h-6 border-2 border-[#C41E18] border-t-transparent rounded-full" /></div> : notifications.length === 0 ? (
        <div className="text-center py-16 text-white/30"><Globe className="w-10 h-10 mx-auto mb-2 opacity-30" /><p className="text-sm font-semibold">No notifications</p></div>
      ) : (
        <div className="space-y-2">
          {notifications.map(n => {
            const days = n.end_date ? Math.ceil((new Date(n.end_date).getTime() - Date.now()) / 86_400_000) : null;
            return (
              <div key={n.id} className={cn("rounded-2xl border p-3.5", n.status === "draft" ? "bg-amber-500/5 border-amber-500/15" : n.status === "submitted" ? "bg-blue-500/5 border-blue-500/15" : "bg-white/[0.03] border-white/[0.06]")}>
                <div className="flex items-center gap-2 mb-1">
                  <span>{FLAGS[n.host_country] || "🌍"}</span>
                  <p className="text-xs font-bold text-white truncate">{n.worker_name}</p>
                  <span className={cn("text-[9px] font-bold uppercase ml-auto", n.status === "draft" ? "text-amber-400" : n.status === "submitted" ? "text-blue-400" : "text-emerald-400")}>{n.status}</span>
                </div>
                <p className="text-[10px] text-white/40">{n.notification_system}</p>
                {days !== null && days <= 30 && <p className="text-[9px] text-red-400 font-bold mt-0.5 flex items-center gap-1"><AlertTriangle className="w-2.5 h-2.5" />Expires in {days}d</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
