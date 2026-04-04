import { useQuery } from "@tanstack/react-query";
import { Radio } from "lucide-react";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

const API = import.meta.env.VITE_API_URL ?? "";

export function IntelFeedTab() {
  const { data, isLoading } = useQuery({ queryKey: ["intel-reports"], queryFn: async () => { const r = await fetch(`${API}api/intelligence/reports`, { headers: authHeaders() }); if (!r.ok) return { reports: [] }; return r.json(); } });
  const reports = data?.reports ?? [];

  return (
    <div className="p-4 min-h-full overflow-y-auto pb-24 bg-[#0c0c0e]">
      <div className="flex items-center gap-2 mb-4"><Radio className="w-5 h-5 text-[#C41E18]" /><h2 className="text-lg font-bold text-white">Intel Feed</h2></div>
      {isLoading ? <div className="flex justify-center py-16"><div className="animate-spin w-6 h-6 border-2 border-[#C41E18] border-t-transparent rounded-full" /></div> : reports.length === 0 ? (
        <div className="text-center py-16 text-white/30"><Radio className="w-10 h-10 mx-auto mb-2 opacity-30" /><p className="text-sm font-semibold">No reports</p></div>
      ) : (
        <div className="space-y-2">
          {reports.slice(0, 10).map((r: any) => (
            <div key={r.id} className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-3.5">
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-400 rounded-full text-[9px] font-bold">{r.report_type?.replace("_", " ")}</span>
                <span className="text-[9px] text-white/20 ml-auto">{r.country}</span>
              </div>
              <p className="text-[10px] text-white/50 line-clamp-2">{r.insights}</p>
              <p className="text-[9px] text-emerald-400 mt-1">ANONYMISED ✓</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
