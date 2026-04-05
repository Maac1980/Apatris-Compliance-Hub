import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Calculator, Download, CheckCircle2, Clock, AlertTriangle, Play } from "lucide-react";
import { authHeaders, BASE } from "@/lib/api";


interface Filing {
  id: string;
  month: number;
  year: number;
  status: string;
  generated_at: string | null;
  submitted_at: string | null;
  worker_count: number;
  total_contributions: string;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  submitted:  { bg: "bg-emerald-500/10 border-emerald-500/20", text: "text-emerald-400", label: "Submitted" },
  generated:  { bg: "bg-amber-500/10 border-amber-500/20",    text: "text-amber-400",   label: "Generated" },
  draft:      { bg: "bg-slate-500/10 border-slate-500/20",    text: "text-slate-400",   label: "Draft" },
  missing:    { bg: "bg-red-500/10 border-red-500/20",        text: "text-red-400",     label: "Missing" },
};

export default function ZusFilings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);

  const { data, isLoading } = useQuery({
    queryKey: ["zus-filings"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/zus/filings`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ filings: Filing[] }>;
    },
  });

  const generateMutation = useMutation({
    mutationFn: async ({ month, year }: { month: number; year: number }) => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/zus/filings/generate`, {
        method: "POST", headers: authHeaders(), body: JSON.stringify({ month, year }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Failed"); }
      return res.json();
    },
    onSuccess: (data) => {
      toast({ description: `DRA generated: ${data.workerCount} workers, ${Number(data.totalContributions).toLocaleString("pl")} PLN` });
      queryClient.invalidateQueries({ queryKey: ["zus-filings"] });
    },
    onError: (err) => { toast({ description: err instanceof Error ? err.message : "Failed", variant: "destructive" }); },
  });

  const submitMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/zus/filings/${id}/submit`, { method: "PATCH", headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => { toast({ description: "Marked as submitted to e-Płatnik" }); queryClient.invalidateQueries({ queryKey: ["zus-filings"] }); },
  });

  const filings = data?.filings ?? [];
  const filingsMap = useMemo(() => {
    const map: Record<string, Filing> = {};
    for (const f of filings) map[`${f.year}-${f.month}`] = f;
    return map;
  }, [filings]);

  const yearFilings = useMemo(() =>
    Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      const key = `${selectedYear}-${month}`;
      const filing = filingsMap[key];
      return { month, filing, status: filing?.status || "missing" };
    }),
  [selectedYear, filingsMap]);

  const yearTotal = yearFilings.reduce((s, f) => s + Number(f.filing?.total_contributions || 0), 0);
  const yearWorkers = yearFilings.reduce((s, f) => s + (f.filing?.worker_count || 0), 0);

  const downloadXml = (id: string, month: number, year: number) => {
    const token = localStorage.getItem("apatris_jwt");
    window.open(`${import.meta.env.BASE_URL}api/zus/filings/${id}/download?token=${token}`, "_blank");
  };

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Calculator className="w-7 h-7 text-[#C41E18]" />
          <h1 className="text-3xl font-bold text-white">ZUS/DRA Filings</h1>
        </div>
        <p className="text-gray-400">Generate ZUS DRA declarations for e-Płatnik submission</p>
      </div>

      {/* Summary + year picker */}
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <div className="bg-slate-800 rounded-xl p-4 flex-1 min-w-[180px]">
          <p className="text-xs text-gray-400 font-mono uppercase mb-1">Year Total</p>
          <p className="text-2xl font-bold text-emerald-400">{yearTotal.toLocaleString("pl", { minimumFractionDigits: 2 })} PLN</p>
        </div>
        <div className="bg-slate-800 rounded-xl p-4">
          <p className="text-xs text-gray-400 font-mono uppercase mb-1">Workers (cumul.)</p>
          <p className="text-2xl font-bold text-white">{yearWorkers}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setSelectedYear(y => y - 1)} className="px-3 py-2 bg-slate-800 text-slate-400 rounded-lg hover:text-white">&larr;</button>
          <span className="text-lg font-black text-white font-mono">{selectedYear}</span>
          <button onClick={() => setSelectedYear(y => y + 1)} disabled={selectedYear >= currentYear}
            className="px-3 py-2 bg-slate-800 text-slate-400 rounded-lg hover:text-white disabled:opacity-30">&rarr;</button>
        </div>
      </div>

      {/* Monthly calendar grid */}
      {isLoading ? (
        <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-[#C41E18] border-t-transparent rounded-full" /></div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {yearFilings.map(({ month, filing, status }) => {
            const st = STATUS_STYLES[status] || STATUS_STYLES.missing;
            const isPast = selectedYear < currentYear || (selectedYear === currentYear && month <= new Date().getMonth() + 1);
            return (
              <div key={month} className={`rounded-xl border p-4 ${st.bg}`}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-black text-white">{MONTHS[month - 1]} {selectedYear}</p>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${st.text} bg-white/5`}>{st.label}</span>
                </div>

                {filing ? (
                  <>
                    <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                      <div><p className="text-slate-500">Workers</p><p className="text-white font-bold">{filing.worker_count}</p></div>
                      <div><p className="text-slate-500">Total</p><p className="text-emerald-400 font-mono font-bold">{Number(filing.total_contributions).toLocaleString("pl")} PLN</p></div>
                    </div>
                    {filing.submitted_at && (
                      <p className="text-[10px] text-emerald-600 font-mono mb-2">Submitted {new Date(filing.submitted_at).toLocaleDateString("en-GB")}</p>
                    )}
                    <div className="flex gap-1.5">
                      <button onClick={() => downloadXml(filing.id, month, selectedYear)}
                        className="flex items-center gap-1 px-2 py-1 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded text-[10px] font-bold hover:bg-blue-600/30">
                        <Download className="w-3 h-3" />XML
                      </button>
                      {filing.status !== "submitted" && (
                        <button onClick={() => submitMutation.mutate(filing.id)} disabled={submitMutation.isPending}
                          className="flex items-center gap-1 px-2 py-1 bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 rounded text-[10px] font-bold hover:bg-emerald-600/30 disabled:opacity-50">
                          <CheckCircle2 className="w-3 h-3" />Submit
                        </button>
                      )}
                    </div>
                  </>
                ) : isPast ? (
                  <button onClick={() => generateMutation.mutate({ month, year: selectedYear })} disabled={generateMutation.isPending}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-[#C41E18]/20 text-red-400 border border-red-500/30 rounded-lg text-xs font-bold hover:bg-[#C41E18]/30 disabled:opacity-50">
                    {generateMutation.isPending ? <div className="animate-spin w-3 h-3 border-2 border-red-400 border-t-transparent rounded-full" /> : <Play className="w-3 h-3" />}
                    Generate DRA
                  </button>
                ) : (
                  <p className="text-xs text-slate-600 text-center py-2">Future period</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
