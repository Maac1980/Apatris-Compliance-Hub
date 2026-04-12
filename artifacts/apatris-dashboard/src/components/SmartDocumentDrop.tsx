/**
 * SmartDocumentDrop — drop any PDF/image, system reads it, matches worker, extracts data.
 * Reusable across: Rejection Intelligence, Evidence Upload, TRC Service, Legal Documents.
 */

import React, { useState, useRef } from "react";
import { Upload, FileText, Loader2, CheckCircle2, AlertTriangle, User, X, UserPlus } from "lucide-react";
import { authHeaders, BASE } from "@/lib/api";

interface ExtractedFields {
  workerName: string | null;
  nationality: string | null;
  pesel: string | null;
  passportNumber: string | null;
  voivodeship: string | null;
  caseReference: string | null;
  decisionDate: string | null;
  filingDate: string | null;
  rejectionReasons: string | null;
  keyContent: string | null;
  language: string | null;
}

interface WorkerMatch {
  id: string;
  name: string;
  confidence: number;
}

interface SmartDocResult {
  extractedText: string;
  workerMatch: WorkerMatch | null;
  workerSuggestions: Array<{ id: string; name: string; score: number }>;
  documentType: string | null;
  extractedFields: ExtractedFields;
  isNewWorker: boolean;
}

interface SmartDocumentDropProps {
  onResult: (result: SmartDocResult) => void;
  onWorkerSelected?: (workerId: string, workerName: string) => void;
  label?: string;
  hint?: string;
}

export function SmartDocumentDrop({ onResult, onWorkerSelected, label, hint }: SmartDocumentDropProps) {
  const [processing, setProcessing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<SmartDocResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const createWorker = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!result?.extractedFields.workerName) return;
    setCreating(true);
    setError(null);
    try {
      // Only send fields that exist in workers table: full_name, pesel, email, phone, specialization, etc.
      // NOTE: nationality, passportNumber do NOT exist as columns — they are extracted for display only.
      const body: Record<string, string> = { name: result.extractedFields.workerName };
      if (result.extractedFields.pesel) body.pesel = result.extractedFields.pesel;
      const url = `${BASE}api/workers`;
      const res = await fetch(url, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error ?? `Create failed (${res.status})`);
      }
      const worker = await res.json();
      onWorkerSelected?.(worker.id, worker.name ?? result.extractedFields.workerName);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create worker");
    } finally {
      setCreating(false);
    }
  };

  const processFile = async (file: File) => {
    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      setError("Only PDF or image files supported");
      return;
    }
    setProcessing(true);
    setError(null);
    setResult(null);

    try {
      const form = new FormData();
      form.append("file", file);
      const token = localStorage.getItem("apatris_jwt");
      const res = await fetch(`${BASE}api/v1/smart-document/process`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error ?? "Processing failed");
      }
      const data: SmartDocResult = await res.json();
      setResult(data);
      onResult(data);

      // Auto-select matched worker
      if (data.workerMatch && onWorkerSelected) {
        onWorkerSelected(data.workerMatch.id, data.workerMatch.name);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process document");
    } finally {
      setProcessing(false);
    }
  };

  const reset = () => { setResult(null); setError(null); if (fileRef.current) fileRef.current.value = ""; };

  return (
    <div className="space-y-2">
      {/* Drop zone */}
      <div
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) processFile(f); }}
        onClick={() => fileRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors ${
          processing ? "border-blue-500/50 bg-blue-500/5" :
          result ? "border-emerald-500/50 bg-emerald-500/5" :
          error ? "border-red-500/50 bg-red-500/5" :
          "border-slate-600 hover:border-slate-500 bg-slate-900/30"
        }`}
      >
        <input ref={fileRef} type="file" accept="application/pdf,image/*" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f); }} />

        {processing ? (
          <div className="flex items-center justify-center gap-2 py-2">
            <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
            <span className="text-sm text-blue-400">Reading document...</span>
          </div>
        ) : result ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span className="text-sm text-emerald-400 font-semibold">Document read</span>
              {result.documentType && <span className="text-[10px] text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">{result.documentType}</span>}
            </div>
            <button onClick={(e) => { e.stopPropagation(); reset(); }} className="text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="py-2">
            <Upload className="w-5 h-5 mx-auto text-slate-500 mb-1" />
            <p className="text-xs text-slate-400">{label ?? "Drop PDF or image — AI reads and matches worker"}</p>
            {hint && <p className="text-[10px] text-slate-600 mt-0.5">{hint}</p>}
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 rounded px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5" />{error}
        </div>
      )}

      {/* Worker match result */}
      {result && (
        <div className="space-y-1.5">
          {result.workerMatch ? (
            <div className="flex items-center gap-2 text-xs bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
              <User className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400 font-semibold">Matched: {result.workerMatch.name}</span>
              <span className="text-slate-500 font-mono text-[10px]">{(result.workerMatch.confidence * 100).toFixed(0)}%</span>
            </div>
          ) : result.extractedFields.workerName ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-amber-400">Name found: "{result.extractedFields.workerName}" — no match in database</span>
              </div>
              <button
                onClick={(e) => createWorker(e)}
                disabled={creating}
                className="w-full flex items-center justify-center gap-2 py-1.5 rounded bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold hover:bg-emerald-600/30 transition-colors disabled:opacity-50"
              >
                {creating ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <UserPlus className="w-3 h-3" />
                )}
                Create Worker: {result.extractedFields.workerName}
                {result.extractedFields.nationality ? ` (${result.extractedFields.nationality})` : ""}
              </button>
            </div>
          ) : null}

          {/* Suggestions */}
          {!result.workerMatch && result.workerSuggestions.length > 0 && (
            <div className="text-[11px] text-slate-400">
              <span>Did you mean: </span>
              {result.workerSuggestions.map((s, i) => (
                <button key={s.id} onClick={() => onWorkerSelected?.(s.id, s.name)}
                  className="text-blue-400 hover:text-blue-300 underline ml-1">
                  {s.name}{i < result.workerSuggestions.length - 1 ? "," : ""}
                </button>
              ))}
            </div>
          )}

          {/* Extracted fields */}
          {result.extractedFields.keyContent && (
            <p className="text-[11px] text-slate-400 leading-relaxed">{result.extractedFields.keyContent}</p>
          )}
        </div>
      )}
    </div>
  );
}
