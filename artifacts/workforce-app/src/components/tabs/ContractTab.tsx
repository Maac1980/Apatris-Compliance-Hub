import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { FileSignature, Download, Loader2, FileText, ChevronRight, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useTranslation } from "react-i18next";

const API = "/api";

interface Contract {
  id: string;
  worker_name: string;
  contract_type: string;
  status: string;
  start_date: string;
  end_date: string | null;
  poa_name: string | null;
  hourly_rate: number | null;
  created_at: string;
}

const STATUS_STYLE: Record<string, { bg: string; text: string; icon: React.ElementType }> = {
  draft: { bg: "bg-white/[0.06]", text: "text-white/50", icon: FileText },
  pending_signature: { bg: "bg-amber-500/10", text: "text-amber-400", icon: Clock },
  active: { bg: "bg-emerald-500/10", text: "text-emerald-400", icon: CheckCircle2 },
  terminated: { bg: "bg-red-500/10", text: "text-red-400", icon: AlertCircle },
  expired: { bg: "bg-red-500/10", text: "text-red-300", icon: AlertCircle },
};

const TYPE_LABEL: Record<string, string> = {
  umowa_zlecenie: "Umowa Zlecenie",
  umowa_o_prace: "Umowa o Prac\u0119",
  b2b: "B2B",
  aneks: "Aneks",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Szkic",
  pending_signature: "Do podpisu",
  active: "Aktywna",
  terminated: "Rozwi\u0105zana",
  expired: "Wygas\u0142a",
};

export function ContractTab() {
  const { role, user } = useAuth();
  const { t } = useTranslation();
  const jwt = user?.jwt ?? "";
  const isExecutive = role === "Executive" || role === "LegalHead";

  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    if (!jwt) return;
    setLoading(true);
    fetch(`${API}/contracts`, { headers: { Authorization: `Bearer ${jwt}` } })
      .then(r => r.json())
      .then(d => setContracts(d.contracts ?? []))
      .catch(() => setContracts([]))
      .finally(() => setLoading(false));
  }, [jwt]);

  const filtered = filter === "all" ? contracts : contracts.filter(c => c.status === filter);

  const downloadPdf = async (id: string) => {
    try {
      const res = await fetch(`${API}/contracts/${id}/pdf`, { headers: { Authorization: `Bearer ${jwt}` } });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "contract.pdf"; a.click();
      URL.revokeObjectURL(url);
    } catch {}
  };

  const statusCounts = {
    all: contracts.length,
    active: contracts.filter(c => c.status === "active").length,
    pending_signature: contracts.filter(c => c.status === "pending_signature").length,
    draft: contracts.filter(c => c.status === "draft").length,
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="px-4 py-5 space-y-5 pb-28">
      <div className="flex items-center gap-2 ml-1">
        <FileSignature className="w-4 h-4 text-indigo-400" />
        <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground font-heading">
          {isExecutive ? "Contracts" : "My Contract"}
        </h2>
        <span className="ml-auto text-[10px] font-black bg-indigo-500/15 text-indigo-400 px-2 py-0.5 rounded-full">{contracts.length}</span>
      </div>

      {/* Filter pills — Executive only */}
      {isExecutive && (
        <div className="flex gap-1.5 flex-wrap">
          {(["all", "active", "pending_signature", "draft"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={cn(
                "px-3 py-1.5 rounded-full text-[10px] font-bold transition-all",
                filter === f ? "bg-indigo-500/15 text-indigo-400" : "bg-white/[0.04] text-muted-foreground"
              )}>
              {f === "all" ? "All" : STATUS_LABEL[f] ?? f} ({statusCounts[f] ?? 0})
            </button>
          ))}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="premium-card rounded-2xl p-3 text-center">
          <div className="text-xl font-black text-emerald-400 font-heading">{statusCounts.active}</div>
          <div className="text-[9px] text-muted-foreground font-semibold uppercase mt-0.5">Aktywne</div>
        </div>
        <div className="premium-card rounded-2xl p-3 text-center">
          <div className="text-xl font-black text-amber-400 font-heading">{statusCounts.pending_signature}</div>
          <div className="text-[9px] text-muted-foreground font-semibold uppercase mt-0.5">Do podpisu</div>
        </div>
        <div className="premium-card rounded-2xl p-3 text-center">
          <div className="text-xl font-black text-white/50 font-heading">{statusCounts.draft}</div>
          <div className="text-[9px] text-muted-foreground font-semibold uppercase mt-0.5">Szkice</div>
        </div>
      </div>

      {/* Contract list */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="premium-card rounded-2xl p-8 text-center">
          <FileText className="w-10 h-10 text-white/15 mx-auto mb-3" />
          <p className="text-sm font-semibold text-foreground">No contracts found</p>
          <p className="text-xs text-muted-foreground mt-1">Contracts will appear here when created</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map(c => {
            const style = STATUS_STYLE[c.status] ?? STATUS_STYLE.draft;
            const StatusIcon = style.icon;
            return (
              <div key={c.id} className="premium-card rounded-2xl p-4">
                <div className="flex items-start gap-3">
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", style.bg)}>
                    <StatusIcon className={cn("w-5 h-5", style.text)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-foreground truncate">{c.worker_name}</span>
                      <span className={cn("text-[9px] font-black px-2 py-0.5 rounded-full ml-auto shrink-0", style.bg, style.text)}>
                        {STATUS_LABEL[c.status]?.toUpperCase() ?? c.status.toUpperCase()}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {TYPE_LABEL[c.contract_type] ?? c.contract_type}
                      {" \u00b7 "}
                      {new Date(c.start_date).toLocaleDateString("pl-PL")}
                      {c.end_date ? ` \u2192 ${new Date(c.end_date).toLocaleDateString("pl-PL")}` : ""}
                    </div>
                    {c.poa_name && <div className="text-[10px] text-muted-foreground mt-0.5">Podpisa\u0142: {c.poa_name}</div>}
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button onClick={() => downloadPdf(c.id)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-indigo-500/10 text-indigo-400 text-xs font-bold hover:bg-indigo-500/15 transition-all active:scale-95">
                    <Download className="w-3.5 h-3.5" /> Pobierz PDF
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
