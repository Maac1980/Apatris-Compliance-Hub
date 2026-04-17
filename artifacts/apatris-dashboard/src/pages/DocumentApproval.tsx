/**
 * Document Approval — upload, review, approve/reject documents per worker.
 * Includes auto-fill document templates.
 */

import React, { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { authHeaders, BASE } from "@/lib/api";
import {
  FileText, Upload, CheckCircle2, XOctagon, Clock, Loader2, ArrowLeft,
  FileSignature, Download, AlertTriangle, Search, ChevronDown,
} from "lucide-react";

// ═══ DOCUMENT TEMPLATES ═════════════════════════════════════════════════════

const TEMPLATES = [
  { id: "annex1", label: "Annex 1 (Employer Declaration)", category: "MOS", fields: ["employer", "worker", "permit"] },
  { id: "umowa_zlecenie", label: "Umowa Zlecenie (Service Contract)", category: "Contract", fields: ["employer", "worker", "rate", "dates"] },
  { id: "umowa_o_prace", label: "Umowa o Pracę (Employment Contract)", category: "Contract", fields: ["employer", "worker", "rate", "dates", "position"] },
  { id: "oswiadczenie", label: "Oświadczenie (Work Declaration)", category: "Declaration", fields: ["employer", "worker", "position", "dates"] },
  { id: "poa", label: "Power of Attorney (Pełnomocnictwo)", category: "Legal", fields: ["employer", "representative", "scope"] },
  { id: "upo_request", label: "UPO Filing Confirmation Request", category: "MOS", fields: ["worker", "case_reference", "filing_date"] },
];

const APATRIS = { name: "Apatris Sp. z o.o.", nip: "5252828706", krs: "0001058153", address: "ul. Chlodna 51, 00-867 Warszawa" };

const DOC_TYPES = ["Passport", "TRC", "Work Permit", "Contract", "BHP Certificate", "Medical Exam", "UPO", "Decision Letter", "Annex 1", "Oświadczenie", "Other"];

// ═══ STATUS STYLES ══════════════════════════════════════════════════════════

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  uploaded: { bg: "bg-slate-500/20", text: "text-slate-400", label: "Uploaded" },
  under_review: { bg: "bg-blue-500/20", text: "text-blue-400", label: "Under Review" },
  approved: { bg: "bg-emerald-500/20", text: "text-emerald-400", label: "Approved" },
  rejected: { bg: "bg-red-500/20", text: "text-red-400", label: "Rejected" },
  resubmission_requested: { bg: "bg-amber-500/20", text: "text-amber-400", label: "Resubmit" },
};

// ═══ COMPONENT ══════════════════════════════════════════════════════════════

