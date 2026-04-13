/**
 * DocUploadTab — mobile document upload with AI intake.
 * Available for Executive, LegalHead, and Coordinator tiers.
 */

import React, { useState, useRef } from "react";
import { Upload, FileText, Loader2, CheckCircle2, AlertTriangle, X, Camera } from "lucide-react";

const BASE = "/api/";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_token") || "";
  return { Authorization: `Bearer ${token}` };
}

export function DocUploadTab() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (f: File) => {
    setFile(f);
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", f);
      const res = await fetch(`${BASE}v1/intake/process`, {
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

  const clear = () => { setFile(null); setResult(null); setError(""); };

  return (
    <div className="p-4 min-h-full overflow-y-auto pb-24 bg-[#0c0c0e]">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-white">Document Upload</h2>
        <p className="text-xs text-white/40">AI extracts data from passport, TRC, work permit, BHP, medical, contracts</p>
      </div>

      {!result ? (
        <div className="space-y-3">
          {/* Upload area */}
          <div
            onClick={() => inputRef.current?.click()}
            className="border-2 border-dashed border-white/10 rounded-2xl p-8 text-center active:scale-[0.98] transition-transform"
          >
            <input ref={inputRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
            {loading ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-[#C41E18]" />
                <p className="text-sm text-white/50">AI analyzing {file?.name}...</p>
              </div>
            ) : (
              <>
                <Upload className="w-10 h-10 mx-auto mb-3 text-white/20" />
                <p className="text-sm text-white/60 font-medium">Tap to select document</p>
                <p className="text-[10px] text-white/30 mt-1">PDF, JPG, PNG — max 20MB</p>
              </>
            )}
          </div>

          {/* Camera button for mobile */}
          <button
            onClick={() => cameraRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 py-3 bg-white/5 border border-white/10 rounded-xl text-white/60 active:bg-white/10"
          >
            <input ref={cameraRef} type="file" className="hidden" accept="image/*" capture="environment"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
            <Camera className="w-4 h-4" />
            <span className="text-sm font-medium">Take Photo</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Success header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <span className="text-sm font-bold text-white">Document Analyzed</span>
            </div>
            <button onClick={clear} className="p-1.5 text-white/30 hover:text-white"><X className="w-4 h-4" /></button>
          </div>

          {/* Document type */}
          {result.classification?.documentType && (
            <div className="bg-violet-500/10 border border-violet-500/20 rounded-xl p-3">
              <p className="text-[10px] text-violet-400 font-bold uppercase">Document Type</p>
              <p className="text-sm text-white font-bold mt-0.5">{result.classification.documentType}</p>
              {result.aiConfidence && (
                <p className="text-[10px] text-white/40 mt-0.5">{Math.round(result.aiConfidence)}% confidence</p>
              )}
            </div>
          )}

          {/* Worker match */}
          {result.workerMatch?.matched && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
              <p className="text-[10px] text-emerald-400 font-bold uppercase">Worker Matched</p>
              <p className="text-sm text-white font-bold mt-0.5">{result.workerMatch.workerName}</p>
              <p className="text-[10px] text-white/40">{Math.round(result.workerMatch.confidence ?? 0)}% match</p>
            </div>
          )}

          {/* Extracted fields */}
          {result.credentials && Object.entries(result.credentials).filter(([, v]) => v).length > 0 && (
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
              <p className="text-[10px] text-white/40 font-bold uppercase mb-2">Extracted Data</p>
              <div className="space-y-1.5">
                {Object.entries(result.credentials).filter(([, v]) => v).slice(0, 10).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-xs">
                    <span className="text-white/40">{k}</span>
                    <span className="text-white font-mono">{String(v).slice(0, 25)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Legal impact */}
          {result.legalImpact?.impactType && result.legalImpact.impactType !== "NO_LEGAL_IMPACT" && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-[10px] text-amber-400 font-bold uppercase">Legal Impact</p>
                <p className="text-xs text-white mt-0.5">{result.legalImpact.impactType}</p>
              </div>
            </div>
          )}

          {/* Suggested actions */}
          {result.suggestedActions?.length > 0 && (
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
              <p className="text-[10px] text-white/40 font-bold uppercase mb-2">Suggested Actions</p>
              {result.suggestedActions.slice(0, 4).map((a: any, i: number) => (
                <div key={i} className="flex items-center gap-2 text-xs mb-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${a.priority === "high" ? "bg-red-400" : a.priority === "medium" ? "bg-amber-400" : "bg-emerald-400"}`} />
                  <span className="text-white/70">{a.action}: {a.reason}</span>
                </div>
              ))}
            </div>
          )}

          {/* Upload another */}
          <button onClick={clear}
            className="w-full py-3 bg-white/5 border border-white/10 rounded-xl text-white/60 text-sm font-medium active:bg-white/10">
            Upload Another Document
          </button>
        </div>
      )}

      {error && (
        <div className="mt-3 bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-xs text-red-400">
          {error}
        </div>
      )}
    </div>
  );
}
