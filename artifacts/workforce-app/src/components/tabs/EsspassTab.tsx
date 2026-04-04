import { useQuery } from "@tanstack/react-query";
import { Fingerprint, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

const API = import.meta.env.VITE_API_URL ?? "";

export function EsspassTab() {
  const { data: summary } = useQuery({ queryKey: ["esspass-summary"], queryFn: async () => { const r = await fetch(`${API}api/esspass/summary`, { headers: authHeaders() }); if (!r.ok) return {}; return r.json(); } });
  const { data, isLoading } = useQuery({ queryKey: ["esspass-records"], queryFn: async () => { const r = await fetch(`${API}api/esspass/records`, { headers: authHeaders() }); if (!r.ok) return { records: [] }; return r.json(); } });

  const records = data?.records ?? [];
  const s = summary ?? {};

  return (
    <div className="p-4 min-h-full overflow-y-auto pb-24 bg-[#0c0c0e]">
      <div className="flex items-center gap-2 mb-3"><Fingerprint className="w-5 h-5 text-[#C41E18]" /><h2 className="text-lg font-bold text-white">ESSPASS</h2></div>

      <div className="flex gap-2 mb-4">
        <div className="flex-1 px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-center"><p className="text-lg font-black text-emerald-400">{s.verified ?? 0}</p><p className="text-[9px] text-emerald-400/60 uppercase font-bold">Verified</p></div>
        <div className="flex-1 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-center"><p className="text-lg font-black text-amber-400">{s.pending ?? 0}</p><p className="text-[9px] text-amber-400/60 uppercase font-bold">Pending</p></div>
        <div className="flex-1 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-xl text-center"><p className="text-lg font-black text-red-400">{s.expired ?? 0}</p><p className="text-[9px] text-red-400/60 uppercase font-bold">Expired</p></div>
      </div>

      {isLoading ? <div className="flex justify-center py-16"><div className="animate-spin w-6 h-6 border-2 border-[#C41E18] border-t-transparent rounded-full" /></div> : records.length === 0 ? (
        <div className="text-center py-16 text-white/30"><Fingerprint className="w-10 h-10 mx-auto mb-2 opacity-30" /><p className="text-sm font-semibold">No ESSPASS records</p></div>
      ) : (
        <div className="space-y-2">
          {records.map((r: any) => {
            const days = r.valid_until ? Math.ceil((new Date(r.valid_until).getTime() - Date.now()) / 86_400_000) : null;
            return (
              <div key={r.id} className={cn("rounded-2xl border p-3.5",
                r.verification_status === "verified" ? "bg-emerald-500/5 border-emerald-500/15" :
                r.verification_status === "expired" ? "bg-red-500/5 border-red-500/15" :
                "bg-amber-500/5 border-amber-500/15"
              )}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-bold text-white truncate">{r.worker_name_live || r.worker_name}</p>
                  {r.verification_status === "verified" ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> :
                   r.verification_status === "expired" ? <AlertTriangle className="w-3.5 h-3.5 text-red-400" /> :
                   <Clock className="w-3.5 h-3.5 text-amber-400" />}
                </div>
                <p className="text-[10px] text-white/40">SS: {r.social_security_country}{r.esspass_id ? ` · ${r.esspass_id}` : ""}</p>
                {days !== null && days <= 60 && <p className="text-[9px] text-amber-400 font-bold mt-0.5">{days}d remaining</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
