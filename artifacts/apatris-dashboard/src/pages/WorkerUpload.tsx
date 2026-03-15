import React, { useState } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Upload, CheckCircle2, Loader2, FileText, AlertTriangle } from "lucide-react";

const DOC_TYPES = [
  { key: "passport", label: "Passport", hint: "Main identification passport page (photo page)" },
  { key: "trc", label: "TRC / Karta Pobytu", hint: "Temporary or permanent residence card" },
  { key: "bhp", label: "BHP Safety Certificate", hint: "Health & safety training certificate" },
  { key: "contract", label: "Employment Contract", hint: "Signed employment agreement" },
];

function UploadButton({ workerId, docType, label, hint }: { workerId: string; docType: string; label: string; hint: string }) {
  const [state, setState] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setState("uploading");
    setErrorMsg("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("docType", docType);
      const base = import.meta.env.BASE_URL;
      const res = await fetch(`${base}api/workers/${workerId}/upload`, { method: "POST", body: form });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(err.error ?? "Upload failed");
      }
      setState("done");
    } catch (err) {
      setState("error");
      setErrorMsg(err instanceof Error ? err.message : "Upload failed");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <label className={`block w-full rounded-xl border-2 border-dashed p-5 cursor-pointer transition-all select-none ${
      state === "done" ? "border-green-500/60 bg-green-500/10 cursor-default" :
      state === "error" ? "border-red-500/60 bg-red-500/10" :
      state === "uploading" ? "border-slate-500 bg-slate-800/50 cursor-not-allowed" :
      "border-slate-600 bg-slate-800/30 hover:border-red-500/50 hover:bg-red-500/5"
    }`}>
      <input ref={inputRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={handleFile} disabled={state === "uploading" || state === "done"} />
      <div className="flex items-start gap-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
          state === "done" ? "bg-green-500/20" : state === "error" ? "bg-red-500/20" : "bg-slate-700"
        }`}>
          {state === "uploading" ? <Loader2 className="w-5 h-5 text-gray-400 animate-spin" /> :
           state === "done" ? <CheckCircle2 className="w-5 h-5 text-green-400" /> :
           state === "error" ? <AlertTriangle className="w-5 h-5 text-red-400" /> :
           <Upload className="w-5 h-5 text-gray-400" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-bold ${state === "done" ? "text-green-300" : state === "error" ? "text-red-300" : "text-white"}`}>
            {state === "uploading" ? `Uploading ${label}…` :
             state === "done" ? `${label} — Uploaded!` :
             state === "error" ? `${label} — Failed` :
             label}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {state === "error" ? errorMsg :
             state === "done" ? "Document received. Thank you." :
             hint}
          </p>
          {state === "idle" && (
            <p className="text-[10px] text-gray-600 mt-1.5">PDF, JPG, PNG or WebP • Max 10 MB</p>
          )}
          {state === "error" && (
            <button
              onClick={(e) => { e.preventDefault(); setState("idle"); }}
              className="mt-2 text-xs text-red-400 underline hover:text-red-300"
            >Try again</button>
          )}
        </div>
      </div>
    </label>
  );
}

export default function WorkerUpload() {
  const params = useParams<{ id: string }>();
  const workerId = params.id;

  const { data, isLoading, isError } = useQuery<{ id: string; name: string }>({
    queryKey: ["worker-public", workerId],
    queryFn: async () => {
      const base = import.meta.env.BASE_URL;
      const res = await fetch(`${base}api/workers/${workerId}/public`);
      if (!res.ok) throw new Error("Worker not found");
      return res.json();
    },
    enabled: !!workerId,
    retry: 1,
  });

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-700 bg-slate-900/95 px-6 py-4 flex items-center gap-3"
        style={{ boxShadow: "0 1px 0 rgba(196,30,24,0.1)" }}>
        <div className="w-10 h-10 rounded-full bg-white flex-shrink-0 flex items-center justify-center">
          <svg width="32" height="32" viewBox="0 0 38 38" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M19 2 L33 8.5 L33 21 Q33 30 19 36 Q5 30 5 21 L5 8.5 Z" fill="#fef2f2" stroke="#C41E18" strokeWidth="1.5" strokeLinejoin="round" />
            <text x="19" y="28" textAnchor="middle" fontSize="19" fontWeight="900" fontFamily="Arial Black, Arial, sans-serif" fill="#C41E18" letterSpacing="-0.5">A</text>
          </svg>
        </div>
        <div>
          <h1 className="text-base font-bold tracking-widest uppercase text-white leading-none">Apatris Document Upload</h1>
          <p className="text-[10px] text-red-500 font-mono uppercase tracking-widest mt-0.5">Certified Welding Outsourcing</p>
        </div>
      </header>

      <main className="flex-1 flex items-start justify-center p-6">
        <div className="w-full max-w-lg space-y-6 pt-4">
          {isLoading ? (
            <div className="flex flex-col items-center gap-4 py-20">
              <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
              <p className="text-gray-400 font-mono text-sm">Loading…</p>
            </div>
          ) : isError ? (
            <div className="text-center py-20 space-y-3">
              <AlertTriangle className="w-12 h-12 text-red-500 mx-auto" />
              <p className="text-white font-bold text-lg">Link Not Valid</p>
              <p className="text-gray-400 text-sm">This upload link is invalid or has expired.<br />Please contact your Apatris coordinator for a new link.</p>
            </div>
          ) : (
            <>
              <div className="rounded-xl bg-red-600/10 border border-red-500/20 p-5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-red-400 mb-1">Secure Document Upload</p>
                <h2 className="text-xl font-bold text-white">{data!.name}</h2>
                <p className="text-sm text-gray-400 mt-1">
                  Please upload the required documents below. Accepted formats: PDF, JPG, PNG.
                  Your documents go directly to the Apatris compliance office.
                </p>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-bold uppercase tracking-widest text-gray-400 flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5" /> Required Documents
                </p>
                {DOC_TYPES.map((doc) => (
                  <UploadButton
                    key={doc.key}
                    workerId={workerId}
                    docType={doc.key}
                    label={doc.label}
                    hint={doc.hint}
                  />
                ))}
              </div>

              <div className="rounded-xl bg-slate-800 border border-slate-700 p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">Important Notes</p>
                <ul className="text-xs text-gray-400 space-y-1.5 list-disc list-inside">
                  <li>Documents are uploaded securely and go directly to Apatris office</li>
                  <li>Ensure documents are clearly legible and not expired</li>
                  <li>Contact your site coordinator if you have questions</li>
                </ul>
              </div>
            </>
          )}
        </div>
      </main>

      <footer className="border-t border-slate-700/50 px-6 py-4 text-center">
        <p className="text-[10px] font-mono text-gray-600">Apatris Sp. z o.o. · Certified Welding Outsourcing · Secure Document Portal</p>
      </footer>
    </div>
  );
}
