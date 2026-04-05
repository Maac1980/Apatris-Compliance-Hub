import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Fingerprint, Plus, ExternalLink, X, Award } from "lucide-react";
import { authHeaders, BASE } from "@/lib/api";


interface Identity { id: string; worker_id: string; full_name: string; specialization: string; identity_hash: string; trust_score: number; trust_level: string; compliance_status: string; qr_code: string; issued_at: string; certifications: any; }

const TIER_COLORS: Record<string, string> = { platinum: "text-slate-200", gold: "text-[#B8860B]", silver: "text-slate-400", bronze: "text-amber-700" };

export default function WorkerIdentity() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["identities"],
    queryFn: async () => { const r = await fetch(`${import.meta.env.BASE_URL}api/identity/all`, { headers: authHeaders() }); if (!r.ok) throw new Error("Failed"); return r.json() as Promise<{ identities: Identity[] }>; },
  });

  const { data: workersData } = useQuery({
    queryKey: ["workers-list"],
    queryFn: async () => { const r = await fetch(`${import.meta.env.BASE_URL}api/workers`, { headers: authHeaders() }); if (!r.ok) return { workers: [] }; return r.json(); },
  });

  const issueMutation = useMutation({
    mutationFn: async (workerId: string) => { const r = await fetch(`${import.meta.env.BASE_URL}api/identity/issue/${workerId}`, { method: "POST", headers: authHeaders() }); if (!r.ok) throw new Error("Failed"); return r.json(); },
    onSuccess: (d) => { toast({ description: `Identity issued. Verify: ${d.verifyUrl}` }); queryClient.invalidateQueries({ queryKey: ["identities"] }); },
  });

  const revokeMutation = useMutation({
    mutationFn: async (workerId: string) => { const r = await fetch(`${import.meta.env.BASE_URL}api/identity/revoke/${workerId}`, { method: "POST", headers: authHeaders() }); if (!r.ok) throw new Error("Failed"); return r.json(); },
    onSuccess: () => { toast({ description: "Identity revoked" }); queryClient.invalidateQueries({ queryKey: ["identities"] }); },
  });

  const identities = data?.identities ?? [];

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2"><Fingerprint className="w-7 h-7 text-[#C41E18]" /><h1 className="text-3xl font-bold text-white">Portable Worker Identity</h1></div>
        <p className="text-gray-400">Verified credentials — any EU employer scans QR to verify instantly</p>
      </div>

      {/* Issue identity */}
      <div className="flex gap-3 mb-6">
        <select id="issueWorker" className="flex-1 max-w-sm px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#C41E18]">
          <option value="">Select worker to issue identity</option>
          {(workersData?.workers ?? []).map((w: any) => <option key={w.id} value={w.id}>{w.fullName || w.full_name || w.name}</option>)}
        </select>
        <button onClick={() => { const el = document.getElementById("issueWorker") as HTMLSelectElement; if (el.value) issueMutation.mutate(el.value); }}
          disabled={issueMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-[#C41E18] text-white rounded-lg text-sm font-bold hover:bg-[#a51914] disabled:opacity-50">
          <Plus className="w-4 h-4" />Issue Identity
        </button>
      </div>

      {isLoading ? <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-[#C41E18] border-t-transparent rounded-full" /></div> : identities.length === 0 ? (
        <div className="text-center py-20 text-slate-500"><Fingerprint className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="text-lg font-semibold">No identities issued</p></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {identities.map(id => {
            const _certs = typeof id.certifications === "string" ? (() => { try { return JSON.parse(id.certifications); } catch { return []; } })() : id.certifications;
            const certs = Array.isArray(_certs) ? _certs : [];
            return (
              <div key={id.id} className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
                <div className="bg-[#C41E18] px-4 py-3 flex items-center justify-between">
                  <div><p className="text-xs text-white/70 uppercase tracking-widest">Verified Worker</p><p className="text-sm font-bold text-white">{id.full_name}</p></div>
                  <Fingerprint className="w-6 h-6 text-white/50" />
                </div>
                <div className="p-4">
                  <p className="text-xs text-slate-400 mb-2">{id.specialization}</p>
                  <div className="flex gap-2 mb-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${TIER_COLORS[id.trust_level] || "text-slate-400"} bg-white/5`}>{(id.trust_level || "").toUpperCase()} · {id.trust_score}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${id.compliance_status === "compliant" ? "text-emerald-400 bg-emerald-500/10" : "text-red-400 bg-red-500/10"}`}>{id.compliance_status === "compliant" ? "COMPLIANT" : "NON-COMPLIANT"}</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mb-1">{certs.length} certifications verified</p>
                  <p className="text-[9px] text-slate-600 font-mono mb-3">Hash: {id.identity_hash}</p>
                  <div className="flex gap-2">
                    <a href={id.qr_code} target="_blank" rel="noopener"
                      className="flex items-center gap-1 px-2 py-1 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded text-[10px] font-bold hover:bg-blue-600/30">
                      <ExternalLink className="w-3 h-3" />Verify
                    </a>
                    <button onClick={() => revokeMutation.mutate(id.worker_id)}
                      className="flex items-center gap-1 px-2 py-1 bg-red-600/20 text-red-400 border border-red-500/30 rounded text-[10px] font-bold hover:bg-red-600/30">
                      <X className="w-3 h-3" />Revoke
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
