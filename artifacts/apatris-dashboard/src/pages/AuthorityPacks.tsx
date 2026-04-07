/**
 * Authority Packs — generate and manage formal evidence-backed response drafts.
 */

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { authHeaders, BASE, extractList } from "@/lib/api";
import {
  Shield, FileText, CheckCircle2, AlertTriangle, ChevronRight, X, Loader2,
  ThumbsUp, Printer, Plus,
} from "lucide-react";
import { ApprovalBadge, UnapprovedWarning } from "@/components/ApprovalBadge";

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  DRAFT:           { bg: "bg-slate-700/50", text: "text-slate-300" },
  REVIEW_REQUIRED: { bg: "bg-orange-500/10", text: "text-orange-400" },
  APPROVED:        { bg: "bg-emerald-500/10", text: "text-emerald-400" },
  ARCHIVED:        { bg: "bg-slate-800/50", text: "text-slate-500" },
};

const BASIS_LABELS: Record<string, string> = {
  PERMIT_VALID: "Current Permit", ART_108: "Art. 108", SPECUSTAWA_UKR: "Ukrainian Special Act",
  REVIEW_REQUIRED: "Pending Review", NO_LEGAL_BASIS: "No Legal Basis",
};

export default function AuthorityPacks() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedPack, setSelectedPack] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"en" | "pl" | "uk">("en");
  const [selectedCase, setSelectedCase] = useState("");

  // All packs
  const { data: packsData, isLoading } = useQuery({
    queryKey: ["authority-packs-all"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/v1/legal/authority-pack/all`, { headers: authHeaders() });
      if (!res.ok) return [];
      const json = await res.json();
      return json.packs ?? [];
    },
  });

  // Legal cases for generation
  const { data: casesData } = useQuery({
    queryKey: ["legal-cases-for-packs"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/v1/legal/cases`, { headers: authHeaders() });
      if (!res.ok) return [];
      const json = await res.json();
      return json.cases ?? [];
    },
  });

  const generateMutation = useMutation({
    mutationFn: async (caseId: string) => {
      const res = await fetch(`${BASE}api/v1/legal/authority-pack/generate`, {
        method: "POST", headers: authHeaders(), body: JSON.stringify({ caseId }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error ?? "Failed"); }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["authority-packs-all"] });
      setSelectedPack(data.pack);
      toast({ description: "Authority pack generated" });
    },
    onError: (err) => toast({ description: (err as Error).message, variant: "destructive" }),
  });

  const approveMutation = useMutation({
    mutationFn: async (packId: string) => {
      const res = await fetch(`${BASE}api/v1/legal/authority-pack/${packId}/approve`, {
        method: "POST", headers: authHeaders(),
      });
      if (!res.ok) throw new Error("Approval failed");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["authority-packs-all"] });
      if (selectedPack) setSelectedPack({ ...selectedPack, pack_status: "APPROVED", ...data.pack });
      toast({ description: "Pack approved" });
    },
    onError: (err) => toast({ description: (err as Error).message, variant: "destructive" }),
  });

  const packs = packsData ?? [];
  const cases = casesData ?? [];

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Shield className="w-7 h-7 text-[#C41E18]" />
          <h1 className="text-3xl font-bold text-white">Authority Response Packs</h1>
        </div>
        <p className="text-gray-400">Formal evidence-backed response drafts for voivodeship / labour authorities</p>
      </div>

      {/* Generate section */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 mb-6">
        <h2 className="text-sm font-bold text-white mb-3">Generate New Pack</h2>
        <div className="flex gap-3">
          <select value={selectedCase} onChange={e => setSelectedCase(e.target.value)}
            className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white">
            <option value="">Select a legal case...</option>
            {cases.map((c: any) => (
              <option key={c.id} value={c.id}>{c.case_type} — {c.status} (Worker: {c.worker_id?.slice(0, 8)})</option>
            ))}
          </select>
          <button onClick={() => { if (selectedCase) generateMutation.mutate(selectedCase); }}
            disabled={!selectedCase || generateMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-[#C41E18] text-white rounded-lg text-sm font-bold hover:bg-[#a51914] disabled:opacity-50">
            {generateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Generate
          </button>
        </div>
        {cases.length === 0 && (
          <p className="text-xs text-slate-500 mt-2">No legal cases found. Create a TRC case first to generate authority packs.</p>
        )}
      </div>

      {/* Packs list */}
      {isLoading ? (
        <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-[#C41E18] border-t-transparent rounded-full" /></div>
      ) : packs.length === 0 ? (
        <div className="text-center py-20 text-slate-500">
          <Shield className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-semibold">No authority packs generated yet</p>
          <p className="text-sm mt-1">Select a legal case above and click Generate</p>
        </div>
      ) : (
        <div className="space-y-2">
          {packs.map((p: any) => {
            const ss = STATUS_STYLE[p.pack_status] ?? STATUS_STYLE.DRAFT;
            const workerName = p.worker_name ?? p.worker_facts_json?.fullName ?? "Worker";
            return (
              <div key={p.id} onClick={() => { setSelectedPack(p); setActiveTab("en"); }}
                className="bg-slate-800 border border-slate-700 rounded-xl p-4 hover:border-slate-600 cursor-pointer transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Shield className={`w-4 h-4 ${ss.text}`} />
                    <div>
                      <span className="text-sm font-bold text-white">{workerName}</span>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400">
                        <span>{BASIS_LABELS[p.legal_basis] ?? p.legal_basis}</span>
                        <span className="text-slate-600">|</span>
                        <span>{p.legal_conclusion}</span>
                        <span className="text-slate-600">|</span>
                        <span className="font-mono">{new Date(p.created_at).toLocaleDateString("en-GB")}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${ss.bg} ${ss.text}`}>{p.pack_status}</span>
                    {(p.pack_status === "DRAFT" || p.pack_status === "REVIEW_REQUIRED") && (
                      <button onClick={(e) => { e.stopPropagation(); approveMutation.mutate(p.id); }}
                        className="p-1 text-emerald-400 hover:text-emerald-300"><ThumbsUp className="w-3.5 h-3.5" /></button>
                    )}
                    <ChevronRight className="w-4 h-4 text-slate-600" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail Panel */}
      {selectedPack && (
        <div className="fixed inset-0 z-[250] flex justify-end" onClick={() => setSelectedPack(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative w-full max-w-2xl bg-slate-900 border-l border-slate-700 h-full overflow-y-auto shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-slate-900 border-b border-slate-700 px-6 py-4 flex items-center justify-between z-10">
              <div>
                <h2 className="text-lg font-bold text-white">{selectedPack.worker_name ?? selectedPack.worker_facts_json?.fullName ?? "Authority Pack"}</h2>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${(STATUS_STYLE[selectedPack.pack_status] ?? STATUS_STYLE.DRAFT).bg} ${(STATUS_STYLE[selectedPack.pack_status] ?? STATUS_STYLE.DRAFT).text}`}>{selectedPack.pack_status}</span>
                  <span className="text-xs text-slate-400">{BASIS_LABELS[selectedPack.legal_basis] ?? selectedPack.legal_basis}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {(selectedPack.pack_status === "DRAFT" || selectedPack.pack_status === "REVIEW_REQUIRED") && (
                  <button onClick={() => approveMutation.mutate(selectedPack.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-bold">
                    <ThumbsUp className="w-3 h-3" /> Approve
                  </button>
                )}
                <button onClick={() => setSelectedPack(null)} className="p-2 hover:bg-slate-800 rounded-lg"><X className="w-5 h-5 text-slate-400" /></button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {/* Approval */}
              <ApprovalBadge entityType="authority_pack" entityId={selectedPack.id}
                isApproved={selectedPack.pack_status === "APPROVED"} approvedBy={selectedPack.approved_by} size="md"
                invalidateKeys={[["authority-packs-all"]]} />
              {selectedPack.pack_status !== "APPROVED" && <UnapprovedWarning />}

              {/* Meta grid */}
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="rounded bg-slate-800 border border-slate-700 p-2">
                  <div className="text-slate-500 mb-0.5">Status</div>
                  <div className="text-white font-semibold">{selectedPack.legal_conclusion}</div>
                </div>
                <div className="rounded bg-slate-800 border border-slate-700 p-2">
                  <div className="text-slate-500 mb-0.5">Basis</div>
                  <div className="text-white font-semibold">{BASIS_LABELS[selectedPack.legal_basis] ?? selectedPack.legal_basis}</div>
                </div>
                <div className="rounded bg-slate-800 border border-slate-700 p-2">
                  <div className="text-slate-500 mb-0.5">Risk</div>
                  <div className={`font-semibold ${
                    selectedPack.risk_level === "LOW" ? "text-emerald-400" : selectedPack.risk_level === "MEDIUM" ? "text-amber-400" :
                    selectedPack.risk_level === "HIGH" ? "text-orange-400" : "text-red-400"
                  }`}>{selectedPack.risk_level ?? "—"}</div>
                </div>
              </div>

              {/* Language tabs */}
              <div className="flex gap-1 bg-slate-800/50 rounded-lg p-1 w-fit">
                {(["en", "pl", "uk"] as const).map(lang => (
                  <button key={lang} onClick={() => setActiveTab(lang)}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                      activeTab === lang ? "bg-[#C41E18] text-white" : "text-slate-400 hover:text-white"
                    }`}>{lang === "en" ? "English" : lang === "pl" ? "Polski" : "Українська"}</button>
                ))}
              </div>

              <div className="bg-white rounded-lg p-6 shadow-lg">
                <pre className="text-xs text-slate-800 whitespace-pre-wrap font-sans leading-relaxed">
                  {activeTab === "en" ? selectedPack.response_text_en :
                   activeTab === "pl" ? selectedPack.response_text_pl :
                   selectedPack.response_text_uk}
                </pre>
              </div>

              {/* Evidence */}
              {Array.isArray(selectedPack.evidence_links_json) && (selectedPack.evidence_links_json as any[]).length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Evidence</h3>
                  {(selectedPack.evidence_links_json as any[]).map((e: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-slate-300 mb-1">
                      <FileText className="w-3 h-3 text-blue-400" />
                      <span>{e.type}</span>
                      {e.filingDate && <span className="text-slate-500 font-mono">{e.filingDate}</span>}
                    </div>
                  ))}
                </div>
              )}

              {/* Citations */}
              {Array.isArray(selectedPack.citation_refs_json) && (selectedPack.citation_refs_json as any[]).length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Legal Citations</h3>
                  {(selectedPack.citation_refs_json as any[]).map((c: any, i: number) => (
                    <p key={i} className="text-xs text-slate-300 mb-0.5">- {c.label}{c.article ? ` (${c.article})` : ""}</p>
                  ))}
                </div>
              )}

              <p className="text-[10px] text-slate-600">Generated: {new Date(selectedPack.created_at).toLocaleString("en-GB")} | ID: {selectedPack.id?.slice(0, 8)}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
