import { useQuery } from "@tanstack/react-query";
import { FileText, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

const API = import.meta.env.VITE_API_URL ?? "";

interface Agreement { id: string; company_name: string; agreement_name: string; start_date: string; end_date: string; status: string; rate_card_count: string; }

export function FrameworksTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["frameworks"],
    queryFn: async () => { const r = await fetch(`${API}api/frameworks`, { headers: authHeaders() }); if (!r.ok) return { agreements: [] }; return r.json() as Promise<{ agreements: Agreement[] }>; },
  });

  const agreements = data?.agreements ?? [];

  return (
    <div className="p-4 min-h-full overflow-y-auto pb-24 bg-[#0c0c0e]">
      <div className="flex items-center gap-2 mb-4"><FileText className="w-5 h-5 text-[#C41E18]" /><h2 className="text-lg font-bold text-white">Frameworks</h2></div>

      {isLoading ? (
        <div className="flex justify-center py-16"><div className="animate-spin w-6 h-6 border-2 border-[#C41E18] border-t-transparent rounded-full" /></div>
      ) : agreements.length === 0 ? (
        <div className="text-center py-16 text-white/30"><FileText className="w-10 h-10 mx-auto mb-2 opacity-30" /><p className="text-sm font-semibold">No agreements</p></div>
      ) : (
        <div className="space-y-2">
          {agreements.map(a => {
            const days = a.end_date ? Math.ceil((new Date(a.end_date).getTime() - Date.now()) / 86_400_000) : null;
            return (
              <div key={a.id} className={cn("rounded-2xl border p-3.5", days !== null && days <= 30 ? "bg-red-500/5 border-red-500/15" : "bg-white/[0.03] border-white/[0.06]")}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-bold text-white truncate">{a.agreement_name}</p>
                  <span className={cn("text-[9px] font-bold uppercase", a.status === "signed" ? "text-emerald-400" : "text-slate-400")}>{a.status}</span>
                </div>
                <p className="text-[10px] text-white/40">{a.company_name} · {a.rate_card_count} rate cards</p>
                <p className="text-[9px] text-white/20 font-mono mt-1">{a.start_date ? new Date(a.start_date).toLocaleDateString("en-GB") : ""} — {a.end_date ? new Date(a.end_date).toLocaleDateString("en-GB") : ""}</p>
                {days !== null && days <= 30 && <p className="text-[9px] text-red-400 font-bold mt-0.5">Expires in {days}d</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
