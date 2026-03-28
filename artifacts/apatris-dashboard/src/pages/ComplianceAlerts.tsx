import React, { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, ShieldAlert, AlertTriangle, CheckCircle2, Clock,
  Plus, Trash2, RefreshCcw, Loader2, XCircle, X
} from "lucide-react";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

type ComplianceStatus = "GREEN" | "YELLOW" | "RED" | "EXPIRED";

interface DocumentRecord {
  id: string;
  workerName: string;
  workerId: string;
  documentType: string;
  issueDate: string;
  expiryDate: string;
  daysUntilExpiry: number;
  status: ComplianceStatus;
}

interface Summary {
  total: number;
  green: number;
  yellow: number;
  red: number;
  expired: number;
}

const STATUS_CONFIG: Record<ComplianceStatus, { label: string; bg: string; border: string; text: string; badge: string; icon: React.ReactNode }> = {
  GREEN: {
    label: "Compliant",
    bg: "bg-green-900/20",
    border: "border-green-600/40",
    text: "text-green-400",
    badge: "bg-green-900/50 text-green-300 border-green-600/50",
    icon: <CheckCircle2 className="w-4 h-4" />,
  },
  YELLOW: {
    label: "Warning",
    bg: "bg-yellow-900/20",
    border: "border-yellow-500/40",
    text: "text-yellow-400",
    badge: "bg-yellow-900/50 text-yellow-300 border-yellow-500/50",
    icon: <AlertTriangle className="w-4 h-4" />,
  },
  RED: {
    label: "Critical",
    bg: "bg-red-900/20",
    border: "border-red-500/40",
    text: "text-red-400",
    badge: "bg-red-900/50 text-red-300 border-red-500/50",
    icon: <ShieldAlert className="w-4 h-4" />,
  },
  EXPIRED: {
    label: "Expired",
    bg: "bg-red-950/40",
    border: "border-red-700/60",
    text: "text-red-300",
    badge: "bg-red-950/70 text-red-200 border-red-700/70",
    icon: <XCircle className="w-4 h-4" />,
  },
};

const DOC_TYPES = ["TRC", "Passport", "BHP", "Medical", "Contract", "Work Permit", "Visa", "Other"];

function AddDocumentModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (alertFired: boolean, doc: DocumentRecord) => void;
}) {
  const [form, setForm] = useState({
    workerName: "",
    documentType: "TRC",
    issueDate: "",
    expiryDate: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    if (!form.workerName.trim() || !form.expiryDate) {
      setError("Worker name and expiry date are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/documents`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(d.error || "Failed to save");
      }
      const data = await res.json() as { document: DocumentRecord; alertFired: boolean };
      onSaved(data.alertFired, data.document);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-slate-800 border border-slate-600 rounded-2xl w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-white uppercase tracking-wider">Add Document</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">Worker Name</label>
            <input
              type="text"
              value={form.workerName}
              onChange={(e) => setForm((f) => ({ ...f, workerName: e.target.value }))}
              placeholder="Full name"
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-red-500 transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">Document Type</label>
            <select
              value={form.documentType}
              onChange={(e) => setForm((f) => ({ ...f, documentType: e.target.value }))}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-red-500 transition-all appearance-none"
            >
              {DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">Issue Date</label>
            <input
              type="date"
              value={form.issueDate}
              onChange={(e) => setForm((f) => ({ ...f, issueDate: e.target.value }))}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-red-500 transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">Expiry Date *</label>
            <input
              type="date"
              value={form.expiryDate}
              onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-red-500 transition-all"
            />
          </div>
        </div>

        {error && (
          <p className="mt-3 text-red-400 text-sm">{error}</p>
        )}

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-slate-600 text-gray-400 hover:text-white rounded-lg text-sm font-bold uppercase tracking-wider transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {saving ? "Saving..." : "Add Document"}
          </button>
        </div>
      </div>
    </div>
  );
}

interface InstantAlert {
  level: "YELLOW" | "RED" | "EXPIRED";
  workerName: string;
  documentType: string;
  daysUntilExpiry: number;
}

export default function ComplianceAlerts() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [filterStatus, setFilterStatus] = useState<ComplianceStatus | "ALL">("ALL");
  const [addOpen, setAddOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState("");
  const [instantAlert, setInstantAlert] = useState<InstantAlert | null>(null);

  const { data, isLoading, error, refetch } = useQuery<{ documents: DocumentRecord[]; summary: Summary }>({
    queryKey: ["documents"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/documents`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to fetch documents");
      return res.json();
    },
    staleTime: 30_000,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/documents/${id}`, { method: "DELETE", headers: authHeaders() });
      if (!res.ok) throw new Error("Delete failed");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["documents"] }),
  });

  async function runScan() {
    setScanning(true);
    setScanMsg("");
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/documents/scan`, { headers: authHeaders() });
      const d = await res.json() as { recentAlerts?: unknown[] };
      setScanMsg(`Scan complete — ${d.recentAlerts?.length ?? 0} alert(s) generated. Check server logs.`);
      refetch();
    } catch {
      setScanMsg("Scan failed — check server logs.");
    } finally {
      setScanning(false);
      setTimeout(() => setScanMsg(""), 5000);
    }
  }

  const documents = data?.documents ?? [];
  const summary = data?.summary ?? { total: 0, green: 0, yellow: 0, red: 0, expired: 0 };

  const filtered = filterStatus === "ALL"
    ? documents
    : documents.filter((d) => d.status === filterStatus);

  const criticalCount = summary.red + summary.expired;

  return (
    <div className="app-shell-page h-screen bg-slate-900 text-white flex flex-col overflow-hidden">

      {/* Header */}
      <header
        className="h-16 border-b border-slate-700 bg-slate-900/95 backdrop-blur-xl sticky top-0 z-30 px-6 flex items-center justify-between"
        style={{ boxShadow: "0 1px 0 rgba(196,30,24,0.08), 0 4px 20px rgba(0,0,0,0.3)" }}
      >
        <div className="flex items-center gap-4">
          <button
            onClick={() => setLocation("/")}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm font-mono"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <div className="w-px h-6 bg-white/10" />
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-red-500" />
            <h1 className="text-base font-bold tracking-widest uppercase text-white">Compliance Alerts</h1>
          </div>
          {criticalCount > 0 && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-600 text-white text-xs font-bold animate-pulse">
              {criticalCount} CRITICAL
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={runScan}
            disabled={scanning}
            className="flex items-center gap-2 px-3 py-1.5 border border-slate-600 text-gray-400 hover:text-white hover:border-slate-400 rounded-lg text-xs font-mono font-bold uppercase tracking-wide transition-all"
          >
            {scanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCcw className="w-3.5 h-3.5" />}
            Run Scan
          </button>
          <button
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-mono font-bold uppercase tracking-wide transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Document
          </button>
          <div className="w-px h-6 bg-white/10" />
          <div className="text-right hidden md:block">
            <p className="text-sm font-bold text-white leading-tight">{user?.name}</p>
            <p className="text-xs text-red-500 font-mono">{user?.role}</p>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-6">

        {/* Instant alert banner — fires when a document is manually added in warning/critical zone */}
        {instantAlert && (
          <div className={`flex items-start gap-4 p-4 rounded-xl border ${
            instantAlert.level === "YELLOW"
              ? "bg-yellow-900/30 border-yellow-500/50 text-yellow-300"
              : "bg-red-900/30 border-red-500/50 text-red-300"
          }`}>
            <div className="mt-0.5">
              {instantAlert.level === "YELLOW"
                ? <AlertTriangle className="w-5 h-5 text-yellow-400" />
                : <ShieldAlert className="w-5 h-5 text-red-400" />}
            </div>
            <div className="flex-1">
              <p className="font-bold text-sm uppercase tracking-wider">
                {instantAlert.level === "EXPIRED"
                  ? "⛔ Document Expired — Alert Sent"
                  : instantAlert.level === "RED"
                  ? "🔴 Critical Zone — Alert Sent to Administrators"
                  : "🟡 Warning Zone — Alert Logged"}
              </p>
              <p className="text-xs mt-1 opacity-80">
                <strong>{instantAlert.workerName}</strong> · {instantAlert.documentType} ·{" "}
                {instantAlert.level === "EXPIRED"
                  ? "Document has expired"
                  : `${instantAlert.daysUntilExpiry} days remaining`}
                {" "}— Manish & Akshay have been notified.
              </p>
            </div>
            <button onClick={() => setInstantAlert(null)} className="opacity-60 hover:opacity-100 transition-opacity">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Scan message */}
        {scanMsg && (
          <div className="p-3 rounded-lg bg-slate-800 border border-slate-600 text-gray-300 text-sm font-mono">
            {scanMsg}
          </div>
        )}

        {/* Summary stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Compliant", count: summary.green, color: "text-green-400", bg: "bg-green-900/20 border-green-700/40", status: "GREEN" as const },
            { label: "Warning ≤60d", count: summary.yellow, color: "text-yellow-400", bg: "bg-yellow-900/20 border-yellow-700/40", status: "YELLOW" as const },
            { label: "Critical ≤30d", count: summary.red, color: "text-red-400", bg: "bg-red-900/20 border-red-700/40", status: "RED" as const },
            { label: "Expired", count: summary.expired, color: "text-red-300", bg: "bg-red-950/30 border-red-800/50", status: "EXPIRED" as const },
          ].map(({ label, count, color, bg, status }) => (
            <button
              key={status}
              onClick={() => setFilterStatus(filterStatus === status ? "ALL" : status)}
              className={`${bg} border rounded-xl p-4 text-left transition-all hover:scale-[1.02] ${filterStatus === status ? "ring-2 ring-white/20" : ""}`}
            >
              <p className={`text-3xl font-bold ${color}`}>{count}</p>
              <p className="text-gray-400 text-xs font-mono uppercase tracking-wider mt-1">{label}</p>
            </button>
          ))}
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-3 flex-wrap">
          {(["ALL", "RED", "EXPIRED", "YELLOW", "GREEN"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold uppercase tracking-wider border transition-all ${
                filterStatus === s
                  ? "bg-red-600 border-red-600 text-white"
                  : "border-slate-600 text-gray-400 hover:text-white hover:border-slate-400"
              }`}
            >
              {s === "ALL" ? `All (${summary.total})` : s}
            </button>
          ))}
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-24 gap-3 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="font-mono text-sm">Loading compliance data...</span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="p-4 rounded-xl bg-red-900/30 border border-red-500/40 text-red-400 text-sm">
            {error instanceof Error ? error.message : "Failed to load documents"}
          </div>
        )}

        {/* Document grid */}
        {!isLoading && !error && (
          <>
            {filtered.length === 0 ? (
              <div className="text-center py-20 text-gray-500 font-mono text-sm">
                No documents in this category.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filtered.map((doc) => {
                  const cfg = STATUS_CONFIG[doc.status];
                  return (
                    <div
                      key={doc.id}
                      className={`relative ${cfg.bg} border ${cfg.border} rounded-xl p-4 flex flex-col gap-3 group transition-all hover:scale-[1.01]`}
                    >
                      {/* Delete button */}
                      <button
                        onClick={() => deleteMutation.mutate(doc.id)}
                        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-all"
                        title="Remove document"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>

                      {/* Status badge */}
                      <div className="flex items-center justify-between">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-bold uppercase tracking-wider ${cfg.badge}`}>
                          {cfg.icon}
                          {cfg.label}
                        </span>
                        {(doc.status === "RED" || doc.status === "EXPIRED") && (
                          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        )}
                      </div>

                      {/* Worker & document */}
                      <div>
                        <p className="text-white font-bold text-sm leading-tight truncate">{doc.workerName}</p>
                        <p className="text-gray-400 text-xs font-mono mt-0.5">{doc.documentType}</p>
                      </div>

                      {/* Days counter */}
                      <div className={`text-center rounded-lg py-2 ${cfg.bg} border ${cfg.border}`}>
                        {doc.status === "EXPIRED" ? (
                          <p className="text-red-300 font-bold text-lg">EXPIRED</p>
                        ) : (
                          <>
                            <p className={`font-bold text-2xl ${cfg.text}`}>{doc.daysUntilExpiry}</p>
                            <p className="text-gray-500 text-xs font-mono">days remaining</p>
                          </>
                        )}
                      </div>

                      {/* Dates */}
                      <div className="space-y-1">
                        {doc.issueDate && (
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-500">Issued</span>
                            <span className="text-gray-400 font-mono">{doc.issueDate}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-500">Expires</span>
                          <span className={`font-mono font-bold ${cfg.text}`}>{doc.expiryDate}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>

      {addOpen && (
        <AddDocumentModal
          onClose={() => setAddOpen(false)}
          onSaved={(alertFired, doc) => {
            queryClient.invalidateQueries({ queryKey: ["documents"] });
            if (alertFired) {
              setInstantAlert({
                level: doc.status as "YELLOW" | "RED" | "EXPIRED",
                workerName: doc.workerName,
                documentType: doc.documentType,
                daysUntilExpiry: doc.daysUntilExpiry,
              });
            }
          }}
        />
      )}
    </div>
  );
}
