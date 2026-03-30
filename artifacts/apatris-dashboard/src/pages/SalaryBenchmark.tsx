import { useState } from "react";
import { TrendingUp, Download, ArrowUp, ArrowDown, Minus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface BenchmarkRole {
  role: string;
  apatrisRate: number;
  marketRate: number;
  difference: number;
  diffPercent: number;
  status: "Competitive" | "Below Market" | "Above Market";
}

const BENCHMARK_DATA: BenchmarkRole[] = [
  { role: "TIG Welder (certified)", apatrisRate: 35, marketRate: 32, difference: 3, diffPercent: 9.4, status: "Above Market" },
  { role: "MIG Welder", apatrisRate: 30, marketRate: 30, difference: 0, diffPercent: 0, status: "Competitive" },
  { role: "ARC Welder", apatrisRate: 28, marketRate: 29, difference: -1, diffPercent: -3.4, status: "Below Market" },
  { role: "Pipe Fitter", apatrisRate: 32, marketRate: 31, difference: 1, diffPercent: 3.2, status: "Competitive" },
  { role: "General Helper / Labourer", apatrisRate: 23, marketRate: 25, difference: -2, diffPercent: -8.0, status: "Below Market" },
  { role: "Site Foreman", apatrisRate: 42, marketRate: 40, difference: 2, diffPercent: 5.0, status: "Above Market" },
  { role: "Quality Inspector", apatrisRate: 38, marketRate: 37, difference: 1, diffPercent: 2.7, status: "Competitive" },
  { role: "Safety Officer (BHP)", apatrisRate: 36, marketRate: 35, difference: 1, diffPercent: 2.9, status: "Competitive" },
];

const STATUS_BADGE: Record<string, string> = {
  "Competitive":  "bg-emerald-900/50 text-emerald-400 border-emerald-500/30",
  "Below Market": "bg-red-900/50 text-red-400 border-red-500/30",
  "Above Market": "bg-blue-900/50 text-blue-400 border-blue-500/30",
};

export default function SalaryBenchmark() {
  const { toast } = useToast();
  const [data] = useState<BenchmarkRole[]>(BENCHMARK_DATA);

  const handleExport = () => {
    const header = "Role,Apatris Rate (PLN/h),Market Rate (PLN/h),Difference,Diff %,Status\n";
    const rows = data.map(r =>
      `"${r.role}",${r.apatrisRate},${r.marketRate},${r.difference},${r.diffPercent}%,"${r.status}"`
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "salary_benchmark_poland_2026.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Exported", description: "CSV downloaded" });
  };

  const avgApatris = Math.round(data.reduce((s, r) => s + r.apatrisRate, 0) / data.length * 10) / 10;
  const avgMarket = Math.round(data.reduce((s, r) => s + r.marketRate, 0) / data.length * 10) / 10;
  const competitive = data.filter(r => r.status === "Competitive" || r.status === "Above Market").length;

  return (
    <div className="p-4 md:p-6 min-h-screen overflow-y-auto pb-24 bg-background">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-red-500" /> Salary Benchmark
          </h1>
          <p className="text-sm text-slate-400 mt-1">Polish market rate comparison &mdash; Q1 2026 data (GUS / Pracuj.pl / Randstad)</p>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-semibold transition-colors"
        >
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4">
          <span className="text-xs text-slate-400 uppercase tracking-wide">Avg. Apatris Rate</span>
          <p className="text-2xl font-bold text-white mt-1">{avgApatris} <span className="text-sm text-slate-400">PLN/h</span></p>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4">
          <span className="text-xs text-slate-400 uppercase tracking-wide">Avg. Market Rate</span>
          <p className="text-2xl font-bold text-white mt-1">{avgMarket} <span className="text-sm text-slate-400">PLN/h</span></p>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4">
          <span className="text-xs text-slate-400 uppercase tracking-wide">Competitive Roles</span>
          <p className="text-2xl font-bold text-emerald-400 mt-1">{competitive} / {data.length}</p>
        </div>
      </div>

      {/* Benchmark Table */}
      <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl overflow-x-auto">
        <table className="w-full min-w-[600px]">
          <thead>
            <tr className="border-b border-slate-700/50">
              <th className="p-3 text-left text-xs text-slate-400 font-mono uppercase tracking-wide">Role</th>
              <th className="p-3 text-center text-xs text-slate-400 font-mono uppercase tracking-wide">Apatris (PLN/h)</th>
              <th className="p-3 text-center text-xs text-slate-400 font-mono uppercase tracking-wide">Market (PLN/h)</th>
              <th className="p-3 text-center text-xs text-slate-400 font-mono uppercase tracking-wide">Difference</th>
              <th className="p-3 text-center text-xs text-slate-400 font-mono uppercase tracking-wide">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.map(r => (
              <tr key={r.role} className="border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors">
                <td className="p-3 text-sm text-white font-medium">{r.role}</td>
                <td className="p-3 text-center">
                  <span className="text-sm font-bold text-white">{r.apatrisRate}</span>
                </td>
                <td className="p-3 text-center">
                  <span className="text-sm text-slate-300">{r.marketRate}</span>
                </td>
                <td className="p-3 text-center">
                  <div className="flex items-center justify-center gap-1">
                    {r.difference > 0 ? (
                      <ArrowUp className="w-3.5 h-3.5 text-emerald-400" />
                    ) : r.difference < 0 ? (
                      <ArrowDown className="w-3.5 h-3.5 text-red-400" />
                    ) : (
                      <Minus className="w-3.5 h-3.5 text-slate-500" />
                    )}
                    <span className={`text-sm font-mono ${r.difference > 0 ? "text-emerald-400" : r.difference < 0 ? "text-red-400" : "text-slate-400"}`}>
                      {r.difference > 0 ? "+" : ""}{r.difference} ({r.diffPercent > 0 ? "+" : ""}{r.diffPercent}%)
                    </span>
                  </div>
                </td>
                <td className="p-3 text-center">
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-mono uppercase border ${STATUS_BADGE[r.status]}`}>
                    {r.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer note */}
      <p className="mt-4 text-xs text-slate-500">
        Market data sourced from GUS (Central Statistical Office), Pracuj.pl, and Randstad salary surveys for the welding &amp; construction sector in Poland, Q1 2026.
        Rates shown are gross hourly rates for umowa zlecenie contracts.
      </p>
    </div>
  );
}
