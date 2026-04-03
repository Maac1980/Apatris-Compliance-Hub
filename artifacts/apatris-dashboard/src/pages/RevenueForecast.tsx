import React from "react";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, Users, DollarSign, AlertTriangle } from "lucide-react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

export default function RevenueForecast() {
  const { data: forecast } = useQuery({
    queryKey: ["revenue-forecast"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/revenue/forecast`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: actual } = useQuery({
    queryKey: ["revenue-actual"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/revenue/actual`, { headers: authHeaders() });
      if (!res.ok) return { actual: [], outstanding: 0 };
      return res.json();
    },
  });

  const { data: summary } = useQuery({
    queryKey: ["revenue-summary"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/revenue/summary`, { headers: authHeaders() });
      if (!res.ok) return null;
      return res.json();
    },
  });

  const forecastData = forecast?.forecast ?? [];
  const actualData = actual?.actual ?? [];
  const topClients = summary?.topClients ?? [];
  const fmtEur = (n: number) => n.toLocaleString("en", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

  const sixMonthTotal = forecastData.reduce((s: number, f: any) => s + f.netProjected, 0);
  const totalAtRisk = forecastData.reduce((s: number, f: any) => s + f.revenueAtRisk, 0);

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <TrendingUp className="w-7 h-7 text-emerald-400" />
          <h1 className="text-3xl font-bold text-white">Revenue Forecast</h1>
        </div>
        <p className="text-gray-400">6-month projection from active contracts and workers</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
          <p className="text-xs text-gray-400 font-mono uppercase mb-1">This Month</p>
          <p className="text-xl font-bold text-emerald-400">{fmtEur(summary?.currentMonth ?? 0)}</p>
        </div>
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
          <p className="text-xs text-gray-400 font-mono uppercase mb-1">6-Month Total</p>
          <p className="text-xl font-bold text-blue-400">{fmtEur(sixMonthTotal)}</p>
        </div>
        <div className="bg-slate-800 rounded-xl p-4">
          <p className="text-xs text-gray-400 font-mono uppercase mb-1">Active Workers</p>
          <p className="text-2xl font-bold text-white">{summary?.activeWorkers ?? 0}</p>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
          <p className="text-xs text-gray-400 font-mono uppercase mb-1">On Bench</p>
          <p className="text-2xl font-bold text-amber-400">{summary?.benchWorkers ?? 0}</p>
        </div>
        <div className={`rounded-xl p-4 ${totalAtRisk > 0 ? "bg-red-500/10 border border-red-500/20" : "bg-slate-800"}`}>
          <p className="text-xs text-gray-400 font-mono uppercase mb-1">At Risk</p>
          <p className={`text-xl font-bold ${totalAtRisk > 0 ? "text-red-400" : "text-white"}`}>{fmtEur(totalAtRisk)}</p>
        </div>
      </div>

      {/* 6 month forecast chart */}
      {forecastData.length > 0 && (
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 mb-6">
          <h3 className="text-sm font-bold text-white mb-4">6-Month Revenue Projection</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={forecastData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 11 }} />
              <YAxis tick={{ fill: "#64748b", fontSize: 11 }} tickFormatter={(v: number) => `€${(v / 1000).toFixed(0)}k`} />
              <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }}
                formatter={(v: number) => fmtEur(v)} />
              <Legend />
              <Bar dataKey="netProjected" name="Net Revenue" fill="#34d399" radius={[4, 4, 0, 0]} />
              <Bar dataKey="benchGap" name="Bench Gap" fill="#f87171" radius={[4, 4, 0, 0]} />
              {totalAtRisk > 0 && <Bar dataKey="revenueAtRisk" name="At Risk" fill="#fbbf24" radius={[4, 4, 0, 0]} />}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Actual vs outstanding */}
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-4">
          <h3 className="text-sm font-bold text-white mb-3">Invoiced Revenue</h3>
          {actualData.length === 0 ? <p className="text-slate-500 text-sm">No invoice data</p> : (
            <div className="space-y-2">
              {actualData.map((a: any) => (
                <div key={a.monthYear} className="flex items-center justify-between">
                  <span className="text-xs text-slate-400 font-mono">{a.monthYear}</span>
                  <span className="text-sm font-bold text-emerald-400 font-mono">{fmtEur(a.revenue)}</span>
                </div>
              ))}
              <div className="border-t border-slate-700 pt-2 flex items-center justify-between">
                <span className="text-xs text-slate-400">Outstanding</span>
                <span className="text-sm font-bold text-amber-400 font-mono">{fmtEur(actual?.outstanding ?? 0)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Top clients */}
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-4">
          <h3 className="text-sm font-bold text-white mb-3">Top Revenue Clients</h3>
          {topClients.length === 0 ? <p className="text-slate-500 text-sm">No active contracts</p> : (
            <div className="space-y-2">
              {topClients.map((c: any, i: number) => (
                <div key={c.name} className="flex items-center gap-3">
                  <span className="text-xs text-slate-600 font-mono w-4">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-white truncate">{c.name}</p>
                    <p className="text-[10px] text-slate-500">{c.workers} workers</p>
                  </div>
                  <span className="text-sm font-bold text-emerald-400 font-mono">{fmtEur(c.value)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
