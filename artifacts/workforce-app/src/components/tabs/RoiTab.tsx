import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, Shield, Clock, Users } from "lucide-react";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

const API = import.meta.env.VITE_API_URL ?? "";

export function RoiTab() {
  const [companyId, setCompanyId] = useState("");

  const { data: companiesData } = useQuery({
    queryKey: ["crm-companies"],
    queryFn: async () => {
      const res = await fetch(`${API}api/crm/companies`, { headers: authHeaders() });
      if (!res.ok) return { companies: [] };
      return res.json();
    },
  });

  const { data: roiData, isLoading } = useQuery({
    queryKey: ["roi", companyId],
    queryFn: async () => {
      const res = await fetch(`${API}api/roi/${companyId}`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!companyId,
  });

  const roi = roiData?.roi;
  const fmtEur = (n: number) => n.toLocaleString("en", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

  return (
    <div className="p-4 min-h-full overflow-y-auto pb-24 bg-[#0c0c0e]">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="w-5 h-5 text-[#B8860B]" />
        <h2 className="text-lg font-bold text-white">ROI</h2>
      </div>

      <select value={companyId} onChange={e => setCompanyId(e.target.value)}
        className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.06] rounded-xl text-sm text-white mb-4 focus:outline-none focus:ring-1 focus:ring-[#B8860B]">
        <option value="">Select Client</option>
        {(companiesData?.companies ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
      </select>

      {!companyId ? (
        <div className="text-center py-16 text-white/30"><TrendingUp className="w-10 h-10 mx-auto mb-2 opacity-30" /><p className="text-sm font-semibold">Select a client</p></div>
      ) : isLoading ? (
        <div className="flex justify-center py-16"><div className="animate-spin w-6 h-6 border-2 border-[#B8860B] border-t-transparent rounded-full" /></div>
      ) : roi && (
        <>
          <div className="bg-[#B8860B]/15 border border-[#B8860B]/25 rounded-2xl p-5 text-center mb-4">
            <p className="text-[9px] text-[#B8860B] font-bold uppercase tracking-[0.2em] mb-1">Total Value Delivered</p>
            <p className="text-3xl font-black text-[#B8860B]">{fmtEur(roi.totalValueDelivered)}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-[#B8860B]/10 border border-[#B8860B]/20 rounded-xl p-3">
              <Shield className="w-4 h-4 text-[#B8860B] mb-1" />
              <p className="text-lg font-black text-[#B8860B]">{fmtEur(roi.finesPrevented.total)}</p>
              <p className="text-[9px] text-white/40 uppercase">Fines Prevented</p>
            </div>
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
              <Clock className="w-4 h-4 text-blue-400 mb-1" />
              <p className="text-lg font-black text-blue-400">{roi.hoursSaved.hours}h</p>
              <p className="text-[9px] text-white/40 uppercase">Hours Saved</p>
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
              <Users className="w-4 h-4 text-emerald-400 mb-1" />
              <p className="text-lg font-black text-emerald-400">{roi.totalWorkers}</p>
              <p className="text-[9px] text-white/40 uppercase">Workers</p>
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
              <p className="text-lg font-black text-emerald-400">{roi.nonComplianceIncidents}</p>
              <p className="text-[9px] text-white/40 uppercase">Incidents</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
