import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { FileCheck, Clock, XCircle, CheckCircle2, Upload, Loader2, Filter } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const API = "/api";
function authHeaders() {
  const token = localStorage.getItem("apatris_jwt");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

interface WorkflowDoc {
  id: string; workerName: string; documentType: string; status: string;
  fileName: string | null; uploadedBy: string; uploadedAt: string;
  reviewerName: string | null; reviewedAt: string | null; reviewComment: string | null;
  rejectionReason: string | null; version: number; expiryDate: string | null;
}

interface Stats { uploaded: number; under_review: number; approved: number; rejected: number; resubmit_requested: number }

export default function DocumentWorkflow() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [docs, setDocs] = useState<WorkflowDoc[]>([]);
  const [stats, setStats] = useState<Stats>({ uploaded: 0, under_review: 0, approved: 0, rejected: 0, resubmit_requested: 0 });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  const load = () => {
    setLoading(true);
    Promise.all([
      fetch(`${API}/workflows/queue/pending`, { headers: authHeaders() }).then(r => r.json()),
      fetch(`${API}/workflows/stats`, { headers: authHeaders() }).then(r => r.json()),
    ]).then(([q, s]) => {
      setDocs(q.documents ?? []);
      setStats(s.stats ?? stats);
    }).catch(() => {
      setDocs([]);
      setStats({ uploaded: 0, under_review: 0, approved: 0, rejected: 0, resubmit_requested: 0 });
      toast({ title: "Error", description: "Failed to load documents", variant: "destructive" });
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const approve = async (id: string) => {
    await fetch(`${API}/workflows/${id}/approve`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ comment: "Approved" }) });
    load();
  };

  const reject = async (id: string) => {
    const reason = prompt(t("docWorkflow.rejectReason"));
    if (!reason) return;
    await fetch(`${API}/workflows/${id}/reject`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ reason }) });
    load();
  };

  const statusIcon: Record<string, React.ReactNode> = {
    uploaded: <Upload className="w-4 h-4 text-blue-400" />,
    under_review: <Clock className="w-4 h-4 text-amber-400" />,
    approved: <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
    rejected: <XCircle className="w-4 h-4 text-red-400" />,
  };

  const statusColor: Record<string, string> = {
    uploaded: "bg-blue-900/50 text-blue-400",
    under_review: "bg-amber-900/50 text-amber-400",
    approved: "bg-emerald-900/50 text-emerald-400",
    rejected: "bg-red-900/50 text-red-400",
    resubmit_requested: "bg-orange-900/50 text-orange-400",
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <FileCheck className="w-6 h-6 text-red-500" /> {t("docWorkflow.title")}
        </h1>
        <p className="text-sm text-slate-400 mt-1">{t("docWorkflow.subtitle")}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: t("docWorkflow.uploaded"), count: stats.uploaded, color: "text-blue-400" },
          { label: t("docWorkflow.underReview"), count: stats.under_review, color: "text-amber-400" },
          { label: t("docWorkflow.approved"), count: stats.approved, color: "text-emerald-400" },
          { label: t("docWorkflow.rejected"), count: stats.rejected, color: "text-red-400" },
          { label: t("docWorkflow.resubmit"), count: stats.resubmit_requested, color: "text-orange-400" },
        ].map(s => (
          <div key={s.label} className="bg-slate-800/50 rounded-xl p-3 text-center border border-slate-700/50">
            <div className={`text-2xl font-black ${s.color}`}>{s.count}</div>
            <div className="text-[10px] text-slate-500 font-bold uppercase mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Queue */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-500" /></div>
      ) : docs.length === 0 ? (
        <div className="bg-slate-800/50 rounded-xl p-8 text-center border border-slate-700/50">
          <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
          <p className="text-sm font-bold text-white">{t("docWorkflow.allReviewed")}</p>
          <p className="text-xs text-slate-400 mt-1">{t("docWorkflow.noPending")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {docs.map(doc => (
            <div key={doc.id} className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
              <div className="flex items-start gap-3">
                <div className="mt-0.5">{statusIcon[doc.status] ?? <FileCheck className="w-4 h-4 text-slate-400" />}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">{doc.workerName}</span>
                    <span className="text-xs text-slate-500">·</span>
                    <span className="text-xs font-semibold text-slate-300">{doc.documentType}</span>
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ml-auto ${statusColor[doc.status] ?? ""}`}>
                      {{ uploaded: t("docWorkflow.statusUploaded"), under_review: t("docWorkflow.statusUnderReview"), approved: t("docWorkflow.statusApproved"), rejected: t("docWorkflow.statusRejected"), resubmit_requested: t("docWorkflow.statusResubmit") }[doc.status] ?? doc.status.replace(/_/g, " ").toUpperCase()}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {doc.fileName ?? t("docWorkflow.noFile")} · v{doc.version} · {t("docWorkflow.uploadedBy")} {doc.uploadedBy} · {new Date(doc.uploadedAt).toLocaleDateString("en-GB")}
                    {doc.expiryDate ? ` · ${t("docWorkflow.expires")} ${new Date(doc.expiryDate).toLocaleDateString("en-GB")}` : ""}
                  </div>
                </div>
              </div>
              {(doc.status === "uploaded" || doc.status === "under_review") && (
                <div className="flex gap-2 mt-3 pl-7">
                  <button onClick={() => approve(doc.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-900/40 text-emerald-400 text-xs font-bold hover:bg-emerald-900/60 transition-colors">
                    <CheckCircle2 className="w-3.5 h-3.5" /> {t("docWorkflow.approveBtn")}
                  </button>
                  <button onClick={() => reject(doc.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-900/40 text-red-400 text-xs font-bold hover:bg-red-900/60 transition-colors">
                    <XCircle className="w-3.5 h-3.5" /> {t("docWorkflow.rejectBtn")}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
