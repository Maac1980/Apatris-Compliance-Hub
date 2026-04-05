import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { authHeaders, BASE } from "@/lib/api";
import {
  Briefcase, X, Search, Plus, Building2, ChevronRight, Users, DollarSign, TrendingUp,
} from "lucide-react";


const STAGES = ["Lead", "Contacted", "Proposal Sent", "Negotiation", "Active", "Lost"];
const STAGE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  Lead:            { bg: "bg-slate-500/10",   text: "text-slate-400",   border: "border-slate-500/20" },
  Contacted:       { bg: "bg-blue-500/10",    text: "text-blue-400",    border: "border-blue-500/20" },
  "Proposal Sent": { bg: "bg-indigo-500/10",  text: "text-indigo-400",  border: "border-indigo-500/20" },
  Negotiation:     { bg: "bg-amber-500/10",   text: "text-amber-400",   border: "border-amber-500/20" },
  Active:          { bg: "bg-emerald-500/10",  text: "text-emerald-400", border: "border-emerald-500/20" },
  Lost:            { bg: "bg-red-500/10",     text: "text-red-400",     border: "border-red-500/20" },
};

interface Pipeline { stage: string; deal_count: number; total_value: number; total_workers: number; }
interface Company { id: string; company_name: string; nip: string | null; contact_name: string | null; contact_email: string | null; contact_phone: string | null; country: string; status: string; active_deals: string; }
interface Deal { id: string; company_id: string; company_name: string; deal_name: string; stage: string; value_eur: string; workers_needed: number; role_type: string | null; start_date: string | null; notes: string | null; created_at: string; }

