import { useQuery } from "@tanstack/react-query";
import { FileSignature, CheckCircle2, Clock, Send, Eye, X } from "lucide-react";
import { cn } from "@/lib/utils";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

const API = import.meta.env.VITE_API_URL ?? "";

interface CertSig {
  id: string; worker_name: string; contract_title: string | null; status: string;
  sent_at: string | null; signed_at: string | null; signing_url: string | null; provider: string;
}

const ST: Record<string, { text: string; icon: typeof Clock; label: string }> = {
  sent:      { text: "text-blue-400",    icon: Send,         label: "PENDING" },
  viewed:    { text: "text-indigo-400",  icon: Eye,          label: "VIEWED" },
  signed:    { text: "text-emerald-400", icon: CheckCircle2, label: "SIGNED" },
  completed: { text: "text-emerald-400", icon: CheckCircle2, label: "SIGNED" },
  declined:  { text: "text-red-400",     icon: X,            label: "DECLINED" },
  draft:     { text: "text-slate-400",   icon: Clock,        label: "DRAFT" },
};

export function SignaturesTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["certified-signatures"],
    queryFn: async () => {
      const res = await fetch(`${API}api/signatures/certified`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ signatures: CertSig[] }>;
    },
  });

  const sigs = data?.signatures ?? [];

  return (
    <div className="p-4 min-h-full overflow-y-auto pb-24 bg-[#0c0c0e]">
      <div className="flex items-center gap-2 mb-4">
        <FileSignature className="w-5 h-5 text-[#C41E18]" />
        <h2 className="text-lg font-bold text-white">Signatures</h2>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><div className="animate-spin w-6 h-6 border-2 border-[#C41E18] border-t-transparent rounded-full" /></div>
      ) : sigs.length === 0 ? (
        <div className="text-center py-16 text-white/30"><FileSignature className="w-10 h-10 mx-auto mb-2 opacity-30" /><p className="text-sm font-semibold">No documents to sign</p></div>
      ) : (
        <div className="space-y-2">
          {sigs.map(s => {
            const st = ST[s.status] || ST.draft;
            const Icon = st.icon;
            const needsSign = s.status === "sent" || s.status === "viewed";
            return (
              <div key={s.id} className={cn("rounded-2xl border p-3.5",
                needsSign ? "bg-blue-500/5 border-blue-500/15" :
                s.status === "signed" || s.status === "completed" ? "bg-emerald-500/5 border-emerald-500/15" :
                "bg-white/[0.03] border-white/[0.06]"
              )}>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-bold text-white">{s.contract_title || "Contract"}</p>
                  <span className={cn("flex items-center gap-1 text-[10px] font-bold", st.text)}>
                    <Icon className="w-3 h-3" />{st.label}
                  </span>
                </div>
                <p className="text-[10px] text-white/40">{s.worker_name} &middot; {s.provider}</p>
                {s.sent_at && <p className="text-[9px] text-white/20 font-mono mt-1">Sent {new Date(s.sent_at).toLocaleDateString("en-GB")}</p>}
                {s.signed_at && <p className="text-[9px] text-emerald-600 font-mono">Signed {new Date(s.signed_at).toLocaleDateString("en-GB")}</p>}

                {needsSign && s.signing_url && (
                  <a href={s.signing_url} target="_blank" rel="noopener"
                    className="mt-2 w-full flex items-center justify-center gap-1.5 py-2.5 bg-[#C41E18] text-white rounded-xl text-xs font-bold active:scale-[0.98]">
                    <FileSignature className="w-3.5 h-3.5" />Sign Now
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
