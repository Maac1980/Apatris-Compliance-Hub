/**
 * ContextUpload — contextual document upload for worker panels.
 *
 * Auto-attaches worker_id, case_id, source_panel.
 * Requires doc_type selection before upload completes.
 * Refreshes relevant queries immediately after upload.
 *
 * Uses existing POST /api/workers/:id/files endpoint.
 */

import React, { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Upload, Loader2, CheckCircle2, ChevronDown, FileText } from "lucide-react";

const DOC_TYPES = [
  { value: "passport", label: "Passport" },
  { value: "permit", label: "Permit / TRC" },
  { value: "filing_proof", label: "Filing Proof (stempel)" },
  { value: "upo", label: "UPO Receipt" },
  { value: "mos", label: "MOS Submission" },
  { value: "rejection_letter", label: "Rejection Letter" },
  { value: "insurance", label: "Insurance Proof" },
  { value: "bank_statement", label: "Bank Statement" },
  { value: "contract", label: "Contract / Umowa" },
  { value: "certificate", label: "Certificate (BHP/UDT)" },
  { value: "supporting", label: "Supporting Document" },
  { value: "miscellaneous", label: "Other / Miscellaneous" },
] as const;

type DocType = (typeof DOC_TYPES)[number]["value"];

interface ContextUploadProps {
  workerId: string;
  caseId?: string;
  sourcePanel: "worker_documents" | "compliance" | "legal_evidence" | "legal_case";
  defaultDocType?: DocType;
  onUploaded?: (file: { id: string; fileName: string; docType: string }) => void;
  compact?: boolean;
}

export function ContextUpload({
  workerId,
  caseId,
  sourcePanel,
  defaultDocType = "supporting",
  onUploaded,
  compact = false,
}: ContextUploadProps) {
  const [docType, setDocType] = useState<DocType>(defaultDocType);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const [lastFileName, setLastFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !workerId) return;

    setUploading(true);
    setDone(false);
    setLastFileName(file.name);

    try {
      const token = localStorage.getItem("apatris_jwt");
      const form = new FormData();
      form.append("file", file);
      form.append("docType", docType);
      form.append("notes", `Uploaded from ${sourcePanel} panel`);
      if (caseId) form.append("caseId", caseId);

      const res = await fetch(
        `${import.meta.env.BASE_URL}api/workers/${workerId}/files`,
        {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: form,
        },
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(err.error ?? "Upload failed");
      }

      const data = await res.json();

      // Refresh all relevant query caches
      qc.invalidateQueries({ queryKey: ["worker-evidence", workerId] });
      qc.invalidateQueries({ queryKey: ["worker-doc-history", workerId] });
      qc.invalidateQueries({ queryKey: ["worker-intelligence", workerId] });

      setDone(true);
      onUploaded?.({ id: data.id, fileName: file.name, docType });
      setTimeout(() => setDone(false), 4000);
    } catch (err) {
      console.error("[ContextUpload] Upload failed:", err);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <select
          value={docType}
          onChange={(e) => setDocType(e.target.value as DocType)}
          className="bg-slate-800 border border-slate-600 text-white rounded px-2 py-1 text-[11px] flex-shrink-0"
        >
          {DOC_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          accept=".pdf,.jpg,.jpeg,.png,.webp"
          onChange={handleFile}
          disabled={uploading}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading || !workerId}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-bold transition-colors ${
            done
              ? "bg-green-600/20 border border-green-500/30 text-green-400"
              : "bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-400"
          } disabled:opacity-50`}
        >
          {uploading ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : done ? (
            <CheckCircle2 className="w-3 h-3" />
          ) : (
            <Upload className="w-3 h-3" />
          )}
          {uploading ? "Uploading..." : done ? "Uploaded!" : "Upload"}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <FileText className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Upload Document</p>
      </div>

      {/* Doc type selector */}
      <div className="relative">
        <select
          value={docType}
          onChange={(e) => setDocType(e.target.value as DocType)}
          className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-xs appearance-none cursor-pointer focus:outline-none focus:border-blue-500/60"
        >
          {DOC_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>

      {/* Upload area */}
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        accept=".pdf,.jpg,.jpeg,.png,.webp"
        onChange={handleFile}
        disabled={uploading}
      />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={uploading || !workerId}
        className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border-2 border-dashed transition-all text-xs font-bold ${
          done
            ? "bg-green-500/10 border-green-500/50 text-green-400"
            : uploading
              ? "bg-slate-700 border-slate-500 text-gray-400 cursor-not-allowed"
              : "bg-slate-900 border-slate-600 text-gray-300 hover:border-blue-500/50 hover:text-blue-400 cursor-pointer"
        } disabled:opacity-50`}
      >
        {uploading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : done ? (
          <CheckCircle2 className="w-4 h-4" />
        ) : (
          <Upload className="w-4 h-4" />
        )}
        {uploading ? `Uploading ${lastFileName}...` : done ? `${lastFileName} uploaded!` : "Choose file (PDF, JPG, PNG)"}
      </button>
      <p className="text-[10px] text-slate-600 text-center">Max 20 MB · Auto-linked to this worker{caseId ? " and case" : ""}</p>
    </div>
  );
}
