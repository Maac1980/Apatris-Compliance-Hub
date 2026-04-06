/**
 * Authority Packs — minimal internal UI for managing authority response packs.
 * View, generate, and approve formal evidence-backed response drafts.
 */

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { authHeaders, BASE } from "@/lib/api";
import {
  Shield, FileText, CheckCircle2, Clock, AlertTriangle, ChevronRight, X, Loader2,
  Eye, ThumbsUp, FileDown,
} from "lucide-react";
import { ApprovalBadge, UnapprovedWarning } from "@/components/ApprovalBadge";

// ═══ TYPES ══════════════════════════════════════════════════════════════════

interface AuthorityPack {
  id: string;
  worker_id: string;
  legal_case_id: string | null;
  pack_status: string;
  legal_conclusion: string;
  legal_basis: string;
  risk_level: string | null;
  response_text_pl: string | null;
  response_text_en: string | null;
  response_text_uk: string | null;
  evidence_links_json: unknown;
  citation_refs_json: unknown;
  worker_facts_json: any;
  snapshot_data_json: any;
  approved_by: string | null;
  approved_at: string | null;
  generated_at: string;
  created_at: string;
}

interface LegalCase {
  id: string;
  worker_id: string;
  case_type: string;
  status: string;
  appeal_deadline: string | null;
  next_action: string | null;
}

// ═══ DISPLAY HELPERS ════════════════════════════════════════════════════════

const STATUS_STYLE: Record<string, { bg: string; text: string; icon: typeof Shield }> = {
  DRAFT:           { bg: "bg-slate-700/50", text: "text-slate-300", icon: FileText },
  REVIEW_REQUIRED: { bg: "bg-orange-500/10", text: "text-orange-400", icon: AlertTriangle },
  APPROVED:        { bg: "bg-emerald-500/10", text: "text-emerald-400", icon: CheckCircle2 },
  ARCHIVED:        { bg: "bg-slate-800/50", text: "text-slate-500", icon: Clock },
};

const BASIS_LABELS: Record<string, string> = {
  PERMIT_VALID: "Current Permit",
  ART_108: "Art. 108 Continuity",
  SPECUSTAWA_UKR: "Ukrainian Special Act",
  REVIEW_REQUIRED: "Pending Review",
  NO_LEGAL_BASIS: "No Legal Basis",
};

// ═══ COMPONENT ══════════════════════════════════════════════════════════════

