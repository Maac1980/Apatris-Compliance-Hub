import { useQuery } from "@tanstack/react-query";
import { Fingerprint, ExternalLink, Award } from "lucide-react";
import { cn } from "@/lib/utils";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

const API = import.meta.env.VITE_API_URL ?? "";
const TIER_COLORS: Record<string, string> = { platinum: "text-slate-200", gold: "text-[#B8860B]", silver: "text-slate-400", bronze: "text-amber-700" };

interface Identity { full_name: string; specialization: string; identity_hash: string; trust_score: number; trust_level: string; compliance_status: string; qr_code: string; certifications: any; issued_at: string; }

export function IdentityTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["identities"],
    queryFn: async () => { const r = await fetch(`${API}api/identity/all`, { headers: authHeaders() }); if (!r.ok) return { identities: [] }; return r.json() as Promise<{ identities: Identity[] }>; },
  });

  const identities = data?.identities ?? [];

  return (
    <div className="p-4 min-h-full overflow-y-auto pb-24 bg-[#0c0c0e]">
      <div className="flex items-center gap-2 mb-4"><Fingerprint className="w-5 h-5 text-[#C41E18]" /><h2 className="text-lg font-bold text-white">Identity</h2></div>

      {isLoading ? (
        <div className="flex justify-center py-16"><div className="animate-spin w-6 h-6 border-2 border-[#C41E18] border-t-transparent rounded-full" /></div>
      ) : identities.length === 0 ? (
        <div className="text-center py-16 text-white/30"><Fingerprint className="w-10 h-10 mx-auto mb-2 opacity-30" /><p className="text-sm font-semibold">No identity issued</p></div>
      ) : (
        <div className="space-y-3">
          {identities.map((id, i) => {
            const certs = typeof id.certifications === "string" ? JSON.parse(id.certifications) : (id.certifications || []);
            return (
              <div key={i} className="bg-white/[0.03] border border-white/[0.06] rounded-2xl overflow-hidden">
                <div className="bg-[#C41E18] px-3.5 py-2.5 flex items-center justify-between">
                  <div><p className="text-[9px] text-white/60 uppercase tracking-widest">Verified</p><p className="text-sm font-bold text-white">{id.full_name}</p></div>
                  <Fingerprint className="w-5 h-5 text-white/40" />
                </div>
                <div className="p-3.5">
                  <p className="text-[10px] text-white/40 mb-2">{id.specialization}</p>
                  <div className="flex gap-2 mb-2">
                    <span className={cn("px-2 py-0.5 rounded-full text-[9px] font-bold bg-white/5", TIER_COLORS[id.trust_level])}>{id.trust_level.toUpperCase()} · {id.trust_score}</span>
                    <span className={cn("px-2 py-0.5 rounded-full text-[9px] font-bold", id.compliance_status === "compliant" ? "text-emerald-400 bg-emerald-500/10" : "text-red-400 bg-red-500/10")}>{id.compliance_status === "compliant" ? "✓" : "✗"}</span>
                  </div>
                  <p className="text-[9px] text-white/20 font-mono mb-2">{certs.length} certs · {id.identity_hash}</p>
                  <a href={id.qr_code} target="_blank" rel="noopener"
                    className="w-full flex items-center justify-center gap-1.5 py-2 bg-blue-500/15 text-blue-400 border border-blue-500/25 rounded-xl text-[10px] font-bold active:scale-[0.98]">
                    <ExternalLink className="w-3 h-3" />Share / Verify
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
