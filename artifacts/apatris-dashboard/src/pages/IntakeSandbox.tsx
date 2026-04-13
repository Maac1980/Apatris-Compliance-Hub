/**
 * Intake Sandbox — AI document extraction with ZERO database writes.
 * For: client demos, lawyer training, QA testing.
 * Admin-only in production.
 */

import React, { useState, useRef } from "react";
import { authHeaders, BASE } from "@/lib/api";
import {
  FlaskConical, Upload, FileText, Loader2, CheckCircle2, AlertTriangle,
  Shield, X, ArrowLeft, Database,
} from "lucide-react";

export default function IntakeSandbox() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (f: File) => {
    setFile(f);
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", f);
      const res = await fetch(`${BASE}api/v1/intake/sandbox`, {
        method: "POST",
        headers: { Authorization: authHeaders().Authorization },
        body: form,
      });
      if (!res.ok) throw new Error("Upload failed");
      setResult(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    }
    setLoading(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) handleUpload(f);
  };

  const clear = () => { setFile(null); setResult(null); setError(""); };
  const extraction = result?.extraction ?? {};

  const RISK_STYLE: Record<string, { color: string; bg: string }> = {
    LOW: { color: "text-emerald-400", bg: "bg-emerald-500/10" },
    MEDIUM: { color: "text-amber-400", bg: "bg-amber-500/10" },
    HIGH: { color: "text-orange-400", bg: "bg-orange-500/10" },
    CRITICAL: { color: "text-red-400", bg: "bg-red-500/10" },
  };

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <a href="/document-intake" className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white hover:border-slate-600 transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </a>
        <FlaskConical className="w-7 h-7 text-amber-400" />
        <div>
          <h1 className="text-2xl font-bold text-white">Intake Sandbox</h1>
          <p className="text-sm text-slate-400">AI document extraction — zero database writes. Safe for demos + training.</p>
        </div>
      </div>

      {/* Safety badge */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-2">
          <Shield className="w-4 h-4 text-emerald-400" />
          <span className="text-sm text-emerald-400 font-bold">Sandbox Mode</span>
        </div>
        <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2">
          <Database className="w-4 h-4 text-slate-500" />
          <span className="text-sm text-slate-500">No data written to database</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upload area */}
        <div>
          <div
            onDragOver={e => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => !loading && inputRef.current?.click()}
            className="border-2 border-dashed border-slate-700 rounded-2xl p-12 text-center cursor-pointer hover:border-[#C41E18]/50 transition-colors bg-slate-900"
          >
            <input ref={inputRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
            {loading ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-10 h-10 animate-spin text-[#C41E18]" />
                <p className="text-sm text-slate-400">AI analyzing {file?.name}...</p>
                <p className="text-[10px] text-slate-600">No data will be saved</p>
              </div>
            ) : (
              <>
                <Upload className="w-12 h-12 mx-auto mb-4 text-slate-600" />
                <p className="text-sm text-slate-300 font-medium">Drop document here or click to upload</p>
                <p className="text-[10px] text-slate-600 mt-2">Passport, TRC, work permit, BHP, medical, contracts, UPO, decisions</p>
                <p className="text-[10px] text-slate-700 mt-1">PDF, JPG, PNG, WebP — max 20MB</p>
              </>
            )}
          </div>

          {error && (
            <div className="mt-4 bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-sm text-red-400">{error}</div>
          )}

          {result && (
            <div className="mt-4 bg-slate-900 border border-slate-700 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm font-bold text-white">Analysis Complete</span>
                </div>
                <button onClick={clear} className="p-1 text-slate-500 hover:text-white"><X className="w-4 h-4" /></button>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div className="bg-slate-800/50 rounded px-2 py-1.5">
                  <span className="text-slate-500">File</span>
                  <p className="text-white font-mono truncate">{result.fileName}</p>
                </div>
                <div className="bg-slate-800/50 rounded px-2 py-1.5">
                  <span className="text-slate-500">Size</span>
                  <p className="text-white font-mono">{Math.round((result.fileSize ?? 0) / 1024)}KB</p>
                </div>
                <div className="bg-slate-800/50 rounded px-2 py-1.5">
                  <span className="text-slate-500">AI Model</span>
                  <p className="text-white font-mono">{result.aiModel ?? "—"}</p>
                </div>
                <div className="bg-emerald-500/10 rounded px-2 py-1.5">
                  <span className="text-emerald-400">DB Written</span>
                  <p className="text-emerald-400 font-bold">NO</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Extraction results */}
        <div>
          {result ? (
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 space-y-4">
              {/* Document type */}
              {extraction.documentType && (
                <div className="bg-violet-500/10 border border-violet-500/20 rounded-lg p-3">
                  <p className="text-[9px] text-violet-400 font-bold uppercase">Document Type</p>
                  <p className="text-lg font-bold text-white">{extraction.documentType}</p>
                </div>
              )}

              {/* Risk level */}
              {extraction.riskLevel && (
                <div className={`${RISK_STYLE[extraction.riskLevel]?.bg ?? "bg-slate-800"} border border-slate-700 rounded-lg p-3`}>
                  <p className="text-[9px] font-bold uppercase text-slate-400">Risk Level</p>
                  <p className={`text-lg font-bold ${RISK_STYLE[extraction.riskLevel]?.color ?? "text-white"}`}>{extraction.riskLevel}</p>
                  {extraction.legalImpact && (
                    <p className="text-[10px] text-slate-400 mt-1">{extraction.legalImpact}</p>
                  )}
                </div>
              )}

              {/* Extracted fields */}
              <div>
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-2">Extracted Data</p>
                <div className="space-y-1">
                  {Object.entries(extraction)
                    .filter(([k]) => !["documentType", "riskLevel", "legalImpact", "suggestedActions", "raw"].includes(k))
                    .filter(([, v]) => v !== null && v !== undefined && v !== "")
                    .map(([key, val]) => (
                      <div key={key} className="flex justify-between items-center bg-slate-800/50 rounded px-3 py-1.5">
                        <span className="text-[10px] text-slate-500">{key}</span>
                        <span className="text-[10px] text-white font-mono max-w-[200px] truncate">{String(val)}</span>
                      </div>
                    ))}
                </div>
              </div>

              {/* Suggested actions */}
              {extraction.suggestedActions && (
                <div>
                  <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-2">Suggested Actions</p>
                  <div className="space-y-1">
                    {(Array.isArray(extraction.suggestedActions) ? extraction.suggestedActions : [extraction.suggestedActions]).map((a: any, i: number) => (
                      <div key={i} className="text-[10px] text-slate-300 bg-slate-800/50 rounded px-3 py-1.5">
                        {typeof a === "string" ? a : JSON.stringify(a)}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Raw output toggle */}
              {extraction.raw && (
                <details className="text-[10px]">
                  <summary className="text-slate-500 cursor-pointer hover:text-slate-300">Show raw AI output</summary>
                  <pre className="mt-2 bg-slate-800 rounded p-2 text-slate-400 whitespace-pre-wrap overflow-x-auto max-h-[300px]">{extraction.raw}</pre>
                </details>
              )}
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-8 text-center">
              <FlaskConical className="w-10 h-10 mx-auto mb-3 text-slate-700" />
              <p className="text-sm text-slate-500 font-semibold">Upload a document to test</p>
              <p className="text-[10px] text-slate-600 mt-1">AI will extract all data and assess legal risk — nothing will be saved</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
