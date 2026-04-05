import React from "react";
import { useQuery } from "@tanstack/react-query";
import { SmilePlus, AlertTriangle, TrendingUp, MapPin } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { authHeaders, BASE } from "@/lib/api";


const EMOJIS = ["", "😢", "😔", "😐", "🙂", "😃"];

function moodColor(score: number): string {
  if (score >= 4) return "text-emerald-400";
  if (score >= 3) return "text-amber-400";
  return "text-red-400";
}

function moodBg(score: number): string {
  if (score >= 4) return "bg-emerald-500/10 border-emerald-500/20";
  if (score >= 3) return "bg-amber-500/10 border-amber-500/20";
  return "bg-red-500/10 border-red-500/20";
}

function moodBarColor(score: number): string {
  if (score >= 4) return "#34d399";
  if (score >= 3) return "#fbbf24";
  return "#f87171";
}

export default function MoodTracker() {
  const { data, isLoading } = useQuery({
    queryKey: ["mood-dashboard"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/mood/dashboard`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const siteAvgs = data?.siteAverages ?? [];
  const weeklyTrend = data?.weeklyTrend ?? [];
  const lowScoreWorkers = data?.lowScoreWorkers ?? [];
  const thisWeek = data?.thisWeek ?? { avgScore: 0, respondents: 0 };

  const chartData = weeklyTrend.map((w: any) => ({
    week: `W${w.week_number}`,
    score: Number(w.avg_score),
    entries: Number(w.entries),
  }));

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <SmilePlus className="w-7 h-7 text-[#C41E18]" />
          <h1 className="text-3xl font-bold text-white">Worker Mood Tracker</h1>
        </div>
        <p className="text-gray-400">Weekly pulse survey — track worker wellbeing across sites</p>
      </div>

      {/* This week summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        <div className={`rounded-xl border p-4 ${moodBg(thisWeek.avgScore)}`}>
          <p className="text-xs text-gray-400 font-mono uppercase mb-1">This Week Avg</p>
          <p className={`text-3xl font-bold ${moodColor(thisWeek.avgScore)}`}>
            {thisWeek.avgScore > 0 ? `${thisWeek.avgScore} ${EMOJIS[Math.round(thisWeek.avgScore)]}` : "—"}
          </p>
        </div>
        <div className="bg-slate-800 rounded-xl p-4">
          <p className="text-xs text-gray-400 font-mono uppercase mb-1">Respondents</p>
          <p className="text-2xl font-bold text-white">{thisWeek.respondents}</p>
        </div>
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
          <p className="text-xs text-gray-400 font-mono uppercase mb-1">Low Score Alerts</p>
          <p className="text-2xl font-bold text-red-400">{lowScoreWorkers.length}</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-[#C41E18] border-t-transparent rounded-full" /></div>
      ) : (
        <>
          {/* Weekly trend chart */}
          {chartData.length > 0 && (
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 mb-6">
              <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-slate-400" />Weekly Mood Trend
              </h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="week" tick={{ fill: "#64748b", fontSize: 11 }} />
                  <YAxis domain={[0, 5]} tick={{ fill: "#64748b", fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="score" radius={[4, 4, 0, 0]}
                    fill="#C41E18"
                    label={{ position: "top", fill: "#94a3b8", fontSize: 10 }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Site mood heatmap */}
          <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-slate-400" />Site Mood Heatmap
          </h3>
          {siteAvgs.length === 0 ? (
            <p className="text-slate-500 text-sm mb-6">No mood data by site yet</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
              {siteAvgs.map((s: any) => {
                const avg = Number(s.avg_score);
                return (
                  <div key={s.site} className={`rounded-xl border p-4 ${moodBg(avg)}`}>
                    <p className="text-xs text-slate-400 font-mono truncate mb-1">{s.site}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{EMOJIS[Math.round(avg)]}</span>
                      <span className={`text-xl font-black font-mono ${moodColor(avg)}`}>{avg}</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">{s.entries} entries</p>
                  </div>
                );
              })}
            </div>
          )}

          {/* Low score workers */}
          {lowScoreWorkers.length > 0 && (
            <>
              <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400" />Workers Needing Attention (avg &lt; 3.0)
              </h3>
              <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden mb-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 bg-slate-800/50">
                      <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase">Worker</th>
                      <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase">Site</th>
                      <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase">Avg Score</th>
                      <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase">Weeks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lowScoreWorkers.map((w: any) => (
                      <tr key={w.worker_id} className="border-b border-slate-800">
                        <td className="px-4 py-3 font-medium text-white">{w.worker_name}</td>
                        <td className="px-4 py-3 text-slate-400">{w.site || "—"}</td>
                        <td className="px-4 py-3">
                          <span className={`font-bold font-mono ${moodColor(Number(w.avg_score))}`}>
                            {w.avg_score} {EMOJIS[Math.round(Number(w.avg_score))]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-400 font-mono">{w.weeks}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
