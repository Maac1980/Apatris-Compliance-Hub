/**
 * Linked Cases — unified TRC ↔ Legal Case view.
 * Shows one clear case progression per worker with both TRC and legal context.
 */

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { authHeaders, BASE } from "@/lib/api";
import {
  Link2, ChevronRight, X, Shield, FileText, AlertTriangle, CheckCircle2,
  Loader2, RefreshCw, Clock,
} from "lucide-react";

interface LinkedCase {
  legalCaseId: string;
  trcCaseId: string | null;
  workerId: string;
  workerName: string;
  trcStatus: string | null;
  trcCaseType: string | null;
  trcVoivodeship: string | null;
  trcEmployerName: string | null;
  trcStartDate: string | null;
  trcExpiryDate: string | null;
  legalStatus: string;
  legalCaseType: string;
  appealDeadline: string | null;
  nextAction: string | null;
  legalSnapshotStatus: string | null;
  legalBasis: string | null;
  riskLevel: string | null;
  authorityPackStatus: string | null;
  evidenceCount: number;
  lastUpdated: string;
}

const STATUS_COLOR: Record<string, string> = {
  NEW: "text-slate-300", PENDING: "text-blue-400", REJECTED: "text-red-400", APPROVED: "text-emerald-400",
};
const TRC_COLOR: Record<string, string> = {
  "intake": "text-slate-400", "Documents Gathering": "text-yellow-400", "Submitted": "text-blue-400",
  "Under Review": "text-purple-400", "Approved": "text-emerald-400", "Rejected": "text-red-400",
  "formal_defect": "text-orange-400",
};
const RISK_COLOR: Record<string, string> = {
  LOW: "text-emerald-400", MEDIUM: "text-amber-400", HIGH: "text-orange-400", CRITICAL: "text-red-400",
};