export default function AuthorityPacks() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedPack, setSelectedPack] = useState<AuthorityPack | null>(null);
  const [activeTab, setActiveTab] = useState<"en" | "pl" | "uk">("en");

  // Fetch active legal cases (to allow generating packs)
  const { data: casesData } = useQuery({
    queryKey: ["legal-cases-active"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/legal/cases`, { headers: authHeaders() });
      if (!res.ok) return { cases: [] };
      return res.json() as Promise<{ cases: LegalCase[] }>;
    },
  });

  // Fetch all packs — we query by cases' worker IDs but simpler: fetch from each case
  const { data: packsData, isLoading } = useQuery({
    queryKey: ["authority-packs"],
    queryFn: async () => {
      // Get packs for all workers that have cases
      const cases = casesData?.cases ?? [];
      const workerIds = [...new Set(cases.map(c => c.worker_id))];
      const allPacks: AuthorityPack[] = [];
      for (const wid of workerIds) {
        try {
          const res = await fetch(`${BASE}/api/v1/legal/authority-pack/worker/${wid}`, { headers: authHeaders() });
          if (res.ok) {
            const data = await res.json();
            if (data.packs) allPacks.push(...data.packs);
          }
        } catch { /* skip */ }
      }
      return allPacks;
    },
    enabled: !!casesData,
  });

  const generateMutation = useMutation({
    mutationFn: async (caseId: string) => {
      const res = await fetch(`${BASE}/api/v1/legal/authority-pack/generate`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ caseId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error ?? "Generation failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["authority-packs"] });
      setSelectedPack(data.pack);
      toast({ description: "Authority pack generated" });
    },
    onError: (err) => toast({ description: (err as Error).message, variant: "destructive" }),
  });

  const approveMutation = useMutation({
    mutationFn: async (packId: string) => {
      const res = await fetch(`${BASE}/api/v1/legal/authority-pack/${packId}/approve`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error ?? "Approval failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["authority-packs"] });
      setSelectedPack(data.pack);
      toast({ description: "Pack approved" });
    },
    onError: (err) => toast({ description: (err as Error).message, variant: "destructive" }),
  });

  const packs = packsData ?? [];
  const cases = casesData?.cases ?? [];

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Shield className="w-7 h-7 text-[#C41E18]" />
          <h1 className="text-3xl font-bold text-white">Authority Response Packs</h1>
        </div>
        <p className="text-gray-400">Generate and review formal evidence-backed response drafts for authorities</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Left: Cases that can generate packs ─────────────────────── */}
        <div className="lg:col-span-1 space-y-3">
          <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Active Cases</h2>
          {cases.length === 0 ? (
            <p className="text-xs text-slate-500 py-4">No active legal cases. Create a case first via the Legal Case Engine.</p>
          ) : (
            cases.map(c => (
              <div key={c.id} className="bg-slate-800 border border-slate-700 rounded-xl p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-white">{c.case_type}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    c.status === "REJECTED" ? "bg-red-500/10 text-red-400" :
                    c.status === "APPROVED" ? "bg-emerald-500/10 text-emerald-400" :
                    c.status === "PENDING" ? "bg-blue-500/10 text-blue-400" :
                    "bg-slate-700 text-slate-300"
                  }`}>{c.status}</span>
                </div>
                <p className="text-[11px] text-slate-400 mb-2">
                  {c.next_action}
                  {c.appeal_deadline && (
                    <span className="text-red-400 ml-1">
                      — Appeal by {new Date(c.appeal_deadline).toLocaleDateString("en-GB")}
                    </span>
                  )}
                </p>
                <button
                  onClick={() => generateMutation.mutate(c.id)}
                  disabled={generateMutation.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-lg text-xs font-bold hover:bg-blue-600/30 transition-colors disabled:opacity-50 w-full justify-center"
                >
                  {generateMutation.isPending ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <FileText className="w-3 h-3" />
                  )}
                  Generate Authority Pack
                </button>
              </div>
            ))
          )}
        </div>

        {/* ── Right: Generated packs ─────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-3">
          <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Generated Packs</h2>

          {isLoading ? (
            <div className="flex justify-center py-10">
              <div className="animate-spin w-6 h-6 border-2 border-[#C41E18] border-t-transparent rounded-full" />
            </div>
          ) : packs.length === 0 ? (
            <div className="text-center py-10 text-slate-500">
              <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No authority packs generated yet</p>
              <p className="text-xs mt-1">Select a case and generate a pack</p>
            </div>
          ) : (
            <div className="space-y-2">
              {packs.map(p => {
                const ss = STATUS_STYLE[p.pack_status] ?? STATUS_STYLE.DRAFT;
                const Icon = ss.icon;
                const workerName = p.worker_facts_json?.fullName ?? "Worker";
                return (
                  <div
                    key={p.id}
                    onClick={() => setSelectedPack(p)}
                    className="bg-slate-800 border border-slate-700 rounded-xl p-3 hover:border-slate-600 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className={`w-4 h-4 ${ss.text}`} />
                        <span className="text-sm font-semibold text-white">{workerName}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${ss.bg} ${ss.text}`}>
                          {p.pack_status}
                        </span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-600" />
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-400">
                      <span>{BASIS_LABELS[p.legal_basis] ?? p.legal_basis}</span>
                      <span className="text-slate-600">|</span>
                      <span>{p.legal_conclusion}</span>
                      <span className="text-slate-600">|</span>
                      <span className="font-mono">{new Date(p.generated_at).toLocaleDateString("en-GB")}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Detail Panel (overlay) ───────────────────────────────────── */}
      {selectedPack && (
        <div className="fixed inset-0 z-[250] flex justify-end" onClick={() => setSelectedPack(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="relative w-full max-w-2xl bg-slate-900 border-l border-slate-700 h-full overflow-y-auto shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 bg-slate-900 border-b border-slate-700 px-6 py-4 flex items-center justify-between z-10">
              <div>
                <h2 className="text-lg font-bold text-white">
                  {selectedPack.worker_facts_json?.fullName ?? "Authority Pack"}
                </h2>
                <div className="flex items-center gap-2 mt-0.5">
                  {(() => {
                    const ss = STATUS_STYLE[selectedPack.pack_status] ?? STATUS_STYLE.DRAFT;
                    return (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${ss.bg} ${ss.text}`}>
                        {selectedPack.pack_status}
                      </span>
                    );
                  })()}
                  <span className="text-xs text-slate-400">
                    {BASIS_LABELS[selectedPack.legal_basis] ?? selectedPack.legal_basis}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {(selectedPack.pack_status === "DRAFT" || selectedPack.pack_status === "REVIEW_REQUIRED") && (
                  <button
                    onClick={(e) => { e.stopPropagation(); approveMutation.mutate(selectedPack.id); }}
                    disabled={approveMutation.isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-bold hover:bg-emerald-600/30 transition-colors disabled:opacity-50"
                  >
                    {approveMutation.isPending ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <ThumbsUp className="w-3 h-3" />
                    )}
                    Approve
                  </button>
                )}
                <button onClick={() => setSelectedPack(null)} className="p-2 hover:bg-slate-800 rounded-lg transition-colors">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {/* Meta grid */}
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="rounded bg-slate-800 border border-slate-700 p-2">
                  <div className="text-slate-500 mb-0.5">Legal Status</div>
                  <div className="text-white font-semibold">{selectedPack.legal_conclusion}</div>
                </div>
                <div className="rounded bg-slate-800 border border-slate-700 p-2">
                  <div className="text-slate-500 mb-0.5">Legal Basis</div>
                  <div className="text-white font-semibold">{BASIS_LABELS[selectedPack.legal_basis] ?? selectedPack.legal_basis}</div>
                </div>
                <div className="rounded bg-slate-800 border border-slate-700 p-2">
                  <div className="text-slate-500 mb-0.5">Risk</div>
                  <div className={`font-semibold ${
                    selectedPack.risk_level === "LOW" ? "text-emerald-400" :
                    selectedPack.risk_level === "MEDIUM" ? "text-amber-400" :
                    selectedPack.risk_level === "HIGH" ? "text-orange-400" : "text-red-400"
                  }`}>{selectedPack.risk_level ?? "—"}</div>
                </div>
              </div>

              <div>
                <ApprovalBadge
                  entityType="authority_pack"
                  entityId={selectedPack.id}
                  isApproved={selectedPack.pack_status === "APPROVED" || !!(selectedPack as any).is_approved}
                  approvedBy={selectedPack.approved_by}
                  approvedAt={selectedPack.approved_at}
                  size="md"
                  invalidateKeys={[["authority-packs"]]}
                  onApproved={() => queryClient.invalidateQueries({ queryKey: ["authority-packs"] })}
                />
                {selectedPack.pack_status !== "APPROVED" && !(selectedPack as any).is_approved && (
                  <UnapprovedWarning className="mt-2" />
                )}
              </div>

              {/* Language tabs */}
              <div>
                <div className="flex gap-1 bg-slate-800/50 rounded-lg p-1 w-fit mb-3">
                  {(["en", "pl", "uk"] as const).map(lang => (
                    <button
                      key={lang}
                      onClick={() => setActiveTab(lang)}
                      className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                        activeTab === lang ? "bg-[#C41E18] text-white" : "text-slate-400 hover:text-white"
                      }`}
                    >
                      {lang === "en" ? "English" : lang === "pl" ? "Polski" : "Українська"}
                    </button>
                  ))}
                </div>

                <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
                  <pre className="text-xs text-slate-300 whitespace-pre-wrap font-sans leading-relaxed">
                    {activeTab === "en" ? selectedPack.response_text_en :
                     activeTab === "pl" ? selectedPack.response_text_pl :
                     selectedPack.response_text_uk}
                  </pre>
                </div>
              </div>

              {/* Evidence */}
              {Array.isArray(selectedPack.evidence_links_json) && (selectedPack.evidence_links_json as any[]).length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Evidence on File</h3>
                  <div className="space-y-1">
                    {(selectedPack.evidence_links_json as any[]).map((e: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-xs bg-slate-800 border border-slate-700 rounded-lg px-3 py-2">
                        <FileDown className="w-3 h-3 text-blue-400 flex-shrink-0" />
                        <span className="text-slate-300">{e.type}</span>
                        {e.filingDate && <span className="text-slate-500 font-mono">{e.filingDate}</span>}
                        {e.fileName && <span className="text-slate-500 truncate max-w-[150px]">{e.fileName}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Citations */}
              {Array.isArray(selectedPack.citation_refs_json) && (selectedPack.citation_refs_json as any[]).length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Legal Citations</h3>
                  <div className="space-y-1">
                    {(selectedPack.citation_refs_json as any[]).map((c: any, i: number) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-slate-300">
                        <span className="text-blue-400 mt-0.5">-</span>
                        <span>{c.label}{c.article ? ` (${c.article})` : ""}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Footer */}
              <div className="text-[10px] text-slate-600 border-t border-slate-700/50 pt-3">
                Generated: {new Date(selectedPack.generated_at).toLocaleString("en-GB")}
                <span className="mx-2">|</span>
                Pack ID: <span className="font-mono">{selectedPack.id.slice(0, 8)}</span>
                <p className="mt-1">This document requires internal review before submission to any authority.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
