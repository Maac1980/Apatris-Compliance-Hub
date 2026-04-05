import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { authHeaders, BASE } from "@/lib/api";
import {
  Users, Plus, Search, Brain, CheckCircle2, X, UserPlus, MapPin, Award, Shield,
} from "lucide-react";


interface JobRequest {
  id: string; company_name: string | null; role_type: string; skills_required: string | null;
  certifications_required: string | null; location: string | null; start_date: string | null;
  workers_needed: number; status: string; match_count: string; created_at: string;
}

interface Match {
  worker_id: string; worker_name: string; specialization: string | null; assigned_site: string | null;
  compliance_status: string; match_score: number; match_reasons: string[]; phone: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  open: "text-blue-400 bg-blue-500/10", matched: "text-amber-400 bg-amber-500/10",
  filled: "text-emerald-400 bg-emerald-500/10", cancelled: "text-red-400 bg-red-500/10",
};

function scoreColor(s: number): string {
  if (s >= 80) return "text-emerald-400";
  if (s >= 60) return "text-amber-400";
  return "text-red-400";
}

function scoreBg(s: number): string {
  if (s >= 80) return "bg-emerald-500";
  if (s >= 60) return "bg-amber-500";
  return "bg-red-500";
}

export default function WorkerMatching() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ["matching-requests"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/matching/requests`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ requests: JobRequest[] }>;
    },
  });

  const { data: companiesData } = useQuery({
    queryKey: ["crm-companies"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/crm/companies`, { headers: authHeaders() });
      if (!res.ok) return { companies: [] };
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (body: Record<string, any>) => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/matching/requests`, { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => { toast({ description: "Job request created" }); queryClient.invalidateQueries({ queryKey: ["matching-requests"] }); setShowCreate(false); setForm({}); },
    onError: (err) => { toast({ description: err instanceof Error ? err.message : "Failed", variant: "destructive" }); },
  });

  const matchMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/matching/requests/${jobId}/match`, { method: "POST", headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: (data, jobId) => {
      setMatches(data.matches);
      setSelectedJobId(jobId);
      queryClient.invalidateQueries({ queryKey: ["matching-requests"] });
      toast({ description: `${data.matches.length} matches found from ${data.total_eligible} eligible workers` });
    },
    onError: (err) => { toast({ description: err instanceof Error ? err.message : "Matching failed", variant: "destructive" }); },
  });

  const assignMutation = useMutation({
    mutationFn: async ({ jobId, workerId, workerName }: { jobId: string; workerId: string; workerName: string }) => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/matching/requests/${jobId}/assign`, {
        method: "PATCH", headers: authHeaders(), body: JSON.stringify({ workerId, workerName }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: (data) => {
      toast({ description: `${data.workerName} assigned and notified` });
      queryClient.invalidateQueries({ queryKey: ["matching-requests"] });
    },
    onError: (err) => { toast({ description: err instanceof Error ? err.message : "Failed", variant: "destructive" }); },
  });

  const requests = data?.requests ?? [];

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Users className="w-7 h-7 text-[#C41E18]" />
          <h1 className="text-3xl font-bold text-white">Worker Matching AI</h1>
        </div>
        <p className="text-gray-400">AI-powered worker-to-job matching with scored recommendations</p>
      </div>

      <div className="flex justify-end mb-4">
        <button onClick={() => { setShowCreate(true); setForm({}); }}
          className="flex items-center gap-2 px-4 py-2 bg-[#C41E18] text-white rounded-lg text-sm font-bold hover:bg-[#a51914]">
          <Plus className="w-4 h-4" />New Job Request
        </button>
      </div>

      {/* Job requests list */}
      {isLoading ? (
        <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-[#C41E18] border-t-transparent rounded-full" /></div>
      ) : requests.length === 0 ? (
        <div className="text-center py-20 text-slate-500">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-semibold">No job requests</p>
          <p className="text-sm mt-1">Create a job request to start AI matching</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map(jr => {
            const sc = STATUS_COLORS[jr.status] || STATUS_COLORS.open;
            return (
              <div key={jr.id} className="bg-slate-900 border border-slate-700 rounded-xl p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-sm font-bold text-white">{jr.role_type}</p>
                    <p className="text-xs text-slate-400">{jr.company_name || "No company"} {jr.location ? `· ${jr.location}` : ""}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${sc}`}>{jr.status.toUpperCase()}</span>
                </div>
                <div className="flex flex-wrap gap-2 text-xs mb-3">
                  <span className="flex items-center gap-1 text-blue-400"><Users className="w-3 h-3" />{jr.workers_needed} needed</span>
                  {jr.skills_required && <span className="text-slate-500">Skills: {jr.skills_required}</span>}
                  {jr.certifications_required && <span className="text-slate-500">Certs: {jr.certifications_required}</span>}
                  <span className="text-slate-600 ml-auto">{Number(jr.match_count)} matches</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => matchMutation.mutate(jr.id)} disabled={matchMutation.isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 rounded-lg text-xs font-bold hover:bg-indigo-600/30 disabled:opacity-50">
                    {matchMutation.isPending ? <div className="animate-spin w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full" /> : <Brain className="w-3 h-3" />}
                    {jr.status === "open" ? "Find Matches" : "Re-Match"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Dialog */}
      {showCreate && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/50" onClick={() => setShowCreate(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-4">New Job Request</h3>
            <div className="space-y-3">
              <select value={form.companyId || ""} onChange={e => {
                const co = (companiesData?.companies ?? []).find((c: any) => c.id === e.target.value);
                setForm({ ...form, companyId: e.target.value, companyName: co?.company_name || "" });
              }}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#C41E18]">
                <option value="">Select Company (optional)</option>
                {(companiesData?.companies ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
              </select>
              <input placeholder="Role Type (e.g. TIG Welder)" value={form.roleType || ""} onChange={e => setForm({ ...form, roleType: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C41E18]" />
              <input placeholder="Skills Required (comma-separated)" value={form.skillsRequired || ""} onChange={e => setForm({ ...form, skillsRequired: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C41E18]" />
              <input placeholder="Certifications Required" value={form.certificationsRequired || ""} onChange={e => setForm({ ...form, certificationsRequired: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C41E18]" />
              <div className="grid grid-cols-2 gap-3">
                <input placeholder="Location" value={form.location || ""} onChange={e => setForm({ ...form, location: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C41E18]" />
                <input type="number" placeholder="Workers Needed" value={form.workersNeeded || ""} onChange={e => setForm({ ...form, workersNeeded: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C41E18]" />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowCreate(false)} className="flex-1 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg text-sm font-bold">Cancel</button>
              <button onClick={() => createMutation.mutate(form)} disabled={!form.roleType}
                className="flex-1 px-4 py-2 bg-[#C41E18] text-white rounded-lg text-sm font-bold disabled:opacity-50">Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Match Results Side Panel */}
      {selectedJobId && matches.length > 0 && (
        <div className="fixed inset-0 z-[250] flex justify-end" onClick={() => { setSelectedJobId(null); setMatches([]); }}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative w-full max-w-lg bg-slate-900 border-l border-slate-700 h-full overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-slate-900 border-b border-slate-700 px-6 py-4 flex items-center justify-between z-10">
              <div>
                <h2 className="text-lg font-bold text-white">AI Match Results</h2>
                <p className="text-xs text-slate-400">Top {matches.length} candidates ranked by score</p>
              </div>
              <button onClick={() => { setSelectedJobId(null); setMatches([]); }} className="p-2 hover:bg-slate-800 rounded-lg">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div className="p-6 space-y-3">
              {matches.map((m, i) => (
                <div key={m.worker_id} className="bg-slate-800 border border-slate-700 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-black text-white ${scoreBg(m.match_score)}`}>
                        {i + 1}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white">{m.worker_name}</p>
                        <p className="text-[10px] text-slate-500">{m.specialization || "—"}</p>
                      </div>
                    </div>
                    <span className={`text-2xl font-black font-mono ${scoreColor(m.match_score)}`}>{m.match_score}</span>
                  </div>

                  <div className="flex flex-wrap gap-2 text-[10px] mb-3">
                    {m.assigned_site && <span className="flex items-center gap-1 text-slate-400"><MapPin className="w-2.5 h-2.5" />{m.assigned_site}</span>}
                    <span className={`flex items-center gap-1 ${m.compliance_status === "compliant" ? "text-emerald-400" : "text-amber-400"}`}>
                      <Shield className="w-2.5 h-2.5" />{m.compliance_status}
                    </span>
                  </div>

                  {m.match_reasons.length > 0 && (
                    <ul className="space-y-0.5 mb-3">
                      {m.match_reasons.map((r, j) => (
                        <li key={j} className="flex items-start gap-1.5 text-[10px] text-slate-400">
                          <CheckCircle2 className="w-2.5 h-2.5 text-emerald-500 mt-0.5 flex-shrink-0" />{r}
                        </li>
                      ))}
                    </ul>
                  )}

                  <button onClick={() => assignMutation.mutate({ jobId: selectedJobId!, workerId: m.worker_id, workerName: m.worker_name })}
                    disabled={assignMutation.isPending}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-bold hover:bg-emerald-600/30 disabled:opacity-50">
                    <UserPlus className="w-3 h-3" />Assign & Notify via WhatsApp
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
