/**
 * TRC Workspace — case management with checklist, readiness score, and timeline.
 */

import React, { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { authHeaders, BASE } from "@/lib/api";
import {
  ArrowLeft, FileCheck, CheckCircle2, XOctagon, Clock, Loader2,
  AlertTriangle, ChevronRight, Shield, Upload, FileText,
} from "lucide-react";

// ═══ CHECKLIST ITEMS ════════════════════════════════════════════════════════

const TRC_CHECKLIST = [
  { id: "passport", label: "Passport copy (all pages)", required: true },
  { id: "photos", label: "2 photos (35mm × 45mm, color)", required: true },
  { id: "registration", label: "Proof of registration (zameldowanie)", required: true },
  { id: "contract", label: "Employment contract / Umowa", required: true },
  { id: "labor_test", label: "Labour market test (informacja starosty)", required: false },
  { id: "zus_cert", label: "ZUS certificate (niezaleganie)", required: true },
  { id: "tax_cert", label: "Tax office certificate (US)", required: true },
  { id: "fee", label: "Fee payment confirmation (PLN 440-800)", required: true },
  { id: "annex1", label: "Annex 1 — Employer declaration (signed)", required: true },
  { id: "e_signature", label: "Electronic signature / Trusted Profile", required: true },
  { id: "login_gov", label: "login.gov.pl authentication", required: true },
];

type ReadinessLevel = "NOT_READY" | "IN_PROGRESS" | "READY_FOR_SUBMISSION";

export default function TRCWorkspace() {
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());

  const { data: casesData, isLoading } = useQuery({
    queryKey: ["trc-workspace-cases"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/trc/cases`, { headers: authHeaders() });
      if (!r.ok) return { cases: [] };
      return r.json();
    },
  });

  const cases = (casesData as any)?.cases ?? [];
  const selectedCase = cases.find((c: any) => c.id === selectedCaseId);

  const toggleCheck = useCallback((id: string) => {
    setCheckedItems(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  // Calculate readiness
  const requiredItems = TRC_CHECKLIST.filter(i => i.required);
  const requiredChecked = requiredItems.filter(i => checkedItems.has(i.id)).length;
  const totalChecked = TRC_CHECKLIST.filter(i => checkedItems.has(i.id)).length;
  const readiness: ReadinessLevel = requiredChecked === requiredItems.length ? "READY_FOR_SUBMISSION" : requiredChecked > 3 ? "IN_PROGRESS" : "NOT_READY";
  const readinessPercent = Math.round((requiredChecked / requiredItems.length) * 100);

  const READINESS_STYLE = {
    NOT_READY: { bg: "bg-red-500/10 border-red-500/20", color: "text-red-400", label: "NOT READY", icon: XOctagon },
    IN_PROGRESS: { bg: "bg-amber-500/10 border-amber-500/20", color: "text-amber-400", label: "IN PROGRESS", icon: Clock },
    READY_FOR_SUBMISSION: { bg: "bg-emerald-500/10 border-emerald-500/20", color: "text-emerald-400", label: "READY FOR SUBMISSION", icon: CheckCircle2 },
  };

  const rs = READINESS_STYLE[readiness];
  const RIcon = rs.icon;

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <a href="/legal-immigration" className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white hover:border-slate-600 transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </a>
        <FileCheck className="w-7 h-7 text-[#C41E18]" />
        <div>
          <h1 className="text-2xl font-bold text-white">TRC Workspace</h1>
          <p className="text-sm text-slate-400">Case management with document checklist</p>
        </div>
      </div>

      <div className="flex gap-6">
        {/* Left — Case List */}
        <div className="w-72 flex-shrink-0 space-y-2">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Cases ({cases.length})</p>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 text-slate-600 animate-spin" /></div>
          ) : cases.length === 0 ? (
            <p className="text-xs text-slate-600 text-center py-8">No TRC cases found</p>
          ) : (
            cases.map((c: any) => {
              const isActive = selectedCaseId === c.id;
              const statusColor = c.status === "submitted" ? "text-emerald-400" : c.status === "rejected" ? "text-red-400" : "text-amber-400";
              return (
                <button
                  key={c.id}
                  onClick={() => { setSelectedCaseId(c.id); setCheckedItems(new Set()); }}
                  className={`w-full text-left p-3 rounded-xl border transition-colors ${isActive ? "bg-[#C41E18]/10 border-[#C41E18]/30" : "bg-slate-900 border-slate-800 hover:border-slate-700"}`}
                >
                  <p className="text-sm font-bold text-white">{c.worker_name}</p>
                  <p className="text-[10px] text-slate-500">{c.case_type} · {c.voivodeship ?? "—"}</p>
                  <div className="flex items-center justify-between mt-1">
                    <span className={`text-[9px] font-bold uppercase ${statusColor}`}>{c.status}</span>
                    <ChevronRight className="w-3 h-3 text-slate-600" />
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Right — Case Workspace */}
        <div className="flex-1">
          {!selectedCase ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-600">
              <FileCheck className="w-8 h-8 mb-2" />
              <p className="text-sm">Select a case from the left</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Case header */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-white">{selectedCase.worker_name}</h2>
                  <p className="text-[10px] text-slate-500">{selectedCase.case_type} · {selectedCase.voivodeship ?? "No voivodeship"} · {selectedCase.employer_name ?? "Apatris Sp. z o.o."}</p>
                </div>
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${rs.bg}`}>
                  <RIcon className={`w-4 h-4 ${rs.color}`} />
                  <span className={`text-xs font-bold ${rs.color}`}>{rs.label}</span>
                </div>
              </div>

              {/* Readiness score */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Readiness Score</span>
                  <span className={`text-xl font-black ${rs.color}`}>{readinessPercent}%</span>
                </div>
                <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 rounded-full ${readiness === "READY_FOR_SUBMISSION" ? "bg-emerald-500" : readiness === "IN_PROGRESS" ? "bg-amber-500" : "bg-red-500"}`}
                    style={{ width: `${readinessPercent}%` }}
                  />
                </div>
                <p className="text-[10px] text-slate-500 mt-1">{requiredChecked}/{requiredItems.length} required items checked · {totalChecked}/{TRC_CHECKLIST.length} total</p>
              </div>

              {/* Document Checklist */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3">Document Checklist</p>
                <div className="space-y-1">
                  {TRC_CHECKLIST.map(item => {
                    const checked = checkedItems.has(item.id);
                    return (
                      <button
                        key={item.id}
                        onClick={() => toggleCheck(item.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${checked ? "bg-emerald-500/10" : "hover:bg-slate-800"}`}
                      >
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${checked ? "bg-emerald-500 border-emerald-500" : "border-slate-600"}`}>
                          {checked && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                        </div>
                        <span className={`text-xs ${checked ? "text-emerald-300 line-through" : "text-white"}`}>{item.label}</span>
                        {item.required && !checked && (
                          <span className="ml-auto text-[8px] font-bold text-red-400/60 uppercase">Required</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Case Info */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3">Case Details</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-slate-500">Status:</span> <span className="text-white font-medium">{selectedCase.status}</span></div>
                  <div><span className="text-slate-500">Nationality:</span> <span className="text-white">{selectedCase.nationality ?? "—"}</span></div>
                  <div><span className="text-slate-500">Passport:</span> <span className="text-white font-mono">{selectedCase.passport_number ?? "—"}</span></div>
                  <div><span className="text-slate-500">Employer NIP:</span> <span className="text-white font-mono">{selectedCase.employer_nip ?? "5252828706"}</span></div>
                  <div><span className="text-slate-500">Start Date:</span> <span className="text-white">{selectedCase.start_date ? new Date(selectedCase.start_date).toLocaleDateString("en-GB") : "—"}</span></div>
                  <div><span className="text-slate-500">Expiry:</span> <span className="text-white">{selectedCase.expiry_date ? new Date(selectedCase.expiry_date).toLocaleDateString("en-GB") : "—"}</span></div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
