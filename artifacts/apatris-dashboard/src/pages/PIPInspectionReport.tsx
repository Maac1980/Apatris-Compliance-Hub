/**
 * PIP Inspection Report — one-click compliance proof for inspections.
 * Print-ready, B&W accessible, formal layout.
 */

import React, { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { authHeaders, BASE, extractList } from "@/lib/api";
import {
  Shield, Printer, Loader2, FileText, AlertTriangle, CheckCircle2,
  XOctagon, HelpCircle, Clock,
} from "lucide-react";

// ═══ TYPES ══════════════════════════════════════════════════════════════════

interface WorkerRow {
  workerName: string;
  nationality: string | null;
  assignedSite: string | null;
  legalStatus: string | null;
  legalBasis: string | null;
  riskLevel: string | null;
  permitExpiryDate: string | null;
  daysUntilExpiry: number | null;
  filingDate: string | null;
  evidenceCount: number;
  evidenceVerified: boolean;
  authorityPackStatus: string | null;
  authorityPackApproved: boolean;
  warnings: string[];
}

interface Summary {
  totalWorkers: number;
  valid: number;
  protectedPending: number;
  reviewRequired: number;
  expiredNotProtected: number;
  noPermit: number;
  expiringSoon: number;
  criticalRisk: number;
  highRisk: number;
  missingEvidence: number;
  unapprovedPacks: number;
}

interface Report {
  id?: string;
  generatedAt: string;
  siteId: string | null;
  readinessScore: number;
  readinessLevel: string;
  summary: Summary;
  workers: WorkerRow[];
}

// ═══ STATUS SYMBOLS (B&W accessible) ════════════════════════════════════════

const STATUS_SYMBOL: Record<string, { symbol: string; label: string; screenColor: string }> = {
  VALID:                 { symbol: "✓", label: "VALID",     screenColor: "text-emerald-400" },
  EXPIRING_SOON:         { symbol: "⚠", label: "EXPIRING",  screenColor: "text-amber-400" },
  PROTECTED_PENDING:     { symbol: "◉", label: "PROTECTED", screenColor: "text-blue-400" },
  REVIEW_REQUIRED:       { symbol: "?", label: "REVIEW",    screenColor: "text-orange-400" },
  EXPIRED_NOT_PROTECTED: { symbol: "✗", label: "EXPIRED",   screenColor: "text-red-400" },
  NO_PERMIT:             { symbol: "✗", label: "NO PERMIT", screenColor: "text-red-400" },
  NO_SNAPSHOT:           { symbol: "—", label: "NO DATA",   screenColor: "text-slate-500" },
};

const RISK_SYMBOL: Record<string, { symbol: string; screenColor: string }> = {
  LOW:      { symbol: "●", screenColor: "text-emerald-400" },
  MEDIUM:   { symbol: "●", screenColor: "text-amber-400" },
  HIGH:     { symbol: "▲", screenColor: "text-orange-400" },
  CRITICAL: { symbol: "▲▲", screenColor: "text-red-400" },
};

// ═══ COMPONENT ══════════════════════════════════════════════════════════════

export default function PIPInspectionReport() {
  const { toast } = useToast();
  const [siteFilter, setSiteFilter] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  // Get unique sites from workers
  const { data: sitesData } = useQuery({
    queryKey: ["worker-sites"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/workers`, { headers: authHeaders() });
      if (!res.ok) return [];
      const json = await res.json();
      const workers = extractList<{ assigned_site: string | null }>(json, "workers");
      const sites = [...new Set(workers.map(w => w.assigned_site).filter(Boolean))];
      return sites.sort() as string[];
    },
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}api/v1/legal/pip-report/generate`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          siteId: siteFilter || undefined,
          includeOnlyActiveWorkers: true,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error ?? "Failed");
      }
      return res.json() as Promise<Report>;
    },
    onSuccess: (data) => {
      setReport(data);
      toast({ description: `Report generated: ${data.summary.totalWorkers} workers, score ${data.readinessScore}/100` });
    },
    onError: (err) => toast({ description: (err as Error).message, variant: "destructive" }),
  });

  const handlePrint = () => window.print();

  const sites = sitesData ?? [];
  const readinessColor =
    report?.readinessLevel === "HIGH" ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/10" :
    report?.readinessLevel === "MEDIUM" ? "text-amber-400 border-amber-500/20 bg-amber-500/10" :
    report?.readinessLevel === "LOW" ? "text-orange-400 border-orange-500/20 bg-orange-500/10" :
    "text-red-400 border-red-500/20 bg-red-500/10";

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      {/* Screen-only controls */}
      <div className="print:hidden mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Shield className="w-7 h-7 text-[#C41E18]" />
          <h1 className="text-3xl font-bold text-white">PIP Inspection Report</h1>
        </div>
        <p className="text-gray-400 mb-4">One-click compliance proof for all workers on a site</p>

        <div className="flex items-center gap-3">
          <select
            value={siteFilter}
            onChange={e => setSiteFilter(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white min-w-[200px]"
          >
            <option value="">All Sites</option>
            {sites.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-[#C41E18] text-white rounded-lg text-sm font-bold hover:bg-[#A31814] transition-colors disabled:opacity-50"
          >
            {generateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            Generate Report
          </button>

          {report && (
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-white rounded-lg text-sm font-bold hover:bg-slate-600 transition-colors"
            >
              <Printer className="w-4 h-4" />
              Print / Export PDF
            </button>
          )}
        </div>
      </div>

      {/* Report content (print-friendly) */}
      {report && (
        <div ref={printRef} className="print:text-black print:bg-white">
          {/* Header */}
          <div className="border-b-2 border-slate-700 print:border-black pb-4 mb-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-white print:text-black">
                  RAPORT GOTOWOŚCI DO KONTROLI PIP
                </h2>
                <p className="text-sm text-slate-400 print:text-gray-600">
                  PIP Inspection Readiness Report — Prepared for Państwowa Inspekcja Pracy
                </p>
              </div>
              <div className="text-right text-xs text-slate-400 print:text-gray-600">
                <p className="font-bold">Apatris Sp. z o.o.</p>
                <p>Generated: {new Date(report.generatedAt).toLocaleString("pl-PL")}</p>
                {report.siteId && <p>Site: {report.siteId}</p>}
                {report.id && <p className="font-mono text-[10px]">ID: {report.id.slice(0, 8)}</p>}
              </div>
            </div>
          </div>

          {/* Readiness Score */}
          <div className={`rounded-xl border p-4 mb-6 print:border-gray-400 print:bg-white ${readinessColor}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider opacity-80">Readiness Score</p>
                <p className="text-4xl font-bold">{report.readinessScore}<span className="text-lg opacity-60">/100</span></p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold">{report.readinessLevel}</p>
                <p className="text-xs opacity-70">{report.summary.totalWorkers} workers assessed</p>
              </div>
            </div>
          </div>

          {/* Summary Grid */}
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-6 text-xs">
            <SumCard label="Valid" value={report.summary.valid} symbol="✓" good />
            <SumCard label="Protected" value={report.summary.protectedPending} symbol="◉" />
            <SumCard label="Review" value={report.summary.reviewRequired} symbol="?" warn={report.summary.reviewRequired > 0} />
            <SumCard label="Expired" value={report.summary.expiredNotProtected} symbol="✗" warn={report.summary.expiredNotProtected > 0} />
            <SumCard label="Critical" value={report.summary.criticalRisk} symbol="▲▲" warn={report.summary.criticalRisk > 0} />
            <SumCard label="No Evidence" value={report.summary.missingEvidence} symbol="!" warn={report.summary.missingEvidence > 0} />
          </div>

          {/* Worker Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b-2 border-slate-700 print:border-black">
                  <th className="text-left px-2 py-2 font-bold text-slate-400 print:text-black">#</th>
                  <th className="text-left px-2 py-2 font-bold text-slate-400 print:text-black">Worker</th>
                  <th className="text-left px-2 py-2 font-bold text-slate-400 print:text-black">Nationality</th>
                  <th className="text-left px-2 py-2 font-bold text-slate-400 print:text-black">Status</th>
                  <th className="text-left px-2 py-2 font-bold text-slate-400 print:text-black">Basis</th>
                  <th className="text-left px-2 py-2 font-bold text-slate-400 print:text-black">Risk</th>
                  <th className="text-left px-2 py-2 font-bold text-slate-400 print:text-black">Permit Expiry</th>
                  <th className="text-left px-2 py-2 font-bold text-slate-400 print:text-black">Days</th>
                  <th className="text-left px-2 py-2 font-bold text-slate-400 print:text-black">Filing</th>
                  <th className="text-left px-2 py-2 font-bold text-slate-400 print:text-black">Evidence</th>
                  <th className="text-left px-2 py-2 font-bold text-slate-400 print:text-black">Pack</th>
                  <th className="text-left px-2 py-2 font-bold text-slate-400 print:text-black">Warnings</th>
                </tr>
              </thead>
              <tbody>
                {report.workers.map((w, i) => {
                  const ss = STATUS_SYMBOL[w.legalStatus ?? "NO_SNAPSHOT"] ?? STATUS_SYMBOL.NO_SNAPSHOT;
                  const rs = RISK_SYMBOL[w.riskLevel ?? ""] ?? { symbol: "—", screenColor: "text-slate-500" };
                  const hasWarnings = w.warnings.length > 0;
                  const rowBg = w.legalStatus === "EXPIRED_NOT_PROTECTED" || w.riskLevel === "CRITICAL"
                    ? "bg-red-500/5 print:bg-gray-100" : "";
                  return (
                    <tr key={i} className={`border-b border-slate-800 print:border-gray-300 ${rowBg}`}>
                      <td className="px-2 py-1.5 text-slate-500 print:text-gray-500 font-mono">{i + 1}</td>
                      <td className="px-2 py-1.5 text-white print:text-black font-medium">{w.workerName}</td>
                      <td className="px-2 py-1.5 text-slate-300 print:text-gray-700">{w.nationality ?? "—"}</td>
                      <td className="px-2 py-1.5">
                        <span className={`font-bold ${ss.screenColor} print:text-black`}>
                          {ss.symbol} {ss.label}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-slate-300 print:text-gray-700 font-mono text-[10px]">
                        {w.legalBasis ?? "—"}
                      </td>
                      <td className="px-2 py-1.5">
                        <span className={`font-bold ${rs.screenColor} print:text-black`}>
                          {rs.symbol} {w.riskLevel ?? "—"}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 font-mono text-slate-300 print:text-gray-700">
                        {w.permitExpiryDate ?? "—"}
                      </td>
                      <td className="px-2 py-1.5 font-mono">
                        <span className={
                          w.daysUntilExpiry === null ? "text-slate-500" :
                          w.daysUntilExpiry < 0 ? "text-red-400 print:text-black font-bold" :
                          w.daysUntilExpiry <= 30 ? "text-amber-400 print:text-black font-bold" :
                          "text-slate-300 print:text-gray-700"
                        }>
                          {w.daysUntilExpiry !== null ? (w.daysUntilExpiry < 0 ? `${Math.abs(w.daysUntilExpiry)}d over` : `${w.daysUntilExpiry}d`) : "—"}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 font-mono text-slate-300 print:text-gray-700">
                        {w.filingDate ?? "—"}
                      </td>
                      <td className="px-2 py-1.5">
                        {w.evidenceCount > 0 ? (
                          <span className={w.evidenceVerified ? "text-emerald-400 print:text-black" : "text-slate-300 print:text-gray-700"}>
                            {w.evidenceCount}{w.evidenceVerified ? " ✓" : ""}
                          </span>
                        ) : (
                          <span className="text-red-400 print:text-black font-bold">None</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        {w.authorityPackStatus ? (
                          <span className={w.authorityPackApproved ? "text-emerald-400 print:text-black" : "text-amber-400 print:text-black"}>
                            {w.authorityPackApproved ? "✓ Approved" : w.authorityPackStatus}
                          </span>
                        ) : <span className="text-slate-500">—</span>}
                      </td>
                      <td className="px-2 py-1.5 text-[10px] text-red-400 print:text-black max-w-[200px]">
                        {hasWarnings ? w.warnings.join("; ") : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="mt-6 pt-4 border-t border-slate-700 print:border-gray-400 text-[10px] text-slate-500 print:text-gray-500">
            <p>This report is generated from data in the Apatris Compliance Hub system.</p>
            <p>Legal status is determined by the Apatris legal engine based on structured immigration data.</p>
            <p>This document is for internal compliance purposes and does not constitute legal advice.</p>
            <p className="mt-1 font-mono">Report ID: {report.id?.slice(0, 8) ?? "—"} | Generated: {new Date(report.generatedAt).toISOString()}</p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!report && !generateMutation.isPending && (
        <div className="text-center py-20 text-slate-500 print:hidden">
          <Shield className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-semibold">No report generated</p>
          <p className="text-sm mt-1">Select a site and click Generate Report</p>
        </div>
      )}

      {generateMutation.isPending && (
        <div className="flex justify-center py-20 print:hidden">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin text-[#C41E18] mx-auto mb-3" />
            <p className="text-sm text-slate-400">Generating compliance report...</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══ SUMMARY CARD ═══════════════════════════════════════════════════════════

function SumCard({ label, value, symbol, good, warn }: { label: string; value: number; symbol: string; good?: boolean; warn?: boolean }) {
  return (
    <div className={`rounded-lg border p-2 print:border-gray-400 ${
      warn ? "border-red-500/20 bg-red-500/5" :
      good ? "border-emerald-500/20 bg-emerald-500/5" :
      "border-slate-700 bg-slate-800/50"
    }`}>
      <p className="text-[10px] text-slate-400 print:text-gray-500 uppercase">{symbol} {label}</p>
      <p className={`text-lg font-bold ${
        warn ? "text-red-400" : good ? "text-emerald-400" : "text-white"
      } print:text-black`}>{value}</p>
    </div>
  );
}
