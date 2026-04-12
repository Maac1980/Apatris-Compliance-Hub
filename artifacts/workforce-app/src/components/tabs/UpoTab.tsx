/**
 * UpoTab — UPO Filing Confirmation view for mobile.
 * Shows which workers have UPO (digital filing receipt) and Art. 108 protection status.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Shield, CheckCircle2, XOctagon, Loader2, Search, Clock } from "lucide-react";

const API = import.meta.env.VITE_API_URL ?? "";
function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

export function UpoTab() {
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["mobile-upo-workers"],
    queryFn: async () => {
      const r = await fetch(`${API}/workers`, { headers: authHeaders() });
      if (!r.ok) return [];
      const j = await r.json();
      return (j.workers ?? j ?? []).map((w: any) => ({
        id: w.id,
        name: w.name ?? w.full_name,
        upoDate: w.upoDate ?? w.upo_date,
        mosStatus: w.mosStatus ?? w.mos_status,
        trcExpiry: w.trcExpiry ?? w.trc_expiry,
        site: w.assignedSite ?? w.assigned_site ?? "Unassigned",
      }));
    },
  });

  const workers = (data ?? []) as any[];

  const withUpo = workers.filter(w => w.upoDate);
  const withoutUpo = workers.filter(w => !w.upoDate);

  const filtered = search.trim()
    ? workers.filter(w => w.name?.toLowerCase().includes(search.toLowerCase()))
    : null;

  const displayList = filtered ?? [...withUpo, ...withoutUpo];

  return (
    <div className="p-4 min-h-full overflow-y-auto pb-20 bg-[#0c0c0e]">
      <div className="flex items-center gap-2 mb-4">
        <FileText className="w-5 h-5 text-[#C41E18]" />
        <h2 className="text-lg font-bold text-white">UPO Certificates</h2>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-center">
          <p className="text-2xl font-black text-emerald-400">{withUpo.length}</p>
          <p className="text-[9px] text-emerald-400/70 uppercase font-bold">Filed</p>
        </div>
        <div className="bg-slate-500/10 border border-slate-500/20 rounded-xl p-3 text-center">
          <p className="text-2xl font-black text-slate-400">{withoutUpo.length}</p>
          <p className="text-[9px] text-slate-400/70 uppercase font-bold">Not Filed</p>
        </div>
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 text-center">
          <p className="text-2xl font-black text-blue-400">
            {workers.filter(w => w.mosStatus === "correct_submission").length}
          </p>
          <p className="text-[9px] text-blue-400/70 uppercase font-bold">MOS OK</p>
        </div>
      </div>

      {/* Info banner */}
      <div className="bg-blue-500/5 border border-blue-500/15 rounded-xl p-3 mb-4 flex items-start gap-2">
        <Shield className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-[11px] text-blue-300 font-bold">April 2026 Digital Mandate</p>
          <p className="text-[10px] text-blue-300/70">UPO (Urzedowe Poswiadczenie Odbioru) is the digital filing receipt from MOS 2.0. It replaces the physical stamp as proof of legal stay under Art. 108.</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search workers..."
          className="w-full pl-9 pr-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-xs text-white placeholder:text-slate-600 focus:outline-none" />
      </div>

      {/* Worker list */}
      {isLoading ? (
        <div className="text-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-500 mx-auto" /></div>
      ) : (
        <div className="space-y-1.5">
          {displayList.map((w: any) => {
            const hasUpo = !!w.upoDate;
            const mosOk = w.mosStatus === "correct_submission";
            return (
              <div key={w.id} className={`${hasUpo ? "bg-emerald-500/5 border-emerald-500/15" : "bg-slate-800/30 border-slate-700/30"} border rounded-xl px-3 py-2.5 flex items-center gap-2.5`}>
                {hasUpo ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                ) : (
                  <XOctagon className="w-4 h-4 text-slate-500 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-bold text-white truncate">{w.name}</p>
                    {hasUpo && (
                      <span className="text-[8px] px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold">UPO</span>
                    )}
                    {mosOk && (
                      <span className="text-[8px] px-1 py-0.5 rounded bg-blue-500/20 text-blue-400 font-bold">MOS</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {hasUpo ? (
                      <span className="text-[10px] text-emerald-400/80 flex items-center gap-0.5">
                        <Clock className="w-2.5 h-2.5" /> Filed {new Date(w.upoDate).toLocaleDateString("en-GB")}
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-500">Not filed</span>
                    )}
                    <span className="text-[9px] text-slate-600">{w.site}</span>
                  </div>
                </div>
                {w.trcExpiry && (
                  <div className="text-right flex-shrink-0">
                    <p className="text-[9px] text-slate-500">TRC</p>
                    <p className="text-[10px] text-slate-400 font-mono">{new Date(w.trcExpiry).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
