import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { BarChart3, AlertTriangle, TrendingUp, Shield, Loader2, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const API = "/api";
function authHeaders() {
  const token = localStorage.getItem("apatris_jwt");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

interface HeatmapSite {
  site: string; total: number; compliant: number; warning: number;
  critical: number; nonCompliant: number; complianceRate: number;
  riskLevel: string;
}

interface PredictiveAlert {
  workerId: string; workerName: string; site: string;
  documentType: string; expiryDate: string; daysUntilExpiry: number;
  urgency: string;
}

export default function AnalyticsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [heatmap, setHeatmap] = useState<HeatmapSite[]>([]);
  const [alerts, setAlerts] = useState<PredictiveAlert[]>([]);
  const [summary, setSummary] = useState({ imminent: 0, upcoming: 0, future: 0, totalAlerts: 0, affectedWorkers: 0 });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"heatmap" | "predictive">("heatmap");

  useEffect(() => {
    Promise.all([
      fetch(`${API}/analytics/heatmap`, { headers: authHeaders() }).then(r => r.json()),
      fetch(`${API}/analytics/predictive`, { headers: authHeaders() }).then(r => r.json()),
    ]).then(([h, p]) => {
      setHeatmap(h.heatmap ?? []);
      setAlerts(p.alerts ?? []);
      setSummary(p.summary ?? summary);
    }).catch(() => {
      setHeatmap([]);
      setAlerts([]);
      setSummary({ imminent: 0, upcoming: 0, future: 0, totalAlerts: 0, affectedWorkers: 0 });
      toast({ title: "Error", description: "Failed to load analytics data", variant: "destructive" });
    }).finally(() => setLoading(false));
  }, []);

  const riskColor: Record<string, string> = {
    low: "bg-emerald-900/50 text-emerald-400 border-emerald-500/20",
    medium: "bg-amber-900/50 text-amber-400 border-amber-500/20",
    high: "bg-red-900/50 text-red-400 border-red-500/20",
  };

  const urgencyStyle: Record<string, string> = {
    imminent: "bg-red-900/50 text-red-400",
    upcoming: "bg-amber-900/50 text-amber-400",
    future: "bg-blue-900/50 text-blue-400",
  };

  const downloadReport = async () => {
    const res = await fetch(`${API}/analytics/report/pdf`, { headers: authHeaders() });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "compliance-report.pdf"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-red-500" /> {t("analytics.title")}
          </h1>
          <p className="text-sm text-slate-400 mt-1">{t("analytics.subtitle")}</p>
        </div>
        <button onClick={downloadReport}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-900/40 text-red-400 text-sm font-bold hover:bg-red-900/60 transition-colors">
          <Download className="w-4 h-4" /> {t("analytics.pdfReport")}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button onClick={() => setTab("heatmap")}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${tab === "heatmap" ? "bg-red-900/40 text-red-400" : "bg-slate-800 text-slate-400 hover:bg-slate-700"}`}>
          {t("analytics.heatmapTab")} ({heatmap.length})
        </button>
        <button onClick={() => setTab("predictive")}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${tab === "predictive" ? "bg-red-900/40 text-red-400" : "bg-slate-800 text-slate-400 hover:bg-slate-700"}`}>
          {t("analytics.predictiveTab")} ({summary.totalAlerts})
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-500" /></div>
      ) : tab === "heatmap" ? (
        <div className="space-y-3">
          {heatmap.map(site => (
            <div key={site.site} className={`rounded-xl p-4 border ${riskColor[site.riskLevel] ?? riskColor.low}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-white">{site.site}</span>
                <span className="text-2xl font-black">{site.complianceRate}%</span>
              </div>
              <div className="h-2 w-full bg-slate-700 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${site.complianceRate}%` }} />
              </div>
              <div className="flex gap-4 mt-2 text-[11px]">
                <span className="text-emerald-400">{site.compliant} {t("analytics.compliant")}</span>
                <span className="text-amber-400">{site.warning} {t("analytics.warnings")}</span>
                <span className="text-red-400">{site.critical} {t("analytics.critical")}</span>
                <span className="text-red-300">{site.nonCompliant} {t("analytics.expired")}</span>
                <span className="text-slate-500 ml-auto">{site.total} {t("analytics.total")}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-red-900/30 rounded-xl p-3 border border-red-500/20 text-center">
              <div className="text-2xl font-black text-red-400">{summary.imminent}</div>
              <div className="text-[10px] text-red-400/60 font-bold uppercase">{t("analytics.imminent")}</div>
            </div>
            <div className="bg-amber-900/30 rounded-xl p-3 border border-amber-500/20 text-center">
              <div className="text-2xl font-black text-amber-400">{summary.upcoming}</div>
              <div className="text-[10px] text-amber-400/60 font-bold uppercase">{t("analytics.upcoming")}</div>
            </div>
            <div className="bg-blue-900/30 rounded-xl p-3 border border-blue-500/20 text-center">
              <div className="text-2xl font-black text-blue-400">{summary.future}</div>
              <div className="text-[10px] text-blue-400/60 font-bold uppercase">{t("analytics.future")}</div>
            </div>
          </div>

          {alerts.slice(0, 20).map((a, i) => (
            <div key={i} className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/50 flex items-center gap-3">
              <AlertTriangle className={`w-4 h-4 shrink-0 ${a.urgency === "imminent" ? "text-red-400" : a.urgency === "upcoming" ? "text-amber-400" : "text-blue-400"}`} />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-bold text-white">{a.workerName}</span>
                <div className="text-xs text-slate-400">{a.documentType} · {a.site} · {t("analytics.expires")} {new Date(a.expiryDate).toLocaleDateString("en-GB")}</div>
              </div>
              <div className="text-right shrink-0">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${urgencyStyle[a.urgency] ?? ""}`}>
                  {a.daysUntilExpiry}d
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
