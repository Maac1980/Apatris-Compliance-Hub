/**
 * QuickDocUpload — lightweight reusable AI document upload component.
 * Drop on any page to add instant document intake capability.
 * Calls /api/v1/intake/process and shows extracted data inline.
 */

import React, { useState, useRef } from "react";
import { authHeaders, BASE } from "@/lib/api";
import { Upload, FileText, Loader2, CheckCircle2, AlertTriangle, X, ChevronDown, ChevronUp } from "lucide-react";

interface Props {
  collapsed?: boolean;
  label?: string;
}

export function QuickDocUpload({ collapsed = true, label = "Upload Document (AI)" }: Props) {
  const [open, setOpen] = useState(!collapsed);
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
      const res = await fetch(`${BASE}api/v1/intake/process`, {
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

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-800/50 transition-colors">
        <div className="flex items-center gap-2">
          <Upload className="w-4 h-4 text-[#C41E18]" />
          <span className="text-xs font-bold text-white">{label}</span>
          {result && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
        </div>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-slate-500" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-500" />}
      </button>

      {open && (
        <div className="px-4 pb-4">
          {!result ? (
            <div
              onDragOver={e => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className="border-2 border-dashed border-slate-700 rounded-lg p-6 text-center cursor-pointer hover:border-[#C41E18]/50 transition-colors"
            >
              <input ref={inputRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
              {loading ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-[#C41E18]" />
                  <p className="text-xs text-slate-400">AI analyzing {file?.name}...</p>
                </div>
              ) : (
                <>
                  <FileText className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                  <p className="text-xs text-slate-400">Drop PDF or image — AI extracts data instantly</p>
                  <p className="text-[9px] text-slate-600 mt-1">Supports: passport, TRC, work permit, BHP, medical, contracts, UPO, decisions</p>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold text-white">Extracted</span>
                  {result.classification?.documentType && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 font-bold">
                      {result.classification.documentType}
                    </span>
                  )}
                  {result.aiConfidence && (
                    <span className="text-[9px] text-slate-500">{Math.round(result.aiConfidence)}% AI</span>
                  )}
                </div>
                <button onClick={clear} className="p-1 text-slate-500 hover:text-white"><X className="w-3.5 h-3.5" /></button>
              </div>

              {/* Worker match */}
              {result.workerMatch?.matched && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2 text-xs">
                  <span className="text-emerald-400 font-bold">Matched: </span>
                  <span className="text-white">{result.workerMatch.workerName}</span>
                  <span className="text-slate-500 ml-1">({Math.round(result.workerMatch.confidence ?? 0)}%)</span>
                </div>
              )}

              {/* Key fields */}
              {result.credentials && (
                <div className="grid grid-cols-2 gap-1.5">
                  {Object.entries(result.credentials).filter(([, v]) => v).slice(0, 8).map(([k, v]) => (
                    <div key={k} className="text-[10px] flex justify-between bg-slate-800/50 rounded px-2 py-1">
                      <span className="text-slate-500">{k}</span>
                      <span className="text-white font-mono">{String(v).slice(0, 20)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Legal impact */}
              {result.legalImpact?.impactType && result.legalImpact.impactType !== "NO_LEGAL_IMPACT" && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-2 text-[10px]">
                  <AlertTriangle className="w-3 h-3 text-amber-400 inline mr-1" />
                  <span className="text-amber-400 font-bold">{result.legalImpact.impactType}</span>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2">
                <a href={`/document-intake`} className="flex-1 px-3 py-1.5 bg-[#C41E18] text-white rounded-lg text-[10px] font-bold text-center hover:bg-[#a81914]">
                  Open Full Intake
                </a>
                <button onClick={clear} className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded-lg text-[10px] font-bold hover:bg-slate-700">
                  Upload Another
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-2 bg-red-500/10 border border-red-500/20 rounded-lg p-2 text-[10px] text-red-400">
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
