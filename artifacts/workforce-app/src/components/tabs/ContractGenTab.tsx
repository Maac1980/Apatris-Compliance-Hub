import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FileSignature, Send, Download, CheckCircle2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

const API = import.meta.env.VITE_API_URL ?? "";

interface GenContract { id: string; worker_name: string; company_name: string; contract_type: string; status: string; generated_at: string; }

export function ContractGenTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["generated-contracts"],
    queryFn: async () => {
      const res = await fetch(`${API}api/contracts/generated`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ contracts: GenContract[] }>;
    },
  });

  const sendMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${API}api/contracts/generated/${id}/send`, { method: "POST", headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => { toast({ description: "Sent for signature" }); queryClient.invalidateQueries({ queryKey: ["generated-contracts"] }); },
  });

  const contracts = data?.contracts ?? [];

  return (
    <div className="p-4 min-h-full overflow-y-auto pb-24 bg-[#0c0c0e]">
      <div className="flex items-center gap-2 mb-4">
        <FileSignature className="w-5 h-5 text-[#C41E18]" />
        <h2 className="text-lg font-bold text-white">Contracts</h2>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><div className="animate-spin w-6 h-6 border-2 border-[#C41E18] border-t-transparent rounded-full" /></div>
      ) : contracts.length === 0 ? (
        <div className="text-center py-16 text-white/30"><FileSignature className="w-10 h-10 mx-auto mb-2 opacity-30" /><p className="text-sm font-semibold">No contracts</p></div>
      ) : (
        <div className="space-y-2">
          {contracts.map(c => {
            const isSigned = c.status === "signed";
            const isSent = c.status === "sent_for_signature";
            return (
              <div key={c.id} className={cn("rounded-2xl border p-3.5",
                isSigned ? "bg-emerald-500/5 border-emerald-500/15" :
                isSent ? "bg-blue-500/5 border-blue-500/15" :
                "bg-white/[0.03] border-white/[0.06]"
              )}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-bold text-white">{c.worker_name}</p>
                  <span className={cn("text-[9px] font-bold uppercase",
                    isSigned ? "text-emerald-400" : isSent ? "text-blue-400" : "text-slate-400"
                  )}>{c.status.replace(/_/g, " ")}</span>
                </div>
                <p className="text-[10px] text-white/40">{c.company_name} · {c.contract_type}</p>
                <p className="text-[9px] text-white/20 font-mono mt-1">{new Date(c.generated_at).toLocaleDateString("en-GB")}</p>
                {c.status === "draft" && (
                  <button onClick={() => sendMutation.mutate(c.id)} disabled={sendMutation.isPending}
                    className="mt-2 flex items-center gap-1 px-2.5 py-1.5 bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 rounded-xl text-[10px] font-bold active:scale-95 disabled:opacity-50">
                    <Send className="w-3 h-3" />Send for Signature
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