export default function LinkedCases() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<LinkedCase | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["linked-cases"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/legal/cases/linked`, { headers: authHeaders() });
      if (!res.ok) return { cases: [] };
      return res.json() as Promise<{ cases: LinkedCase[] }>;
    },
  });

  const linkOrphansMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/v1/legal/cases/link-orphans`, { method: "POST", headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ["linked-cases"] });
      toast({ description: `Linked ${r.linked} orphaned TRC cases, ${r.skipped} skipped` });
    },
    onError: (err) => toast({ description: (err as Error).message, variant: "destructive" }),
  });

  const cases = data?.cases ?? [];
  const linked = cases.filter(c => c.trcCaseId);
  const unlinked = cases.filter(c => !c.trcCaseId);

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 mb-2">
            <Link2 className="w-7 h-7 text-[#C41E18]" />
            <h1 className="text-3xl font-bold text-white">Linked Cases</h1>
            <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded">TRC ↔ Legal</span>
          </div>
          <button
            onClick={() => linkOrphansMutation.mutate()}
            disabled={linkOrphansMutation.isPending}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-lg text-xs font-bold hover:bg-blue-600/30 disabled:opacity-50"
          >
            {linkOrphansMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Link Orphaned TRC Cases
          </button>
        </div>
        <p className="text-gray-400">Unified view of TRC process cases and legal workflow cases</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="rounded-xl p-3 bg-slate-800">
          <p className="text-[10px] text-gray-400 font-mono uppercase">Total Cases</p>
          <p className="text-xl font-bold text-white">{cases.length}</p>
        </div>
        <div className="rounded-xl p-3 bg-emerald-500/10 border border-emerald-500/20">
          <p className="text-[10px] text-gray-400 font-mono uppercase">Linked (TRC + Legal)</p>
          <p className="text-xl font-bold text-emerald-400">{linked.length}</p>
        </div>
        <div className="rounded-xl p-3 bg-amber-500/10 border border-amber-500/20">
          <p className="text-[10px] text-gray-400 font-mono uppercase">Legal Only (no TRC)</p>
          <p className="text-xl font-bold text-amber-400">{unlinked.length}</p>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-[#C41E18] border-t-transparent rounded-full" /></div>
      ) : cases.length === 0 ? (
        <div className="text-center py-20 text-slate-500">
          <Link2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-semibold">No cases found</p>
          <p className="text-sm mt-1">Create TRC cases or legal cases to see them here</p>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-700 bg-slate-800/50">
                <th className="text-left px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase">Worker</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase">TRC Status</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase">Legal Status</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase">Snapshot</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase">Risk</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase">Voivodeship</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase">Next Action</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase">Link</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {cases.map(c => (
                <tr key={c.legalCaseId} onClick={() => setSelected(c)}
                  className="border-b border-slate-800 hover:bg-slate-800/60 cursor-pointer transition-colors">
                  <td className="px-3 py-2.5 text-white font-medium">{c.workerName}</td>
                  <td className="px-3 py-2.5">
                    {c.trcStatus ? (
                      <span className={`font-bold ${TRC_COLOR[c.trcStatus] ?? "text-slate-400"}`}>{c.trcStatus}</span>
                    ) : <span className="text-slate-600">—</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`font-bold ${STATUS_COLOR[c.legalStatus] ?? "text-slate-400"}`}>{c.legalStatus}</span>
                  </td>
                  <td className="px-3 py-2.5 text-slate-300">{c.legalSnapshotStatus ?? "—"}</td>
                  <td className="px-3 py-2.5">
                    {c.riskLevel ? (
                      <span className={`font-bold ${RISK_COLOR[c.riskLevel] ?? "text-slate-400"}`}>{c.riskLevel}</span>
                    ) : <span className="text-slate-600">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-slate-400">{c.trcVoivodeship ?? "—"}</td>
                  <td className="px-3 py-2.5 text-slate-300 max-w-[180px] truncate">{c.nextAction ?? "—"}</td>
                  <td className="px-3 py-2.5">
                    {c.trcCaseId ? (
                      <span className="text-emerald-400 text-[10px] font-bold">LINKED</span>
                    ) : (
                      <span className="text-slate-600 text-[10px]">Legal only</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5"><ChevronRight className="w-3.5 h-3.5 text-slate-600" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Panel */}
      {selected && (
        <div className="fixed inset-0 z-[250] flex justify-end" onClick={() => setSelected(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative w-full max-w-lg bg-slate-900 border-l border-slate-700 h-full overflow-y-auto shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-slate-900 border-b border-slate-700 px-6 py-4 flex items-center justify-between z-10">
              <div>
                <h2 className="text-lg font-bold text-white">{selected.workerName}</h2>
                <p className="text-xs text-slate-400">Unified Case View</p>
              </div>
              <button onClick={() => setSelected(null)} className="p-2 hover:bg-slate-800 rounded-lg"><X className="w-5 h-5 text-slate-400" /></button>
            </div>

            <div className="p-6 space-y-4">
              {/* TRC Section */}
              <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
                <h3 className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-2">TRC Case (Operational)</h3>
                {selected.trcCaseId ? (
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <Field label="TRC Status" value={selected.trcStatus} color={TRC_COLOR[selected.trcStatus ?? ""] ?? "text-slate-300"} />
                    <Field label="Case Type" value={selected.trcCaseType} />
                    <Field label="Voivodeship" value={selected.trcVoivodeship} />
                    <Field label="Employer" value={selected.trcEmployerName} />
                    <Field label="Start Date" value={selected.trcStartDate} mono />
                    <Field label="Expiry Date" value={selected.trcExpiryDate} mono />
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500">No linked TRC case</p>
                )}
              </div>

              {/* Legal Section */}
              <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4">
                <h3 className="text-xs font-bold text-purple-400 uppercase tracking-wider mb-2">Legal Case (Workflow)</h3>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <Field label="Legal Status" value={selected.legalStatus} color={STATUS_COLOR[selected.legalStatus] ?? "text-slate-300"} />
                  <Field label="Case Type" value={selected.legalCaseType} />
                  <Field label="Appeal Deadline" value={selected.appealDeadline ? new Date(selected.appealDeadline).toLocaleDateString("en-GB") : null} mono />
                  <Field label="Next Action" value={selected.nextAction} />
                </div>
              </div>

              {/* Snapshot Section */}
              <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Legal Engine Snapshot</h3>
                <div className="grid grid-cols-3 gap-2 text-[11px]">
                  <Field label="Snapshot Status" value={selected.legalSnapshotStatus} />
                  <Field label="Legal Basis" value={selected.legalBasis} />
                  <Field label="Risk Level" value={selected.riskLevel} color={RISK_COLOR[selected.riskLevel ?? ""] ?? "text-slate-300"} />
                </div>
              </div>

              {/* Evidence + Pack */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-slate-800 border border-slate-700 p-3 text-center">
                  <p className="text-[10px] text-slate-500 uppercase">Evidence</p>
                  <p className="text-lg font-bold text-white">{selected.evidenceCount}</p>
                </div>
                <div className="rounded-lg bg-slate-800 border border-slate-700 p-3 text-center">
                  <p className="text-[10px] text-slate-500 uppercase">Authority Pack</p>
                  <p className={`text-lg font-bold ${
                    selected.authorityPackStatus === "APPROVED" ? "text-emerald-400" :
                    selected.authorityPackStatus ? "text-amber-400" : "text-slate-600"
                  }`}>{selected.authorityPackStatus ?? "None"}</p>
                </div>
              </div>

              <p className="text-[10px] text-slate-600 font-mono">
                Last updated: {new Date(selected.lastUpdated).toLocaleString("en-GB")}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, color, mono }: { label: string; value: string | null | undefined; color?: string; mono?: boolean }) {
  return (
    <div className="rounded bg-slate-900/50 px-2 py-1.5">
      <div className="text-slate-500 text-[10px]">{label}</div>
      <div className={`${color ?? "text-slate-200"} ${mono ? "font-mono" : ""}`}>{value ?? "—"}</div>
    </div>
  );
}
