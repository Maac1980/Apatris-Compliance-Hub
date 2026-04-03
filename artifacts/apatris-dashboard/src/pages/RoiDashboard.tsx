import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { TrendingUp, Shield, Clock, Users, FileText, Download, Send, Stamp, AlertTriangle } from "lucide-react";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

export default function RoiDashboard() {
  const { toast } = useToast();
  const [selectedCompany, setSelectedCompany] = useState<string>("");

  const { data: companiesData } = useQuery({
    queryKey: ["crm-companies"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/crm/companies`, { headers: authHeaders() });
      if (!res.ok) return { companies: [] };
      return res.json();
    },
  });

  const { data: roiData, isLoading } = useQuery({
    queryKey: ["roi", selectedCompany],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/roi/${selectedCompany}`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!selectedCompany,
  });

  const roi = roiData?.roi;
  const companyName = roiData?.companyName || "";
  const fmtEur = (n: number) => n.toLocaleString("en", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

  const sendReport = async () => {
    window.open(`${import.meta.env.BASE_URL}api/roi/${selectedCompany}/report?send=true`, "_blank");
    toast({ description: "Report generated and sent to client" });
  };

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <TrendingUp className="w-7 h-7 text-[#B8860B]" />
          <h1 className="text-3xl font-bold text-white">ROI Dashboard</h1>
        </div>
        <p className="text-gray-400">Show clients the financial value Apatris delivers</p>
      </div>

      {/* Company picker */}
      <div className="flex items-center gap-3 mb-6">
        <select value={selectedCompany} onChange={e => setSelectedCompany(e.target.value)}
          className="flex-1 max-w-sm px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#B8860B]">
          <option value="">Select Client Company</option>
          {(companiesData?.companies ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
        </select>
        {selectedCompany && (
          <button onClick={sendReport}
            className="flex items-center gap-2 px-4 py-2 bg-[#B8860B] text-white rounded-lg text-sm font-bold hover:bg-[#996F00]">
            <Send className="w-4 h-4" />Send Report to Client
          </button>
        )}
      </div>

      {!selectedCompany ? (
        <div className="text-center py-20 text-slate-500">
          <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-semibold">Select a client to view ROI</p>
        </div>
      ) : isLoading ? (
        <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-[#B8860B] border-t-transparent rounded-full" /></div>
      ) : roi && (
        <>
          {/* Hero metric */}
          <div className="bg-gradient-to-r from-[#B8860B]/20 to-[#996F00]/10 border border-[#B8860B]/30 rounded-2xl p-8 mb-6 text-center">
            <p className="text-xs text-[#B8860B] font-bold uppercase tracking-[0.2em] mb-2">Total Value Delivered This Year</p>
            <p className="text-5xl font-black text-[#B8860B]">{fmtEur(roi.totalValueDelivered)}</p>
            <p className="text-sm text-slate-400 mt-2">{companyName}</p>
          </div>

          {/* Metrics grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <div className="bg-[#B8860B]/10 border border-[#B8860B]/20 rounded-xl p-5">
              <Shield className="w-5 h-5 text-[#B8860B] mb-2" />
              <p className="text-3xl font-black text-[#B8860B]">{fmtEur(roi.finesPrevented.total)}</p>
              <p className="text-xs text-slate-400 uppercase tracking-wider mt-1">Fines Prevented</p>
            </div>
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-5">
              <Clock className="w-5 h-5 text-blue-400 mb-2" />
              <p className="text-3xl font-black text-blue-400">{roi.hoursSaved.hours}h</p>
              <p className="text-xs text-slate-400 uppercase tracking-wider mt-1">Hours Saved ({fmtEur(roi.hoursSaved.value)})</p>
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-5">
              <Users className="w-5 h-5 text-emerald-400 mb-2" />
              <p className="text-3xl font-black text-emerald-400">{roi.totalWorkers}</p>
              <p className="text-xs text-slate-400 uppercase tracking-wider mt-1">Workers Deployed</p>
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-5">
              <AlertTriangle className="w-5 h-5 text-emerald-400 mb-2" />
              <p className="text-3xl font-black text-emerald-400">{roi.nonComplianceIncidents}</p>
              <p className="text-xs text-slate-400 uppercase tracking-wider mt-1">Non-Compliance Incidents</p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-slate-800 rounded-xl p-4">
              <p className="text-2xl font-black text-white">{roi.complianceAlerts}</p>
              <p className="text-xs text-slate-500 mt-1">Alerts Resolved</p>
            </div>
            <div className="bg-slate-800 rounded-xl p-4">
              <p className="text-2xl font-black text-white">{roi.activePermits}</p>
              <p className="text-xs text-slate-500 mt-1">Permits Tracked</p>
            </div>
            <div className="bg-slate-800 rounded-xl p-4">
              <p className="text-2xl font-black text-amber-400">{roi.deploymentSpeed.apatrisMinutes} min</p>
              <p className="text-xs text-slate-500 mt-1">Deploy Speed (vs {roi.deploymentSpeed.industryDays}d)</p>
            </div>
            <div className="bg-slate-800 rounded-xl p-4">
              <p className="text-2xl font-black text-white">{roi.docsProcessed}</p>
              <p className="text-xs text-slate-500 mt-1">Documents Processed</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
