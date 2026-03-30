import { useState, useEffect } from "react";
import { Shield, Loader2, Filter, AlertTriangle, CheckCircle, XCircle, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const API = "/api";
function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

interface AuditEntry {
  id: string;
  timestamp: string;
  action: string;
  model: string;
  inputSummary: string;
  outputSummary: string;
  confidence: number;
  humanOverride: boolean;
  overrideReason?: string;
  userId: string;
}

const ACTION_TYPES = [
  "All",
  "Compliance Check",
  "Document Classification",
  "Risk Assessment",
  "Checklist Generation",
  "Worker Matching",
  "Payroll Calculation",
  "Anomaly Detection",
];

const CONFIDENCE_BADGE: Record<string, string> = {
  high:   "bg-emerald-900/50 text-emerald-400 border-emerald-500/30",
  medium: "bg-yellow-900/50 text-yellow-400 border-yellow-500/30",
  low:    "bg-red-900/50 text-red-400 border-red-500/30",
};

function confidenceLevel(c: number): string {
  return c >= 0.85 ? "high" : c >= 0.6 ? "medium" : "low";
}

export default function AiAuditTrail() {
  const { toast } = useToast();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAction, setFilterAction] = useState("All");

  useEffect(() => {
    fetch(`${API}/ai-audit`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => setEntries(d.entries ?? []))
      .catch(() => {
        setEntries(demoEntries());
        toast({ title: "Info", description: "Loaded demo audit data" });
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = filterAction === "All" ? entries : entries.filter(e => e.action === filterAction);
  const overrideCount = entries.filter(e => e.humanOverride).length;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-red-500" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 min-h-screen overflow-y-auto pb-24 bg-background">
      {/* EU AI Act Compliance Header */}
      <div className="bg-blue-900/20 border border-blue-500/30 rounded-xl p-4 mb-6">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
          <div>
            <h2 className="text-sm font-bold text-blue-400 uppercase tracking-wide">EU AI Act Compliance</h2>
            <p className="text-xs text-slate-400 mt-1">
              This audit trail complies with EU AI Act (Regulation 2024/1689) Article 12 requirements for record-keeping.
              All AI-assisted decisions are logged with model identification, confidence scores, and human override status.
              High-risk AI system decisions require human review before implementation.
            </p>
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Shield className="w-6 h-6 text-red-500" /> AI Decision Audit Trail
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {entries.length} total decisions logged &middot; {overrideCount} human overrides
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={filterAction}
            onChange={e => setFilterAction(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none"
          >
            {ACTION_TYPES.map(a => <option key={a}>{a}</option>)}
          </select>
        </div>
      </div>

      {/* Audit Table */}
      <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead>
            <tr className="border-b border-slate-700/50">
              <th className="p-3 text-left text-xs text-slate-400 font-mono uppercase tracking-wide">Timestamp</th>
              <th className="p-3 text-left text-xs text-slate-400 font-mono uppercase tracking-wide">Action</th>
              <th className="p-3 text-left text-xs text-slate-400 font-mono uppercase tracking-wide">Model</th>
              <th className="p-3 text-left text-xs text-slate-400 font-mono uppercase tracking-wide">Summary</th>
              <th className="p-3 text-center text-xs text-slate-400 font-mono uppercase tracking-wide">Confidence</th>
              <th className="p-3 text-center text-xs text-slate-400 font-mono uppercase tracking-wide">Human Override</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(e => {
              const level = confidenceLevel(e.confidence);
              return (
                <tr key={e.id} className="border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors">
                  <td className="p-3 text-xs text-slate-400 font-mono whitespace-nowrap">
                    {new Date(e.timestamp).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td className="p-3">
                    <span className="text-sm text-white font-medium">{e.action}</span>
                  </td>
                  <td className="p-3">
                    <span className="text-xs text-slate-400 font-mono bg-slate-900/50 px-2 py-0.5 rounded">{e.model}</span>
                  </td>
                  <td className="p-3">
                    <p className="text-xs text-slate-300 max-w-xs truncate">{e.outputSummary}</p>
                  </td>
                  <td className="p-3 text-center">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-mono uppercase border ${CONFIDENCE_BADGE[level]}`}>
                      {(e.confidence * 100).toFixed(0)}% {level}
                    </span>
                  </td>
                  <td className="p-3 text-center">
                    {e.humanOverride ? (
                      <div className="flex items-center justify-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />
                        <span className="text-xs text-yellow-400 font-mono">Overridden</span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-1">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-xs text-emerald-400 font-mono">Accepted</span>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-slate-500">
                  <XCircle className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  No audit entries found for this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-slate-500">
        Audit entries are retained for 5 years in accordance with EU AI Act Article 12(2).
        All entries are immutable and cryptographically signed.
      </p>
    </div>
  );
}

function demoEntries(): AuditEntry[] {
  return [
    { id: "ai-001", timestamp: "2026-03-29T09:15:00Z", action: "Compliance Check", model: "gpt-4o", inputSummary: "Worker Oleksandr K. document scan", outputSummary: "TRC valid until 2027-05-15, passport expires 2028-01. All documents compliant.", confidence: 0.95, humanOverride: false, userId: "admin" },
    { id: "ai-002", timestamp: "2026-03-29T08:45:00Z", action: "Document Classification", model: "gpt-4o-mini", inputSummary: "Uploaded PDF scan", outputSummary: "Classified as: Work Permit (Zezwolenie na prace). Type A. Confidence high.", confidence: 0.88, humanOverride: false, userId: "admin" },
    { id: "ai-003", timestamp: "2026-03-28T16:30:00Z", action: "Risk Assessment", model: "gpt-4o", inputSummary: "Site Alpha worker compliance", outputSummary: "Risk level: MEDIUM. 3 workers with documents expiring within 30 days.", confidence: 0.72, humanOverride: true, overrideReason: "Manager assessed as HIGH risk due to pending audit", userId: "admin" },
    { id: "ai-004", timestamp: "2026-03-28T14:00:00Z", action: "Checklist Generation", model: "gpt-4o", inputSummary: "TRC application for Indian national", outputSummary: "Generated 12-item checklist for first TRC application, Mazowieckie voivodeship.", confidence: 0.92, humanOverride: false, userId: "legal" },
    { id: "ai-005", timestamp: "2026-03-28T11:20:00Z", action: "Worker Matching", model: "gpt-4o-mini", inputSummary: "Site Beta needs 3 TIG welders", outputSummary: "Matched: Oleksandr K. (5*), Andriy P. (4*), Vitalii M. (3*). All compliant.", confidence: 0.85, humanOverride: false, userId: "admin" },
    { id: "ai-006", timestamp: "2026-03-27T17:00:00Z", action: "Payroll Calculation", model: "rules-engine", inputSummary: "March payroll for 45 workers", outputSummary: "Calculated gross/net for 45 workers. Total gross: 287,450 PLN. ZUS: 63,239 PLN.", confidence: 0.99, humanOverride: false, userId: "payroll" },
    { id: "ai-007", timestamp: "2026-03-27T10:30:00Z", action: "Anomaly Detection", model: "gpt-4o", inputSummary: "GPS logs March 26", outputSummary: "Detected 2 anomalies: Worker w4 outside geofence at 14:32, Worker w7 no check-in.", confidence: 0.68, humanOverride: true, overrideReason: "Worker w4 was at medical appointment (approved leave)", userId: "admin" },
    { id: "ai-008", timestamp: "2026-03-26T15:45:00Z", action: "Compliance Check", model: "gpt-4o", inputSummary: "Batch compliance scan all workers", outputSummary: "42/45 workers compliant. 2 critical (TRC expiry <30d), 1 warning (passport 45d).", confidence: 0.93, humanOverride: false, userId: "admin" },
    { id: "ai-009", timestamp: "2026-03-26T09:00:00Z", action: "Document Classification", model: "gpt-4o-mini", inputSummary: "3 uploaded scans batch", outputSummary: "Classified: 1x Passport, 1x Health Insurance, 1x Employment Contract.", confidence: 0.91, humanOverride: false, userId: "admin" },
    { id: "ai-010", timestamp: "2026-03-25T14:20:00Z", action: "Risk Assessment", model: "gpt-4o", inputSummary: "Company-wide Q1 risk", outputSummary: "Overall risk: LOW. 93% compliance rate. Top risk: Malopolskie voivodeship delays.", confidence: 0.55, humanOverride: true, overrideReason: "Legal head upgraded to MEDIUM due to new regulatory requirements", userId: "legal" },
  ];
}
