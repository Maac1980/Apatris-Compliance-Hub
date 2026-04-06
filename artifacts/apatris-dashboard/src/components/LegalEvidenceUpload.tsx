/**
 * LegalEvidenceUpload — upload filing evidence (MoS / UPO / TRC receipt)
 * to confirm legal protection after permit expiry.
 *
 * Integrates with the legal engine:
 *  1. Captures source document metadata
 *  2. Extracts/assigns filingDate
 *  3. Calls POST /api/workers/:id/legal-evidence
 *  4. Backend triggers legal re-evaluation automatically
 */

import React, { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { authHeaders, BASE } from "@/lib/api";
import {
  Upload, FileCheck2, AlertCircle, Loader2, Shield, X, FileText, Calendar,
} from "lucide-react";

// ═══ TYPES ══════════════════════════════════════════════════════════════════

const SOURCE_TYPES = [
  { value: "UPO", label: "UPO (Urzędowe Poświadczenie Odbioru)", description: "Official receipt from ePUAP confirming electronic submission" },
  { value: "MOS", label: "MoS (Potwierdzenie złożenia)", description: "Filing confirmation stamp from voivodeship office" },
  { value: "TRC_FILING", label: "TRC Filing Receipt", description: "Temporary Residence Card application receipt" },
  { value: "IMMIGRATION_RECEIPT", label: "Immigration Receipt", description: "General immigration office filing receipt" },
] as const;

type SourceType = typeof SOURCE_TYPES[number]["value"];

interface EvidenceResult {
  evidence: Record<string, unknown>;
  legalSnapshot: {
    legalStatus: string;
    legalBasis: string;
    riskLevel: string;
    deployability: string;
    summary: string;
  };
  filingDateUsed: string;
}

interface LegalEvidenceUploadProps {
  workerId: string;
  onUploadSuccess?: (result: EvidenceResult) => void;
}

// ═══ COMPONENT ══════════════════════════════════════════════════════════════

export function LegalEvidenceUpload({ workerId, onUploadSuccess }: LegalEvidenceUploadProps) {
  const [sourceType, setSourceType] = useState<SourceType>("UPO");
  const [filingDate, setFilingDate] = useState(new Date().toISOString().slice(0, 10));
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [result, setResult] = useState<EvidenceResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/workers/${workerId}/legal-evidence`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          sourceType,
          fileName: file?.name ?? `${sourceType}_evidence`,
          fileUrl: file ? `pending_upload/${file.name}` : null,
          filingDate,
          notes: notes || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error ?? "Upload failed");
      }
      return res.json() as Promise<EvidenceResult>;
    },
    onSuccess: (data) => {
      setResult(data);
      onUploadSuccess?.(data);
    },
  });

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f && isValidFile(f)) setFile(f);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f && isValidFile(f)) setFile(f);
  };

  const isValidFile = (f: File) =>
    f.type === "application/pdf" || f.type.startsWith("image/");

  const resetForm = () => {
    setFile(null);
    setNotes("");
    setResult(null);
    uploadMutation.reset();
    if (fileRef.current) fileRef.current.value = "";
  };

  // ── Success state ────────────────────────────────────────────────────────
  if (result) {
    const snap = result.legalSnapshot;
    const statusColor =
      snap.riskLevel === "LOW" ? "text-emerald-400" :
      snap.riskLevel === "MEDIUM" ? "text-amber-400" :
      snap.riskLevel === "HIGH" ? "text-orange-400" : "text-red-400";

    return (
      <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-emerald-400">
            <FileCheck2 className="w-4 h-4" />
            <span className="text-sm font-semibold">Evidence uploaded — legal status updated</span>
          </div>
          <button onClick={resetForm} className="text-slate-400 hover:text-slate-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded bg-slate-900/50 p-2">
            <div className="text-slate-500 mb-0.5">Filing Date Used</div>
            <div className="text-slate-200 font-mono">{result.filingDateUsed}</div>
          </div>
          <div className="rounded bg-slate-900/50 p-2">
            <div className="text-slate-500 mb-0.5">Legal Status</div>
            <div className={`font-semibold ${statusColor}`}>{snap.legalStatus}</div>
          </div>
          <div className="rounded bg-slate-900/50 p-2">
            <div className="text-slate-500 mb-0.5">Legal Basis</div>
            <div className="text-slate-200">{snap.legalBasis}</div>
          </div>
          <div className="rounded bg-slate-900/50 p-2">
            <div className="text-slate-500 mb-0.5">Deployability</div>
            <div className={`font-semibold ${
              snap.deployability === "ALLOWED" ? "text-emerald-400" :
              snap.deployability === "CONDITIONAL" ? "text-amber-400" :
              snap.deployability === "APPROVAL_REQUIRED" ? "text-orange-400" : "text-red-400"
            }`}>{snap.deployability}</div>
          </div>
        </div>

        {snap.summary && (
          <p className="text-xs text-slate-400 leading-relaxed">{snap.summary}</p>
        )}

        <button
          onClick={resetForm}
          className="w-full text-xs py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
        >
          Upload another document
        </button>
      </div>
    );
  }

  // ── Upload form ──────────────────────────────────────────────────────────
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Shield className="w-4 h-4 text-blue-400" />
        <span className="text-sm font-semibold text-slate-200">Upload filing evidence (MoS / UPO / TRC)</span>
      </div>
      <p className="text-xs text-slate-400">
        Used to confirm legal protection after permit expiry. Triggers legal status update.
      </p>

      {/* Source type selector */}
      <div className="space-y-1">
        <label className="text-xs text-slate-500 font-medium">Evidence Type</label>
        <select
          value={sourceType}
          onChange={(e) => setSourceType(e.target.value as SourceType)}
          className="w-full text-sm bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-slate-200 focus:border-blue-500 focus:outline-none"
        >
          {SOURCE_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <p className="text-[11px] text-slate-500">
          {SOURCE_TYPES.find(t => t.value === sourceType)?.description}
        </p>
      </div>

      {/* Filing date */}
      <div className="space-y-1">
        <label className="text-xs text-slate-500 font-medium flex items-center gap-1">
          <Calendar className="w-3 h-3" /> Filing Date
        </label>
        <input
          type="date"
          value={filingDate}
          onChange={(e) => setFilingDate(e.target.value)}
          className="w-full text-sm bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-slate-200 focus:border-blue-500 focus:outline-none"
        />
        <p className="text-[11px] text-slate-500">
          Date the application was filed at the voivodeship office or via ePUAP.
        </p>
      </div>

      {/* File drop zone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleFileDrop}
        className={`relative border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer ${
          file ? "border-blue-500/50 bg-blue-500/5" : "border-slate-600 hover:border-slate-500 bg-slate-900/30"
        }`}
        onClick={() => fileRef.current?.click()}
      >
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,image/*"
          onChange={handleFileSelect}
          className="hidden"
        />
        {file ? (
          <div className="flex items-center justify-center gap-2 text-sm text-blue-300">
            <FileText className="w-4 h-4" />
            <span className="truncate max-w-[200px]">{file.name}</span>
            <button
              onClick={(e) => { e.stopPropagation(); setFile(null); if (fileRef.current) fileRef.current.value = ""; }}
              className="text-slate-400 hover:text-red-400"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <div className="space-y-1">
            <Upload className="w-5 h-5 mx-auto text-slate-500" />
            <p className="text-xs text-slate-400">Drop PDF or image, or click to browse</p>
            <p className="text-[11px] text-slate-500">Max 10 MB</p>
          </div>
        )}
      </div>

      {/* Notes */}
      <div className="space-y-1">
        <label className="text-xs text-slate-500 font-medium">Notes (optional)</label>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Stamp reference number, office location..."
          className="w-full text-sm bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-slate-200 placeholder:text-slate-600 focus:border-blue-500 focus:outline-none"
        />
      </div>

      {/* Error message */}
      {uploadMutation.isError && (
        <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 rounded px-3 py-2">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          <span>{(uploadMutation.error as Error).message}</span>
        </div>
      )}

      {/* Submit */}
      <button
        onClick={() => uploadMutation.mutate()}
        disabled={uploadMutation.isPending}
        className="w-full flex items-center justify-center gap-2 py-2 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
      >
        {uploadMutation.isPending ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Uploading & evaluating...
          </>
        ) : (
          <>
            <Upload className="w-4 h-4" />
            Upload & Trigger Legal Evaluation
          </>
        )}
      </button>
    </div>
  );
}
