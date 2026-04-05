import React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { MapPin, Play, AlertTriangle, Users, Navigation } from "lucide-react";
import { authHeaders, BASE } from "@/lib/api";


interface Site { name: string; count: number; lat: number | null; lng: number | null; }
interface Suggestion { worker: string; fromSite: string; toSite: string; reason: string; distanceKm: number; }

export default function GeoIntelligence() {
  const { toast } = useToast();

  const { data: sitesData } = useQuery({
    queryKey: ["geo-sites"],
    queryFn: async () => { const r = await fetch(`${import.meta.env.BASE_URL}api/geo/sites`, { headers: authHeaders() }); if (!r.ok) throw new Error("Failed"); return r.json() as Promise<{ sites: Site[] }>; },
  });

  const { data: workersData } = useQuery({
    queryKey: ["geo-workers"],
    queryFn: async () => { const r = await fetch(`${import.meta.env.BASE_URL}api/geo/workers`, { headers: authHeaders() }); if (!r.ok) throw new Error("Failed"); return r.json(); },
  });

  const optimiseMutation = useMutation({
    mutationFn: async () => { const r = await fetch(`${import.meta.env.BASE_URL}api/geo/optimise`, { method: "POST", headers: authHeaders() }); if (!r.ok) throw new Error("Failed"); return r.json(); },
    onSuccess: (d) => toast({ description: `${d.suggestions.length} deployment suggestions generated` }),
  });

  const sites = sitesData?.sites ?? [];
  const farCount = workersData?.farFromSite ?? 0;
  const totalWorkers = workersData?.totalWorkers ?? 0;
  const suggestions = optimiseMutation.data?.suggestions ?? [];

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2"><MapPin className="w-7 h-7 text-[#C41E18]" /><h1 className="text-3xl font-bold text-white">Geo Intelligence</h1></div>
        <p className="text-gray-400">Worker locations, site clusters, and deployment optimisation</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-slate-800 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">Total Workers</p><p className="text-2xl font-bold text-white">{totalWorkers}</p></div>
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">Active Sites</p><p className="text-2xl font-bold text-blue-400">{sites.length}</p></div>
        <div className={`rounded-xl p-4 ${farCount > 0 ? "bg-red-500/10 border border-red-500/20" : "bg-emerald-500/10 border border-emerald-500/20"}`}><p className="text-xs text-gray-400 font-mono uppercase mb-1">Far from Site</p><p className={`text-2xl font-bold ${farCount > 0 ? "text-red-400" : "text-emerald-400"}`}>{farCount}</p></div>
        <div className="bg-slate-800 rounded-xl p-4">
          <button onClick={() => optimiseMutation.mutate()} disabled={optimiseMutation.isPending}
            className="flex items-center gap-2 text-xs font-bold text-[#C41E18]">
            {optimiseMutation.isPending ? <div className="animate-spin w-3 h-3 border-2 border-[#C41E18] border-t-transparent rounded-full" /> : <Play className="w-3 h-3" />}
            Optimise Routes
          </button>
        </div>
      </div>

      {/* Site clusters */}
      <h3 className="text-sm font-bold text-white mb-3">Site Worker Distribution</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {sites.map(s => (
          <div key={s.name} className="bg-slate-900 border border-slate-700 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <MapPin className="w-4 h-4 text-blue-400" />
              <p className="text-xs font-bold text-white truncate">{s.name}</p>
            </div>
            <p className="text-2xl font-black text-blue-400">{s.count}</p>
            <p className="text-[9px] text-slate-500 font-mono">{s.lat?.toFixed(4)}, {s.lng?.toFixed(4)}</p>
          </div>
        ))}
      </div>

      {/* AI Deployment Suggestions */}
      {suggestions.length > 0 && (
        <>
          <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2"><Navigation className="w-4 h-4 text-emerald-400" />Optimal Deployment Suggestions</h3>
          <div className="space-y-2 mb-6">
            {suggestions.map((s, i) => (
              <div key={i} className="bg-emerald-500/5 border border-emerald-500/15 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-white">{s.worker}</p>
                  <p className="text-[10px] text-slate-400">{s.fromSite} → {s.toSite}</p>
                  <p className="text-[9px] text-emerald-400">{s.reason}</p>
                </div>
                <span className="text-sm font-bold text-emerald-400 font-mono flex-shrink-0">{s.distanceKm}km</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Worker distance alerts */}
      {(workersData?.workers ?? []).filter((w: any) => w.farFromSite).length > 0 && (
        <>
          <h3 className="text-sm font-bold text-red-400 mb-3 flex items-center gap-2"><AlertTriangle className="w-4 h-4" />Distance Alerts (&gt;5km from site)</h3>
          <div className="space-y-2">
            {(workersData?.workers ?? []).filter((w: any) => w.farFromSite).map((w: any) => (
              <div key={w.workerId} className="bg-red-500/5 border border-red-500/15 rounded-xl p-3 flex items-center justify-between">
                <div><p className="text-xs font-bold text-white">{w.name}</p><p className="text-[10px] text-slate-400">{w.site}</p></div>
                <span className="text-sm font-bold text-red-400 font-mono">{w.distanceKm}km</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
