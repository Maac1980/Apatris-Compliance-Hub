import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { UserMinus, Plus, Search, AlertTriangle, Clock, MapPin, Award } from "lucide-react";
import { authHeaders, BASE } from "@/lib/api";


interface BenchEntry {
  id: string; worker_id: string; worker_name: string; specialization: string | null;
  available_from: string; available_until: string | null; last_site: string | null;
  last_role: string | null; skills_summary: string | null; status: string; days_on_bench: string;
}
interface Summary { available: number; partiallyAvailable: number; total: number; avgDays: number; maxDays: number; over7Days: number; }

export default function BenchManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["bench"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/bench`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ entries: BenchEntry[] }>;
    },
  });

  const { data: summaryData } = useQuery({
    queryKey: ["bench-summary"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/bench/summary`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<Summary>;
    },
  });

  const addMutation = useMutation({
    mutationFn: async (body: Record<string, string>) => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/bench`, { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Failed"); }
      return res.json();
    },
    onSuccess: () => { toast({ description: "Added to bench" }); queryClient.invalidateQueries({ queryKey: ["bench", "bench-summary"] }); setShowAdd(false); setForm({}); },
    onError: (err) => { toast({ description: err instanceof Error ? err.message : "Failed", variant: "destructive" }); },
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/bench/${id}`, { method: "DELETE", headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => { toast({ description: "Removed from bench" }); queryClient.invalidateQueries({ queryKey: ["bench", "bench-summary"] }); },
  });

  const entries = data?.entries ?? [];
  const summary = summaryData ?? { available: 0, partiallyAvailable: 0, total: 0, avgDays: 0, maxDays: 0, over7Days: 0 };
  const filtered = search ? entries.filter(e => e.worker_name.toLowerCase().includes(search.toLowerCase())) : entries;

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <UserMinus className="w-7 h-7 text-[#C41E18]" />
          <h1 className="text-3xl font-bold text-white">Bench Management</h1>
        </div>
        <p className="text-gray-400">Track workers between contracts — assign quickly to new jobs</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
          <p className="text-xs text-gray-400 font-mono uppercase mb-1">Available</p>
          <p className="text-2xl font-bold text-blue-400">{summary.available}</p>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
          <p className="text-xs text-gray-400 font-mono uppercase mb-1">Avg Days</p>
          <p className="text-2xl font-bold text-amber-400">{summary.avgDays}d</p>
        </div>
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
          <p className="text-xs text-gray-400 font-mono uppercase mb-1">7+ Days</p>
          <p className="text-2xl font-bold text-red-400">{summary.over7Days}</p>
        </div>
        <div className="bg-slate-800 rounded-xl p-4">
          <p className="text-xs text-gray-400 font-mono uppercase mb-1">Longest</p>
          <p className="text-2xl font-bold text-white">{summary.maxDays}d</p>
        </div>
        <div className="bg-slate-800 rounded-xl p-4">
          <p className="text-xs text-gray-400 font-mono uppercase mb-1">Total</p>
          <p className="text-2xl font-bold text-white">{summary.total}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input type="text" placeholder="Search workers..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C41E18]" />
        </div>
        <button onClick={() => { setShowAdd(true); setForm({}); }}
          className="flex items-center gap-2 px-4 py-2 bg-[#C41E18] text-white rounded-lg text-sm font-bold hover:bg-[#a51914]">
          <Plus className="w-4 h-4" />Add to Bench
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-[#C41E18] border-t-transparent rounded-full" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-slate-500"><UserMinus className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="text-lg font-semibold">No workers on bench</p></div>
      ) : (
        <div className="space-y-2">
          {filtered.map(e => {
            const days = Number(e.days_on_bench);
            const isLong = days >= 7;
            return (
              <div key={e.id} className={`bg-slate-900 border rounded-xl p-4 ${isLong ? "border-red-500/30" : "border-slate-700"}`}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-white">{e.worker_name}</p>
                      {isLong && <AlertTriangle className="w-3.5 h-3.5 text-red-400" />}
                    </div>
                    <p className="text-xs text-slate-400">{e.specialization || e.last_role || "—"}</p>
                  </div>
                  <span className={`text-lg font-black font-mono ${isLong ? "text-red-400" : days >= 4 ? "text-amber-400" : "text-emerald-400"}`}>{days}d</span>
                </div>
                <div className="flex flex-wrap gap-2 text-[10px] mb-2">
                  {e.last_site && <span className="flex items-center gap-1 text-slate-500"><MapPin className="w-2.5 h-2.5" />{e.last_site}</span>}
                  {e.skills_summary && <span className="flex items-center gap-1 text-slate-500"><Award className="w-2.5 h-2.5" />{e.skills_summary}</span>}
                  <span className="flex items-center gap-1 text-slate-600"><Clock className="w-2.5 h-2.5" />Since {new Date(e.available_from).toLocaleDateString("en-GB")}</span>
                </div>
                <button onClick={() => removeMutation.mutate(e.id)} disabled={removeMutation.isPending}
                  className="px-3 py-1 bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 rounded text-[10px] font-bold hover:bg-emerald-600/30 disabled:opacity-50">
                  Assign & Remove
                </button>
              </div>
            );
          })}
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/50" onClick={() => setShowAdd(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-4">Add Worker to Bench</h3>
            <div className="space-y-3">
              {["workerId", "workerName", "lastSite", "lastRole", "skillsSummary"].map(f => (
                <input key={f} placeholder={f.replace(/([A-Z])/g, " $1").trim()} value={form[f] || ""} onChange={e => setForm({ ...form, [f]: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C41E18]" />
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowAdd(false)} className="flex-1 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg text-sm font-bold">Cancel</button>
              <button onClick={() => addMutation.mutate(form)} disabled={!form.workerId || !form.workerName}
                className="flex-1 px-4 py-2 bg-[#C41E18] text-white rounded-lg text-sm font-bold disabled:opacity-50">Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
