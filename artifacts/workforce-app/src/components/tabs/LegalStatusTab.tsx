/**
 * LegalStatusTab — Mobile view of worker legal statuses for coordinators+
 * Shows compliance status, Art. 108 protection, permit expiries.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Shield, AlertTriangle, CheckCircle2, XOctagon, Loader2, Search } from "lucide-react";

const API = import.meta.env.VITE_API_URL ?? "";
function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

export function LegalStatusTab() {
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["mobile-legal-workers"],
    queryFn: async () => {
      const r = await fetch(`${API}/workers`, { headers: authHeaders() });
      if (!r.ok) return [];
      const j = await r.json();
      return (j.workers ?? j ?? []).map((w: any) => ({
        id: w.id,
        name: w.name ?? w.full_name,
        trcExpiry: w.trcExpiry ?? w.trc_expiry,
        workPermitExpiry: w.workPermitExpiry ?? w.work_permit_expiry,
        passportExpiry: w.passportExpiry ?? w.passport_expiry,
        mosStatus: w.mosStatus ?? w.mos_status,
        art108: !!(w.upoDate ?? w.upo_date),
        site: w.assignedSite ?? w.assigned_site ?? "Unassigned",
      }));
    },
  });

  const workers = (data ?? []) as any[];
  const now = Date.now();

  const classified = workers.map((w: any) => {
    const trc = w.trcExpiry ? new Date(w.trcExpiry).getTime() : null;
    const wp = w.workPermitExpiry ? new Date(w.workPermitExpiry).getTime() : null;
    const nearest = [trc, wp].filter(Boolean).sort()[0] as number | undefined;

    let status: "critical" | "warning" | "ok" = "ok";
    let statusMsg = "Clear";

    if (nearest && nearest < now) {
      status = "critical";
      statusMsg = `Expired ${Math.ceil((now - nearest) / 86_400_000)}d ago`;
    } else if (nearest && nearest < now + 60 * 86_400_000) {
      status = "warning";
      statusMsg = `Expires in ${Math.ceil((nearest - now) / 86_400_000)}d`;
    }

    return { ...w, status, statusMsg };
  }).sort((a, b) => {
    const order = { critical: 0, warning: 1, ok: 2 };
    return order[a.status] - order[b.status];
  });

  const filtered = search.trim()
    ? classified.filter(w => w.name?.toLowerCase().includes(search.toLowerCase()))
    : classified;

  const criticalCount = classified.filter(w => w.status === "critical").length;
  const warningCount = classified.filter(w => w.status === "warning").length;
  const art108Count = classified.filter(w => w.art108).length;

  const statusConfig = {
    critical: { color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20", Icon: XOctagon },
    warning: { color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20", Icon: AlertTriangle },
    ok: { color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20", Icon: CheckCircle2 },
  };

  return (
    <div className="p-4 min-h-full overflow-y-auto pb-20 bg-[#0c0c0e]">
      <div className="flex items-center gap-2 mb-4">
        <Shield className="w-5 h-5 text-[#C41E18]" />
        <h2 className="text-lg font-bold text-white">Legal Status</h2>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-center">
          <p className="text-2xl font-black text-red-400">{criticalCount}</p>
          <p className="text-[9px] text-red-400/70 uppercase font-bold">Critical</p>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-center">
          <p className="text-2xl font-black text-amber-400">{warningCount}</p>
          <p className="text-[9px] text-amber-400/70 uppercase font-bold">Warning</p>
        </div>
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 text-center">
          <p className="text-2xl font-black text-blue-400">{art108Count}</p>
          <p className="text-[9px] text-blue-400/70 uppercase font-bold">Art. 108</p>
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
          {filtered.map((w: any) => {
            const cfg = statusConfig[w.status as keyof typeof statusConfig];
            const StatusIcon = cfg.Icon;
            return (
              <div key={w.id} className={`${cfg.bg} border ${cfg.border} rounded-xl px-3 py-2.5 flex items-center gap-2.5`}>
                <StatusIcon className={`w-4 h-4 ${cfg.color} flex-shrink-0`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-bold text-white truncate">{w.name}</p>
                    {w.art108 && (
                      <span className="text-[8px] px-1 py-0.5 rounded bg-blue-500/20 text-blue-400 font-bold">Art.108</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-[10px] ${cfg.color}`}>{w.statusMsg}</span>
                    <span className="text-[9px] text-slate-500">{w.site}</span>
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
