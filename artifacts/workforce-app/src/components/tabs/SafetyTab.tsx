import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Shield, AlertTriangle, Plus, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

const API = import.meta.env.VITE_API_URL ?? "";
const TYPES = ["PPE violation", "Near miss", "Injury", "Hazard", "Unsafe behaviour"];
const SEVS = ["low", "medium", "high", "critical"];

interface Incident { id: string; site: string; incident_type: string; severity: string; description: string | null; status: string; reported_at: string; }

export function SafetyTab() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({ severity: "medium" });

  const { data, isLoading } = useQuery({
    queryKey: ["safety-incidents"],
    queryFn: async () => {
      const res = await fetch(`${API}api/safety/incidents`, { headers: authHeaders() });
      if (!res.ok) return { incidents: [] };
      return res.json() as Promise<{ incidents: Incident[] }>;
    },
  });

  const reportMutation = useMutation({
    mutationFn: async (body: Record<string, string>) => {
      const res = await fetch(`${API}api/safety/incidents`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ ...body, workerName: user?.name }) });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => { toast({ description: "Incident reported" }); queryClient.invalidateQueries({ queryKey: ["safety-incidents"] }); setShowForm(false); setForm({ severity: "medium" }); },
    onError: (err) => { toast({ description: err instanceof Error ? err.message : "Failed", variant: "destructive" }); },
  });

  const incidents = data?.incidents ?? [];

  return (
    <div className="p-4 min-h-full overflow-y-auto pb-24 bg-[#0c0c0e]">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-[#C41E18]" />
          <h2 className="text-lg font-bold text-white">Safety</h2>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="px-3 py-1.5 bg-[#C41E18] text-white rounded-xl text-xs font-bold active:scale-95">
          {showForm ? "Cancel" : <><Plus className="w-3 h-3 inline mr-1" />Report</>}
        </button>
      </div>

      {showForm && (
        <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-4 mb-4">
          <input placeholder="Site name" value={form.site || ""} onChange={e => setForm({ ...form, site: e.target.value })}
            className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.06] rounded-xl text-sm text-white placeholder:text-white/20 mb-2 focus:outline-none" />
          <select value={form.incidentType || ""} onChange={e => setForm({ ...form, incidentType: e.target.value })}
            className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.06] rounded-xl text-sm text-white mb-2 focus:outline-none">
            <option value="">Select type</option>
            {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={form.severity} onChange={e => setForm({ ...form, severity: e.target.value })}
            className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.06] rounded-xl text-sm text-white mb-2 focus:outline-none">
            {SEVS.map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}
          </select>
          <textarea placeholder="Description" value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })} rows={2}
            className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.06] rounded-xl text-sm text-white placeholder:text-white/20 mb-2 resize-none focus:outline-none" />
          <button onClick={() => reportMutation.mutate(form)} disabled={!form.site || !form.incidentType}
            className="w-full py-2.5 bg-[#C41E18] text-white rounded-xl text-sm font-bold active:scale-[0.98] disabled:opacity-40">Report Incident</button>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16"><div className="animate-spin w-6 h-6 border-2 border-[#C41E18] border-t-transparent rounded-full" /></div>
      ) : incidents.length === 0 ? (
        <div className="text-center py-16 text-white/30"><Shield className="w-10 h-10 mx-auto mb-2 opacity-30" /><p className="text-sm font-semibold">No incidents</p></div>
      ) : (
        <div className="space-y-2">
          {incidents.slice(0, 20).map(inc => (
            <div key={inc.id} className={cn("rounded-2xl border p-3.5",
              inc.severity === "critical" ? "bg-red-500/5 border-red-500/15" :
              inc.severity === "high" ? "bg-amber-500/5 border-amber-500/15" :
              "bg-white/[0.03] border-white/[0.06]"
            )}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  {inc.severity === "critical" && <AlertTriangle className="w-3 h-3 text-red-400" />}
                  <span className={cn("text-[9px] font-bold uppercase",
                    inc.severity === "critical" ? "text-red-400" : inc.severity === "high" ? "text-amber-400" : "text-blue-400"
                  )}>{inc.severity}</span>
                </div>
                <span className={cn("text-[9px] font-bold", inc.status === "resolved" ? "text-emerald-400" : "text-amber-400")}>{inc.status.toUpperCase()}</span>
              </div>
              <p className="text-xs font-bold text-white">{inc.site}</p>
              <p className="text-[10px] text-white/40">{inc.incident_type}{inc.description ? ` — ${inc.description}` : ""}</p>
              <p className="text-[9px] text-white/20 font-mono mt-1">{new Date(inc.reported_at).toLocaleString("en-GB")}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