export default function DocumentApproval() {
  const [tab, setTab] = useState<"queue" | "templates">("queue");
  const [filter, setFilter] = useState("");
  const [selectedDoc, setSelectedDoc] = useState<any>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [templateWorker, setTemplateWorker] = useState("");
  const [generatingTemplate, setGeneratingTemplate] = useState<string | null>(null);

  // Fetch pending documents
  const { data: pendingData, refetch } = useQuery({
    queryKey: ["doc-approval-pending"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/workflows/queue/pending`, { headers: authHeaders() });
      if (!r.ok) return { documents: [] };
      return r.json();
    },
  });

  // Fetch all recent documents
  const { data: statsData } = useQuery({
    queryKey: ["doc-approval-stats"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/workflows/stats`, { headers: authHeaders() });
      if (!r.ok) return null;
      return r.json();
    },
  });

  // Fetch workers for template auto-fill
  const { data: workersData } = useQuery({
    queryKey: ["doc-workers"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/workers`, { headers: authHeaders() });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error((e as any).error || "Failed to load data"); }
      const j = await r.json();
      return (j.workers ?? j ?? []).map((w: any) => ({ id: w.id, name: w.name ?? w.full_name, specialization: w.specialization, site: w.assignedSite ?? w.assigned_site }));
    },
    enabled: tab === "templates",
  });

  const pending = (pendingData as any)?.documents ?? [];
  const stats = statsData as any;
  const workers = (workersData ?? []) as any[];

  const handleApprove = useCallback(async (docId: string) => {
    setActionLoading(true);
    try {
      await fetch(`${BASE}api/workflows/${docId}/approve`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ comment: "Approved" }) });
      refetch();
      setSelectedDoc(null);
    } catch { /* ignore */ }
    setActionLoading(false);
  }, [refetch]);

  const handleReject = useCallback(async (docId: string) => {
    if (!rejectReason.trim()) return;
    setActionLoading(true);
    try {
      await fetch(`${BASE}api/workflows/${docId}/reject`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ reason: rejectReason }) });
      refetch();
      setSelectedDoc(null);
      setRejectReason("");
    } catch { /* ignore */ }
    setActionLoading(false);
  }, [rejectReason, refetch]);

  const generateTemplate = useCallback(async (templateId: string, workerId: string) => {
    setGeneratingTemplate(templateId);
    try {
      // Fetch worker data for auto-fill
      const r = await fetch(`${BASE}api/workers/${workerId}`, { headers: authHeaders() });
      if (!r.ok) throw new Error("Worker not found");
      const worker = await r.json();

      const { default: jsPDF } = await import("jspdf");
      const { default: autoTable } = await import("jspdf-autotable");
      const norm = (s: string) => (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\u0142/g, "l").replace(/\u0141/g, "L");
      const template = TEMPLATES.find(t => t.id === templateId);
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const W = doc.internal.pageSize.getWidth();
      const today = new Date().toLocaleDateString("en-GB");

      // Header
      doc.setFontSize(14); doc.setFont("helvetica", "bold");
      doc.text(norm(template?.label ?? "Document"), W / 2, 20, { align: "center" });
      doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(120);
      doc.text(`Generated ${today} — Apatris Sp. z o.o.`, W / 2, 26, { align: "center" });
      doc.setDrawColor(200); doc.line(14, 30, W - 14, 30);

      // Employer section
      doc.setFontSize(10); doc.setTextColor(0); doc.setFont("helvetica", "bold");
      doc.text("Employer / Pracodawca", 14, 38);
      autoTable(doc, {
        startY: 41, margin: { left: 14, right: 14 },
        head: [["Field", "Value"]],
        body: [
          ["Company / Firma", APATRIS.name],
          ["NIP", APATRIS.nip],
          ["KRS", APATRIS.krs],
          ["Address / Adres", APATRIS.address],
        ],
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [196, 30, 24], textColor: 255 },
      });

      let y = (doc as any).lastAutoTable.finalY + 8;

      // Worker section
      doc.setFont("helvetica", "bold");
      doc.text("Worker / Pracownik", 14, y); y += 3;
      autoTable(doc, {
        startY: y, margin: { left: 14, right: 14 },
        head: [["Field", "Value"]],
        body: [
          ["Full Name / Imie i Nazwisko", norm(worker.name ?? worker.full_name ?? "")],
          ["PESEL", worker.pesel ?? "—"],
          ["Nationality / Obywatelstwo", (worker.nationality && worker.nationality !== "None") ? worker.nationality : "—"],
          ["Passport / Paszport", worker.passportNumber ?? worker.passport_number ?? "—"],
          ["Position / Stanowisko", worker.specialization ?? "—"],
          ["Site / Miejsce pracy", norm(worker.assignedSite ?? worker.assigned_site ?? "—")],
          ["Hourly Rate / Stawka", `${worker.hourlyRate ?? worker.hourly_rate ?? 0} PLN/h`],
        ],
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [30, 41, 59], textColor: 255 },
      });

      y = (doc as any).lastAutoTable.finalY + 10;

      // Signature fields
      doc.setFontSize(8); doc.setTextColor(100);
      doc.text("Employer Signature / Podpis pracodawcy: ____________________________", 14, y);
      doc.text("Date / Data: ____________________________", 14, y + 8);
      doc.text("Worker Signature / Podpis pracownika: ____________________________", 14, y + 20);
      doc.text("Date / Data: ____________________________", 14, y + 28);

      // Footer
      doc.setFontSize(7); doc.setTextColor(160); doc.setFont("helvetica", "italic");
      doc.text("Apatris Sp. z o.o. — Auto-generated document. Verify all details before signing.", W / 2, doc.internal.pageSize.getHeight() - 8, { align: "center" });

      doc.save(`${templateId}-${norm(worker.name ?? "worker").replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch { /* ignore */ }
    setGeneratingTemplate(null);
  }, []);

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <a href="/legal-immigration" className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white hover:border-slate-600 transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </a>
        <FileText className="w-7 h-7 text-[#C41E18]" />
        <div>
          <h1 className="text-2xl font-bold text-white">Document Approval</h1>
          <p className="text-sm text-slate-400">Review, approve, and generate workforce documents</p>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-4 gap-3 mb-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center">
            <p className="text-xl font-black text-white">{stats.total ?? 0}</p>
            <p className="text-[9px] text-slate-500 uppercase font-bold">Total</p>
          </div>
          <div className="bg-blue-500/5 border border-blue-500/10 rounded-xl p-3 text-center">
            <p className="text-xl font-black text-blue-400">{stats.pending ?? pending.length}</p>
            <p className="text-[9px] text-blue-400/60 uppercase font-bold">Pending</p>
          </div>
          <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-3 text-center">
            <p className="text-xl font-black text-emerald-400">{stats.approved ?? 0}</p>
            <p className="text-[9px] text-emerald-400/60 uppercase font-bold">Approved</p>
          </div>
          <div className="bg-red-500/5 border border-red-500/10 rounded-xl p-3 text-center">
            <p className="text-xl font-black text-red-400">{stats.rejected ?? 0}</p>
            <p className="text-[9px] text-red-400/60 uppercase font-bold">Rejected</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-slate-800/50 rounded-lg p-1 w-fit">
        <button onClick={() => setTab("queue")} className={`px-4 py-2 rounded-md text-sm font-bold ${tab === "queue" ? "bg-[#C41E18] text-white" : "text-slate-400"}`}>
          Approval Queue {pending.length > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full text-[9px] bg-red-500/20 text-red-300">{pending.length}</span>}
        </button>
        <button onClick={() => setTab("templates")} className={`px-4 py-2 rounded-md text-sm font-bold ${tab === "templates" ? "bg-[#C41E18] text-white" : "text-slate-400"}`}>
          Document Templates
        </button>
      </div>

      {/* ── Approval Queue ──────────────────────────────────────────────── */}
      {tab === "queue" && (
        <div>
          {pending.length === 0 ? (
            <div className="text-center py-12 text-slate-600">
              <CheckCircle2 className="w-8 h-8 mx-auto mb-2" />
              <p className="text-sm">No documents pending approval</p>
            </div>
          ) : (
            <div className="space-y-2">
              {pending.map((doc: any) => {
                const st = STATUS_STYLE[doc.status] ?? STATUS_STYLE.uploaded;
                return (
                  <div key={doc.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between hover:border-slate-700 transition-colors">
                    <div className="flex items-center gap-3">
                      <FileText className="w-5 h-5 text-slate-500" />
                      <div>
                        <p className="text-sm font-bold text-white">{doc.worker_name}</p>
                        <p className="text-[10px] text-slate-500">{doc.document_type} · uploaded by {doc.uploaded_by} · {new Date(doc.uploaded_at ?? doc.created_at).toLocaleDateString("en-GB")}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${st.bg} ${st.text}`}>{st.label}</span>
                      <button
                        onClick={() => handleApprove(doc.id)}
                        disabled={actionLoading}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold hover:bg-emerald-600/30 disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-3 h-3" /> Approve
                      </button>
                      <button
                        onClick={() => setSelectedDoc(doc)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-600/20 text-red-400 border border-red-500/30 text-xs font-bold hover:bg-red-600/30"
                      >
                        <XOctagon className="w-3 h-3" /> Reject
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Document Templates ──────────────────────────────────────────── */}
      {tab === "templates" && (
        <div className="space-y-4">
          {/* Worker selector */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Select Worker for Auto-Fill</label>
            <select
              value={templateWorker}
              onChange={e => setTemplateWorker(e.target.value)}
              className="w-full max-w-md px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-slate-500"
            >
              <option value="">— Select a worker —</option>
              {workers.map((w: any) => (
                <option key={w.id} value={w.id}>{w.name} {w.specialization ? `· ${w.specialization}` : ""}</option>
              ))}
            </select>
          </div>

          {/* Template cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {TEMPLATES.map(t => (
              <div key={t.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 hover:border-slate-700 transition-colors">
                <div className="flex items-center gap-2 mb-2">
                  <FileSignature className="w-4 h-4 text-[#C41E18]" />
                  <p className="text-sm font-bold text-white">{t.label}</p>
                </div>
                <p className="text-[10px] text-slate-500 mb-3">{t.category} · Auto-fills: {t.fields.join(", ")}</p>
                <button
                  onClick={() => templateWorker && generateTemplate(t.id, templateWorker)}
                  disabled={!templateWorker || generatingTemplate === t.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#C41E18]/10 border border-[#C41E18]/30 text-[10px] font-bold text-[#C41E18] hover:bg-[#C41E18]/20 disabled:opacity-40 transition-colors"
                >
                  {generatingTemplate === t.id ? <><Loader2 className="w-3 h-3 animate-spin" /> Generating...</> : <><Download className="w-3 h-3" /> Generate PDF</>}
                </button>
              </div>
            ))}
          </div>

          {!templateWorker && (
            <p className="text-xs text-slate-600 text-center py-4">Select a worker above to generate auto-filled documents</p>
          )}
        </div>
      )}

      {/* ── Reject Modal ──────────────────────────────────────────────── */}
      {selectedDoc && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSelectedDoc(null)} />
          <div className="relative bg-slate-900 border border-slate-700 rounded-xl p-5 w-full max-w-sm shadow-2xl space-y-4">
            <h3 className="text-sm font-bold text-white">Reject Document</h3>
            <p className="text-[11px] text-slate-500">{selectedDoc.worker_name} — {selectedDoc.document_type}</p>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="Reason for rejection..."
              rows={3}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-600 focus:outline-none resize-none"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setSelectedDoc(null)} className="px-3 py-1.5 text-xs text-slate-400">Cancel</button>
              <button
                onClick={() => handleReject(selectedDoc.id)}
                disabled={!rejectReason.trim() || actionLoading}
                className="flex items-center gap-1 px-4 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold disabled:opacity-50"
              >
                {actionLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <XOctagon className="w-3 h-3" />} Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
