import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Globe, Calculator } from "lucide-react";
import { authHeaders, BASE } from "@/lib/api";


interface Country { country_code: string; country_name: string; currency: string; min_wage_hourly: string; min_wage_monthly: string; social_security_employee: string; social_security_employer: string; income_tax_rate: string; posted_worker_rules: string; notes: string; }
interface Comparison { country: string; code: string; currency: string; grossEur: number; netEur: number; totalCostEur: number; ssEmployeePercent: number; ssEmployerPercent: number; taxPercent: number; }

const FLAGS: Record<string, string> = { PL: "🇵🇱", NL: "🇳🇱", BE: "🇧🇪", LT: "🇱🇹", SK: "🇸🇰", CZ: "🇨🇿", RO: "🇷🇴" };

export default function CountryPayroll() {
  const [rate, setRate] = useState("31.40");
  const [hours, setHours] = useState("160");
  const [selectedCode, setSelectedCode] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["country-configs"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/countries`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ countries: Country[] }>;
    },
  });

  const compareMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/countries/compare`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ hourlyRateEur: Number(rate), hours: Number(hours) }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ comparison: Comparison[] }>;
    },
  });

  const countries = data?.countries ?? [];
  const comparison = compareMutation.data?.comparison ?? [];
  const selected = countries.find(c => c.country_code === selectedCode);
  const fmtEur = (n: number) => `€${n.toLocaleString("en", { maximumFractionDigits: 0 })}`;

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Globe className="w-7 h-7 text-[#C41E18]" />
          <h1 className="text-3xl font-bold text-white">Multi-Country Payroll</h1>
        </div>
        <p className="text-gray-400">7 EU countries — rates, social security, tax, Posted Workers rules</p>
      </div>

      {/* Country cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
        {countries.map(c => (
          <button key={c.country_code} onClick={() => setSelectedCode(selectedCode === c.country_code ? null : c.country_code)}
            className={`rounded-xl border p-3 text-left transition-all ${selectedCode === c.country_code ? "bg-[#C41E18]/10 border-[#C41E18]/30" : "bg-slate-800 border-slate-700 hover:border-slate-600"}`}>
            <p className="text-xl mb-1">{FLAGS[c.country_code] || "🌍"}</p>
            <p className="text-xs font-bold text-white">{c.country_name}</p>
            <p className="text-[10px] text-slate-400 font-mono">{c.currency} {Number(c.min_wage_hourly).toFixed(2)}/h</p>
            <p className="text-[9px] text-slate-500">SS: {c.social_security_employee}%+{c.social_security_employer}%</p>
          </button>
        ))}
      </div>

      {/* Selected country detail */}
      {selected && (
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 mb-6">
          <h3 className="text-sm font-bold text-white mb-3">{FLAGS[selected.country_code]} {selected.country_name} — {selected.currency}</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs mb-3">
            <div><p className="text-slate-500">Min Wage (hourly)</p><p className="text-white font-mono font-bold">{selected.currency} {Number(selected.min_wage_hourly).toFixed(2)}</p></div>
            <div><p className="text-slate-500">Min Wage (monthly)</p><p className="text-white font-mono font-bold">{selected.currency} {Number(selected.min_wage_monthly).toLocaleString()}</p></div>
            <div><p className="text-slate-500">SS Employee</p><p className="text-white font-mono font-bold">{selected.social_security_employee}%</p></div>
            <div><p className="text-slate-500">SS Employer</p><p className="text-white font-mono font-bold">{selected.social_security_employer}%</p></div>
            <div><p className="text-slate-500">Income Tax</p><p className="text-white font-mono font-bold">{selected.income_tax_rate}%</p></div>
            <div className="col-span-3"><p className="text-slate-500">Notes</p><p className="text-slate-300">{selected.notes}</p></div>
          </div>
          <div className="bg-slate-800 rounded-lg p-3">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Posted Workers Directive</p>
            <p className="text-xs text-slate-300">{selected.posted_worker_rules}</p>
          </div>
        </div>
      )}

      {/* Cost comparison calculator */}
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 mb-6">
        <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2"><Calculator className="w-4 h-4 text-slate-400" />Cross-Country Cost Comparison</h3>
        <div className="flex gap-3 mb-4">
          <input type="number" placeholder="Rate (EUR/h)" value={rate} onChange={e => setRate(e.target.value)}
            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white w-40 focus:outline-none focus:ring-1 focus:ring-[#C41E18]" />
          <input type="number" placeholder="Hours/month" value={hours} onChange={e => setHours(e.target.value)}
            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white w-32 focus:outline-none focus:ring-1 focus:ring-[#C41E18]" />
          <button onClick={() => compareMutation.mutate()} disabled={compareMutation.isPending}
            className="px-4 py-2 bg-[#C41E18] text-white rounded-lg text-sm font-bold hover:bg-[#a51914] disabled:opacity-50">
            Compare
          </button>
        </div>

        {comparison.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left px-3 py-2 text-xs font-bold text-slate-400">Country</th>
                  <th className="text-left px-3 py-2 text-xs font-bold text-slate-400">Gross (EUR)</th>
                  <th className="text-left px-3 py-2 text-xs font-bold text-slate-400">Net (EUR)</th>
                  <th className="text-left px-3 py-2 text-xs font-bold text-slate-400">Total Cost (EUR)</th>
                  <th className="text-left px-3 py-2 text-xs font-bold text-slate-400">SS Emp%</th>
                  <th className="text-left px-3 py-2 text-xs font-bold text-slate-400">SS Empl%</th>
                  <th className="text-left px-3 py-2 text-xs font-bold text-slate-400">Tax%</th>
                </tr>
              </thead>
              <tbody>
                {comparison.map((c, i) => (
                  <tr key={c.code} className={`border-b border-slate-800 ${i === 0 ? "bg-emerald-500/5" : ""}`}>
                    <td className="px-3 py-2 font-medium text-white">{FLAGS[c.code]} {c.country}</td>
                    <td className="px-3 py-2 font-mono text-xs text-white">{fmtEur(c.grossEur)}</td>
                    <td className="px-3 py-2 font-mono text-xs text-emerald-400 font-bold">{fmtEur(c.netEur)}</td>
                    <td className="px-3 py-2 font-mono text-xs text-amber-400 font-bold">{fmtEur(c.totalCostEur)}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-400">{c.ssEmployeePercent}%</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-400">{c.ssEmployerPercent}%</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-400">{c.taxPercent}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[10px] text-emerald-400 mt-2">Cheapest: {FLAGS[comparison[0]?.code]} {comparison[0]?.country} at {fmtEur(comparison[0]?.totalCostEur)} total employer cost</p>
          </div>
        )}
      </div>
    </div>
  );
}