export default function CrmPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"pipeline" | "companies">("pipeline");
  const [search, setSearch] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [selectedCompanyName, setSelectedCompanyName] = useState("");
  const [showAddCompany, setShowAddCompany] = useState(false);
  const [showAddDeal, setShowAddDeal] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const { data: pipelineData } = useQuery({
    queryKey: ["crm-pipeline"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/crm/deals/pipeline`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ pipeline: Pipeline[] }>;
    },
  });

  const { data: companiesData, isLoading: companiesLoading } = useQuery({
    queryKey: ["crm-companies"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/crm/companies`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ companies: Company[] }>;
    },
  });

  const { data: dealsData } = useQuery({
    queryKey: ["crm-deals"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/crm/deals`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ deals: Deal[] }>;
    },
  });

  const { data: companyDetail } = useQuery({
    queryKey: ["crm-company-detail", selectedCompanyId],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/crm/companies/${selectedCompanyId}`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ company: Company; deals: Deal[] }>;
    },
    enabled: !!selectedCompanyId,
  });

  const addCompanyMutation = useMutation({
    mutationFn: async (body: Record<string, string>) => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/crm/companies`, { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => { toast({ description: "Company added" }); queryClient.invalidateQueries({ queryKey: ["crm-companies"] }); setShowAddCompany(false); setForm({}); },
    onError: (err) => { toast({ description: err instanceof Error ? err.message : "Failed", variant: "destructive" }); },
  });

  const addDealMutation = useMutation({
    mutationFn: async (body: Record<string, any>) => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/crm/deals`, { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => { toast({ description: "Deal created" }); queryClient.invalidateQueries({ queryKey: ["crm-deals", "crm-pipeline"] }); setShowAddDeal(false); setForm({}); },
    onError: (err) => { toast({ description: err instanceof Error ? err.message : "Failed", variant: "destructive" }); },
  });

  const pipeline = pipelineData?.pipeline ?? [];
  const totalValue = pipeline.reduce((s, p) => s + p.total_value, 0);
  const totalDeals = pipeline.reduce((s, p) => s + p.deal_count, 0);

  const companies = companiesData?.companies ?? [];
  const filteredCompanies = useMemo(() => {
    if (!search) return companies;
    const q = search.toLowerCase();
    return companies.filter(c => c.company_name.toLowerCase().includes(q) || (c.nip || "").includes(q));
  }, [companies, search]);

  const dealsByStage = useMemo(() => {
    const map: Record<string, Deal[]> = {};
    for (const s of STAGES) map[s] = [];
    for (const d of (dealsData?.deals ?? [])) {
      if (map[d.stage]) map[d.stage].push(d);
    }
    return map;
  }, [dealsData]);

  function daysInStage(createdAt: string): number {
    return Math.max(0, Math.ceil((Date.now() - new Date(createdAt).getTime()) / 86_400_000));
  }

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Briefcase className="w-7 h-7 text-[#C41E18]" />
          <h1 className="text-3xl font-bold text-white">CRM</h1>
        </div>
        <p className="text-gray-400">Client companies and deal pipeline</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-slate-800 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">Total Deals</p><p className="text-2xl font-bold text-white">{totalDeals}</p></div>
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">Pipeline Value</p><p className="text-2xl font-bold text-emerald-400">{totalValue.toLocaleString("en", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}</p></div>
        <div className="bg-slate-800 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">Companies</p><p className="text-2xl font-bold text-white">{companies.length}</p></div>
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">Workers Needed</p><p className="text-2xl font-bold text-blue-400">{pipeline.reduce((s, p) => s + p.total_workers, 0)}</p></div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 mb-6 bg-slate-800/50 rounded-lg p-1 w-fit">
        <button onClick={() => setActiveTab("pipeline")} className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold transition-all ${activeTab === "pipeline" ? "bg-[#C41E18] text-white shadow" : "text-slate-400 hover:text-white"}`}>
          <TrendingUp className="w-4 h-4" />Pipeline
        </button>
        <button onClick={() => setActiveTab("companies")} className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold transition-all ${activeTab === "companies" ? "bg-[#C41E18] text-white shadow" : "text-slate-400 hover:text-white"}`}>
          <Building2 className="w-4 h-4" />Companies
        </button>
      </div>

      {activeTab === "pipeline" ? (
        <>
          <div className="flex justify-end mb-4">
            <button onClick={() => { setShowAddDeal(true); setForm({}); }} className="flex items-center gap-2 px-4 py-2 bg-[#C41E18] text-white rounded-lg text-sm font-bold hover:bg-[#a51914]">
              <Plus className="w-4 h-4" />New Deal
            </button>
          </div>
          {/* Pipeline columns */}
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {STAGES.map(stage => {
              const sc = STAGE_COLORS[stage];
              const deals = dealsByStage[stage] || [];
              const stageTotal = deals.reduce((s, d) => s + Number(d.value_eur), 0);
              return (
                <div key={stage} className={`rounded-xl border ${sc.border} ${sc.bg} p-3`}>
                  <div className="flex items-center justify-between mb-3">
                    <p className={`text-xs font-black uppercase tracking-wider ${sc.text}`}>{stage}</p>
                    <span className={`text-[10px] font-bold font-mono ${sc.text}`}>{deals.length}</span>
                  </div>
                  <p className="text-xs text-slate-500 font-mono mb-3">{stageTotal.toLocaleString("en", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}</p>
                  <div className="space-y-2">
                    {deals.map(d => (
                      <div key={d.id} className="bg-slate-900/60 border border-slate-700/50 rounded-lg p-3">
                        <p className="text-xs font-bold text-white truncate">{d.deal_name}</p>
                        <p className="text-[10px] text-slate-500 truncate">{d.company_name}</p>
                        <div className="flex items-center gap-3 mt-2 text-[10px]">
                          <span className="flex items-center gap-1 text-emerald-400 font-mono"><DollarSign className="w-2.5 h-2.5" />{Number(d.value_eur).toLocaleString()}</span>
                          {d.workers_needed > 0 && <span className="flex items-center gap-1 text-blue-400 font-mono"><Users className="w-2.5 h-2.5" />{d.workers_needed}</span>}
                          <span className="text-slate-600 font-mono ml-auto">{daysInStage(d.created_at)}d</span>
                        </div>
                        {d.role_type && <p className="text-[9px] text-slate-600 mt-1 font-mono">{d.role_type}</p>}
                      </div>
                    ))}
                    {deals.length === 0 && <p className="text-[10px] text-slate-600 text-center py-4">No deals</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input type="text" placeholder="Search companies..." value={search} onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C41E18]" />
            </div>
            <button onClick={() => { setShowAddCompany(true); setForm({}); }} className="flex items-center gap-2 px-4 py-2 bg-[#C41E18] text-white rounded-lg text-sm font-bold hover:bg-[#a51914]">
              <Plus className="w-4 h-4" />Add Company
            </button>
          </div>

          {companiesLoading ? (
            <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-[#C41E18] border-t-transparent rounded-full" /></div>
          ) : (
            <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700 bg-slate-800/50">
                    <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase">Company</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase">NIP</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase">Contact</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase">Country</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase">Deals</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCompanies.map(c => (
                    <tr key={c.id} onClick={() => { setSelectedCompanyId(c.id); setSelectedCompanyName(c.company_name); }}
                      className="border-b border-slate-800 hover:bg-slate-800/60 cursor-pointer transition-colors">
                      <td className="px-4 py-3 font-medium text-white">{c.company_name}</td>
                      <td className="px-4 py-3 text-slate-400 font-mono text-xs">{c.nip || "—"}</td>
                      <td className="px-4 py-3 text-xs"><p className="text-slate-300">{c.contact_name || "—"}</p><p className="text-slate-500">{c.contact_email || ""}</p></td>
                      <td className="px-4 py-3 text-slate-400">{c.country}</td>
                      <td className="px-4 py-3"><span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded text-xs font-bold font-mono">{c.active_deals}</span></td>
                      <td className="px-4 py-3"><ChevronRight className="w-4 h-4 text-slate-600" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Add Company Dialog */}
      {showAddCompany && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/50" onClick={() => setShowAddCompany(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-4">Add Company</h3>
            <div className="space-y-3">
              {["companyName", "nip", "contactName", "contactEmail", "contactPhone"].map(f => (
                <input key={f} placeholder={f.replace(/([A-Z])/g, " $1").trim()} value={form[f] || ""} onChange={e => setForm({ ...form, [f]: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C41E18]" />
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowAddCompany(false)} className="flex-1 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg text-sm font-bold">Cancel</button>
              <button onClick={() => addCompanyMutation.mutate(form)} disabled={!form.companyName} className="flex-1 px-4 py-2 bg-[#C41E18] text-white rounded-lg text-sm font-bold disabled:opacity-50">Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Deal Dialog */}
      {showAddDeal && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/50" onClick={() => setShowAddDeal(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-4">New Deal</h3>
            <div className="space-y-3">
              <select value={form.companyId || ""} onChange={e => setForm({ ...form, companyId: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#C41E18]">
                <option value="">Select Company</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
              </select>
              <input placeholder="Deal Name" value={form.dealName || ""} onChange={e => setForm({ ...form, dealName: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C41E18]" />
              <select value={form.stage || "Lead"} onChange={e => setForm({ ...form, stage: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#C41E18]">
                {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-3">
                <input type="number" placeholder="Value (EUR)" value={form.valueEur || ""} onChange={e => setForm({ ...form, valueEur: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C41E18]" />
                <input type="number" placeholder="Workers Needed" value={form.workersNeeded || ""} onChange={e => setForm({ ...form, workersNeeded: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C41E18]" />
              </div>
              <input placeholder="Role Type (e.g. TIG Welder)" value={form.roleType || ""} onChange={e => setForm({ ...form, roleType: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C41E18]" />
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowAddDeal(false)} className="flex-1 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg text-sm font-bold">Cancel</button>
              <button onClick={() => addDealMutation.mutate(form)} disabled={!form.companyId || !form.dealName} className="flex-1 px-4 py-2 bg-[#C41E18] text-white rounded-lg text-sm font-bold disabled:opacity-50">Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Company Side Panel */}
      {selectedCompanyId && (
        <div className="fixed inset-0 z-[250] flex justify-end" onClick={() => setSelectedCompanyId(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative w-full max-w-lg bg-slate-900 border-l border-slate-700 h-full overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-slate-900 border-b border-slate-700 px-6 py-4 flex items-center justify-between z-10">
              <div>
                <h2 className="text-lg font-bold text-white">{selectedCompanyName}</h2>
                <p className="text-xs text-slate-400">Company Details & Deals</p>
              </div>
              <button onClick={() => setSelectedCompanyId(null)} className="p-2 hover:bg-slate-800 rounded-lg"><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="p-6">
              {companyDetail?.company && (
                <div className="grid grid-cols-2 gap-3 text-xs mb-6">
                  <div><p className="text-slate-500">NIP</p><p className="text-white font-mono">{(companyDetail.company as any).nip || "—"}</p></div>
                  <div><p className="text-slate-500">Country</p><p className="text-white">{(companyDetail.company as any).country}</p></div>
                  <div><p className="text-slate-500">Contact</p><p className="text-white">{(companyDetail.company as any).contact_name || "—"}</p></div>
                  <div><p className="text-slate-500">Email</p><p className="text-white">{(companyDetail.company as any).contact_email || "—"}</p></div>
                  <div><p className="text-slate-500">Phone</p><p className="text-white">{(companyDetail.company as any).contact_phone || "—"}</p></div>
                  <div><p className="text-slate-500">Status</p><p className="text-white capitalize">{(companyDetail.company as any).status}</p></div>
                </div>
              )}
              <h3 className="text-sm font-bold text-white mb-3">Deals</h3>
              {!companyDetail?.deals?.length ? (
                <p className="text-slate-500 text-sm">No deals</p>
              ) : (
                <div className="space-y-2">
                  {companyDetail.deals.map((d: any) => {
                    const sc = STAGE_COLORS[d.stage] || STAGE_COLORS.Lead;
                    return (
                      <div key={d.id} className="bg-slate-800 border border-slate-700 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-sm font-bold text-white">{d.deal_name}</p>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${sc.bg} ${sc.text}`}>{d.stage}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div><p className="text-slate-500">Value</p><p className="text-emerald-400 font-mono font-bold">{Number(d.value_eur).toLocaleString("en", { style: "currency", currency: "EUR" })}</p></div>
                          <div><p className="text-slate-500">Workers</p><p className="text-blue-400 font-mono font-bold">{d.workers_needed}</p></div>
                          <div><p className="text-slate-500">Days</p><p className="text-slate-300 font-mono">{daysInStage(d.created_at)}d</p></div>
                        </div>
                        {d.role_type && <p className="text-[10px] text-slate-600 mt-2 font-mono">{d.role_type}</p>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
