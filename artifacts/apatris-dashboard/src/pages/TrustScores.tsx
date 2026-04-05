import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Award, Play, ChevronRight, X } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

interface TrustScore { id: string; worker_id: string; worker_name: string; score: number; breakdown: any; calculated_at: string; }

function tier(s: number): { label: string; color: string; bg: string } {
  if (s >= 90) return { label: "PLATINUM", color: "text-slate-200", bg: "bg-slate-300/10 border-slate-300/20" };
  if (s >= 75) return { label: "GOLD", color: "text-[#B8860B]", bg: "bg-[#B8860B]/10 border-[#B8860B]/20" };
  if (s >= 50) return { label: "SILVER", color: "text-slate-400", bg: "bg-slate-500/10 border-slate-500/20" };
  return { label: "BRONZE", color: "text-amber-700", bg: "bg-amber-900/10 border-amber-800/20" };
}

export default function TrustScores() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["trust-scores"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/trust/scores`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ scores: TrustScore[] }>;
    },
  });

  const { data: historyData } = useQuery({
    queryKey: ["trust-history", selectedId],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/trust/scores/${selectedId}/history`, { headers: authHeaders() });
      if (!res.ok) return { history: [] };
      return res.json() as Promise<{ history: TrustScore[] }>;
    },
    enabled: !!selectedId,
  });

  const calcMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/trust/calculate-all`, { method: "POST", headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: (d) => { toast({ description: `Calculated ${d.calculated} scores` }); queryClient.invalidateQueries({ queryKey: ["trust-scores"] }); },
  });

  const scores = (data?.scores ?? []).sort((a: TrustScore, b: TrustScore) => b.score - a.score);
  const top10 = scores.slice(0, 10);
  const avg = scores.length > 0 ? Math.round(scores.reduce((s: number, t: TrustScore) => s + t.score, 0) / scores.length) : 0;
  const tiers = { platinum: scores.filter((s: TrustScore) => s.score >= 90).length, gold: scores.filter((s: TrustScore) => s.score >= 75 && s.score < 90).length, silver: scores.filter((s: TrustScore) => s.score >= 50 && s.score < 75).length, bronze: scores.filter((s: TrustScore) => s.score < 50).length };

  const selected = scores.find((s: TrustScore) => s.worker_id === selectedId);
  const _bd = selected ? (typeof selected.breakdown === "string" ? (() => { try { return JSON.parse(selected.breakdown); } catch { return null; } })() : selected.breakdown) : null;
  const breakdown = _bd && typeof _bd === "object" && !Array.isArray(_bd) ? _bd : null;
  const history = (historyData?.history ?? []).reverse();
  const chartData = history.map((h: TrustScore) => ({ date: new Date(h.calculated_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }), score: h.score }));

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Award className="w-7 h-7 text-[#B8860B]" />
          <h1 className="text-3xl font-bold text-white">Worker Trust Scores</h1>
        </div>
        <p className="text-gray-400">6-component reliability scoring — updated daily</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <div className="bg-slate-800 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">Average</p><p className="text-2xl font-bold text-white">{avg}/100</p></div>
        <div className="bg-slate-300/10 border border-slate-300/20 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">Platinum</p><p className="text-2xl font-bold text-slate-200">{tiers.platinum}</p></div>
        <div className="bg-[#B8860B]/10 border border-[#B8860B]/20 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">Gold</p><p className="text-2xl font-bold text-[#B8860B]">{tiers.gold}</p></div>
        <div className="bg-slate-500/10 border border-slate-500/20 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">Silver</p><p className="text-2xl font-bold text-slate-400">{tiers.silver}</p></div>
        <div className="bg-amber-900/10 border border-amber-800/20 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">Bronze</p><p className="text-2xl font-bold text-amber-700">{tiers.bronze}</p></div>
      </div>

      <div className="flex justify-end mb-4">
        <button onClick={() => calcMutation.mutate()} disabled={calcMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-[#C41E18] text-white rounded-lg text-sm font-bold hover:bg-[#a51914] disabled:opacity-50">
          {calcMutation.isPending ? <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : <Play className="w-4 h-4" />}
          Recalculate All
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-[#B8860B] border-t-transparent rounded-full" /></div>
      ) : scores.length === 0 ? (
        <div className="text-center py-20 text-slate-500"><Award className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="text-lg font-semibold">No scores calculated yet</p><p className="text-sm mt-1">Click "Recalculate All" to generate trust scores</p></div>
      ) : (
        <div className="space-y-2">
          {scores.map((s: TrustScore, i: number) => {
            const t = tier(s.score);
            return (
              <button key={s.id} onClick={() => setSelectedId(s.worker_id === selectedId ? null : s.worker_id)}
                className={`w-full rounded-xl border p-4 flex items-center gap-4 hover:bg-slate-800/40 transition-colors text-left ${t.bg}`}>
                <span className="text-sm font-mono text-slate-500 w-6">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white">{s.worker_name}</p>
                  <span className={`text-[10px] font-bold ${t.color}`}>{t.label}</span>
                </div>
                <span className={`text-2xl font-black font-mono ${t.color}`}>{s.score}</span>
                <ChevronRight className="w-4 h-4 text-slate-600" />
              </button>
            );
          })}
        </div>
      )}

      {/* Side panel — breakdown + history */}
      {selectedId && selected && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelectedId(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative w-full max-w-lg bg-slate-900 border-l border-slate-700 h-full overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-slate-900 border-b border-slate-700 px-6 py-4 flex items-center justify-between z-10">
              <div>
                <h2 className="text-lg font-bold text-white">{selected.worker_name}</h2>
                <p className={`text-xs font-bold ${tier(selected.score).color}`}>{tier(selected.score).label} — {selected.score}/100</p>
              </div>
              <button onClick={() => setSelectedId(null)} className="p-2 hover:bg-slate-800 rounded-lg"><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="p-6">
              {/* Breakdown */}
              {breakdown && (
                <div className="space-y-2 mb-6">
                  <h3 className="text-sm font-bold text-white mb-3">Score Breakdown</h3>
                  {Object.entries(breakdown ?? {}).map(([key, val]: [string, any]) => (
                    <div key={key} className="bg-slate-800 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-bold text-white capitalize">{key}</p>
                        <p className="text-xs font-bold font-mono text-emerald-400">{val.score}/{val.max}</p>
                      </div>
                      <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(val.score / val.max) * 100}%` }} />
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1">{val.details}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* History chart */}
              {chartData.length > 1 && (
                <div>
                  <h3 className="text-sm font-bold text-white mb-3">Score Trend</h3>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 10 }} />
                      <YAxis domain={[0, 100]} tick={{ fill: "#64748b", fontSize: 10 }} />
                      <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }} />
                      <Bar dataKey="score" fill="#B8860B" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
