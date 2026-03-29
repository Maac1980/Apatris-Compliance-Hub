import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { FileSignature, Plus, Download, Users, ChevronRight, Loader2, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const API = "/api";
function authHeaders() {
  const token = localStorage.getItem("apatris_jwt");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

interface Contract {
  id: string; worker_name: string; contract_type: string; status: string;
  start_date: string; end_date: string | null; poa_name: string | null;
  hourly_rate: number | null; monthly_salary: number | null; created_at: string;
}

interface POA {
  id: string; full_name: string; position: string; email: string;
  is_active: boolean; can_sign_zlecenie: boolean; can_sign_o_prace: boolean;
}

export default function ContractHub() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [poas, setPoas] = useState<POA[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"contracts" | "poa">("contracts");

  useEffect(() => {
    Promise.all([
      fetch(`${API}/contracts`, { headers: authHeaders() }).then(r => r.json()),
      fetch(`${API}/poa`, { headers: authHeaders() }).then(r => r.json()),
    ]).then(([c, p]) => {
      setContracts(c.contracts ?? []);
      setPoas(p.signatories ?? []);
    }).catch(() => {
      setContracts([]);
      setPoas([]);
      toast({ title: "Error", description: "Failed to load contracts", variant: "destructive" });
    }).finally(() => setLoading(false));
  }, []);

  const statusColor: Record<string, string> = {
    draft: "bg-slate-700 text-slate-300",
    pending_signature: "bg-amber-900/50 text-amber-400",
    active: "bg-emerald-900/50 text-emerald-400",
    terminated: "bg-red-900/50 text-red-400",
    expired: "bg-red-900/50 text-red-300",
  };

  const typeLabel: Record<string, string> = {
    umowa_zlecenie: t("contractHub.umowaZlecenie"),
    umowa_o_prace: t("contractHub.umowaOPrace"),
    b2b: "B2B",
    aneks: t("contractHub.aneks"),
  };

  const downloadPdf = async (id: string) => {
    const res = await fetch(`${API}/contracts/${id}/pdf`, { headers: authHeaders() });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "contract.pdf"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <FileSignature className="w-6 h-6 text-red-500" /> {t("contractHub.title")}
          </h1>
          <p className="text-sm text-slate-400 mt-1">{t("contractHub.subtitle")}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {(["contracts", "poa"] as const).map(tb => (
          <button key={tb} onClick={() => setTab(tb)}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${tab === tb ? "bg-red-900/40 text-red-400" : "bg-slate-800 text-slate-400 hover:bg-slate-700"}`}>
            {tb === "contracts" ? `${t("contractHub.contractsTab")} (${contracts.length})` : `${t("contractHub.poaTab")} (${poas.length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-500" /></div>
      ) : tab === "contracts" ? (
        <div className="space-y-3">
          {contracts.length === 0 ? (
            <div className="bg-slate-800/50 rounded-xl p-8 text-center border border-slate-700/50">
              <FileText className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="text-sm text-slate-400">{t("contractHub.noContracts")}</p>
            </div>
          ) : contracts.map(c => (
            <div key={c.id} className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 flex items-center gap-4 hover:bg-slate-800 transition-colors">
              <div className="w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center shrink-0">
                <FileSignature className="w-5 h-5 text-slate-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-white truncate">{c.worker_name}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusColor[c.status] ?? "bg-slate-700 text-slate-300"}`}>
                    {{ draft: t("contractHub.draft"), pending_signature: t("contractHub.pendingSignature"), active: t("contractHub.active"), terminated: t("contractHub.terminated"), expired: t("contractHub.expired") }[c.status] ?? c.status.replace("_", " ").toUpperCase()}
                  </span>
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  {typeLabel[c.contract_type] ?? c.contract_type} · {new Date(c.start_date).toLocaleDateString("en-GB")}
                  {c.end_date ? ` → ${new Date(c.end_date).toLocaleDateString("en-GB")}` : ` (${t("contractHub.indefinite")})`}
                  {c.poa_name ? ` · ${t("contractHub.signedBy")} ${c.poa_name}` : ""}
                </div>
              </div>
              <button onClick={() => downloadPdf(c.id)} className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors" title={t("contractHub.downloadPdf")}>
                <Download className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {poas.length === 0 ? (
            <div className="bg-slate-800/50 rounded-xl p-8 text-center border border-slate-700/50">
              <Users className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="text-sm text-slate-400">{t("contractHub.noPoa")}</p>
            </div>
          ) : poas.map(p => (
            <div key={p.id} className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-indigo-900/50 border border-indigo-500/30 flex items-center justify-center shrink-0">
                <span className="text-sm font-bold text-indigo-400">{p.full_name.charAt(0)}</span>
              </div>
              <div className="flex-1">
                <span className="text-sm font-bold text-white">{p.full_name}</span>
                <div className="text-xs text-slate-400">{p.position}{p.email ? ` · ${p.email}` : ""}</div>
                <div className="flex gap-1.5 mt-1">
                  {p.can_sign_zlecenie && <span className="text-[9px] bg-blue-900/50 text-blue-400 px-1.5 py-0.5 rounded">Zlecenie</span>}
                  {p.can_sign_o_prace && <span className="text-[9px] bg-green-900/50 text-green-400 px-1.5 py-0.5 rounded">o Prace</span>}
                </div>
              </div>
              <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${p.is_active ? "bg-emerald-900/50 text-emerald-400" : "bg-slate-700 text-slate-400"}`}>
                {p.is_active ? t("contractHub.activeStatus") : t("contractHub.inactiveStatus")}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
