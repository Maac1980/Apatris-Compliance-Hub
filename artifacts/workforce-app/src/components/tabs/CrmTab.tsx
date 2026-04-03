import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Briefcase, Building2, ChevronRight, X, DollarSign, Users, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

const API = import.meta.env.VITE_API_URL ?? "";

const STAGE_COLORS: Record<string, string> = {
  Lead: "text-slate-400 bg-slate-500/10",
  Contacted: "text-blue-400 bg-blue-500/10",
  "Proposal Sent": "text-indigo-400 bg-indigo-500/10",
  Negotiation: "text-amber-400 bg-amber-500/10",
  Active: "text-emerald-400 bg-emerald-500/10",
  Lost: "text-red-400 bg-red-500/10",
};

interface Company { id: string; company_name: string; nip: string | null; contact_name: string | null; country: string; active_deals: string; }
interface Deal { id: string; deal_name: string; company_name: string; stage: string; value_eur: string; workers_needed: number; role_type: string | null; created_at: string; }
interface Pipeline { stage: string; deal_count: number; total_value: number; }

export function CrmTab() {
  const { role } = useAuth();
  const [view, setView] = useState<"pipeline" | "companies">("pipeline");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState("");

  const { data: pipelineData } = useQuery({
    queryKey: ["crm-pipeline"],
    queryFn: async () => {
      const res = await fetch(`${API}api/crm/deals/pipeline`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ pipeline: Pipeline[] }>;
    },
  });

  const { data: companiesData } = useQuery({
    queryKey: ["crm-companies"],
    queryFn: async () => {
      const res = await fetch(`${API}api/crm/companies`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ companies: Company[] }>;
    },
  });

  const { data: companyDetail } = useQuery({
    queryKey: ["crm-company-detail", selectedId],
    queryFn: async () => {
      const res = await fetch(`${API}api/crm/companies/${selectedId}`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ company: any; deals: Deal[] }>;
    },
    enabled: !!selectedId,
  });

  const pipeline = pipelineData?.pipeline ?? [];
  const totalValue = pipeline.reduce((s, p) => s + p.total_value, 0);

  return (
    <div className="p-4 min-h-full overflow-y-auto pb-24 bg-[#0c0c0e]">
      <div className="flex items-center gap-2 mb-3">
        <Briefcase className="w-5 h-5 text-[#C41E18]" />
        <h2 className="text-lg font-bold text-white">CRM</h2>
      </div>

      {/* Pipeline value pill */}
      <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
        <TrendingUp className="w-4 h-4 text-emerald-400" />
        <p className="text-sm font-black text-emerald-400 font-mono">
          {totalValue.toLocaleString("en", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}
        </p>
        <p className="text-[10px] text-emerald-400/60 ml-auto">Pipeline Value</p>
      </div>

      {/* View switcher */}
      <div className="flex gap-1 mb-4 bg-white/[0.03] rounded-xl p-1">
        <button onClick={() => setView("pipeline")}
          className={cn("flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all",
            view === "pipeline" ? "bg-[#C41E18] text-white" : "text-white/40"
          )}><TrendingUp className="w-3 h-3" />Pipeline</button>
        <button onClick={() => setView("companies")}
          className={cn("flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all",
            view === "companies" ? "bg-[#C41E18] text-white" : "text-white/40"
          )}><Building2 className="w-3 h-3" />Companies</button>
      </div>

      {view === "pipeline" ? (
        <div className="space-y-2">
          {pipeline.map(p => {
            const sc = STAGE_COLORS[p.stage] || STAGE_COLORS.Lead;
            return (
              <div key={p.stage} className={cn("rounded-2xl border border-white/[0.06] p-3.5", p.deal_count > 0 ? "bg-white/[0.03]" : "bg-white/[0.01] opacity-50")}>
                <div className="flex items-center justify-between mb-1">
                  <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold", sc)}>{p.stage}</span>
                  <span className="text-xs font-black text-white font-mono">{p.deal_count}</span>
                </div>
                <p className="text-sm font-bold text-emerald-400 font-mono">
                  {p.total_value.toLocaleString("en", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}
                </p>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {!companiesData?.companies?.length ? (
            <div className="text-center py-16 text-white/30">
              <Building2 className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm font-semibold">No companies</p>
            </div>
          ) : (
            companiesData.companies.map(c => (
              <button key={c.id}
                onClick={() => { setSelectedId(c.id); setSelectedName(c.company_name); }}
                className="w-full bg-white/[0.03] border border-white/[0.06] rounded-2xl p-3.5 flex items-center gap-3 active:scale-[0.98] transition-transform text-left"
              >
                <Building2 className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white truncate">{c.company_name}</p>
                  <p className="text-[10px] text-white/40 font-mono">{c.nip || "No NIP"} &middot; {c.country}</p>
                </div>
                <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded text-[10px] font-bold font-mono">{c.active_deals}</span>
                <ChevronRight className="w-4 h-4 text-white/20" />
              </button>
            ))
          )}
        </div>
      )}

      {/* Company detail panel */}
      {selectedId && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-[#0c0c0e]/95 backdrop-blur-sm" onClick={() => setSelectedId(null)}>
          <div className="flex-1 overflow-y-auto pt-4 px-4 pb-24" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-white">{selectedName}</h3>
                <p className="text-[11px] text-white/40">Company & Deals</p>
              </div>
              <button onClick={() => setSelectedId(null)} className="p-2 rounded-xl bg-white/5"><X className="w-5 h-5 text-white/50" /></button>
            </div>

            {companyDetail?.company && (
              <div className="grid grid-cols-2 gap-2 text-xs mb-4 bg-white/[0.03] border border-white/[0.06] rounded-2xl p-3">
                <div><p className="text-white/30">NIP</p><p className="text-white font-mono">{companyDetail.company.nip || "—"}</p></div>
                <div><p className="text-white/30">Contact</p><p className="text-white">{companyDetail.company.contact_name || "—"}</p></div>
                <div><p className="text-white/30">Email</p><p className="text-white">{companyDetail.company.contact_email || "—"}</p></div>
                <div><p className="text-white/30">Phone</p><p className="text-white">{companyDetail.company.contact_phone || "—"}</p></div>
              </div>
            )}

            <p className="text-xs font-bold text-white mb-2">Deals</p>
            {!companyDetail?.deals?.length ? (
              <p className="text-white/30 text-sm text-center py-8">No deals</p>
            ) : (
              <div className="space-y-2">
                {companyDetail.deals.map((d: any) => {
                  const sc = STAGE_COLORS[d.stage] || STAGE_COLORS.Lead;
                  return (
                    <div key={d.id} className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-bold text-white truncate">{d.deal_name}</p>
                        <span className={cn("px-2 py-0.5 rounded-full text-[9px] font-bold", sc)}>{d.stage}</span>
                      </div>
                      <div className="flex items-center gap-3 text-[10px]">
                        <span className="text-emerald-400 font-mono flex items-center gap-1"><DollarSign className="w-2.5 h-2.5" />{Number(d.value_eur).toLocaleString()}</span>
                        {d.workers_needed > 0 && <span className="text-blue-400 font-mono flex items-center gap-1"><Users className="w-2.5 h-2.5" />{d.workers_needed}</span>}
                        {d.role_type && <span className="text-white/30 font-mono">{d.role_type}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
