import React, { useCallback, useRef, useState } from "react";
import { X, Upload, Loader2, CheckCircle2, Zap, FileText, Shield, Award, Briefcase } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface BulkUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Category = "passport" | "bhp" | "certificate" | "contract";

interface DropZoneFile {
  file: File;
  preview?: string;
}

const CATEGORIES: { key: Category; label: string; icon: React.ElementType; color: string; hint: string }[] = [
  { key: "passport", label: "Passport", icon: FileText, color: "blue", hint: "Extracts: Name, DOB, Nationality" },
  { key: "bhp", label: "BHP Certificate", icon: Shield, color: "orange", hint: "Extracts: BHP Expiry Date" },
  { key: "certificate", label: "TRC Certificate", icon: Award, color: "green", hint: "Extracts: TRC Expiry + Specialization (MIG/TIG)" },
  { key: "contract", label: "Contract", icon: Briefcase, color: "purple", hint: "Extracts: Contract End Date" },
];

const COLOR_MAP: Record<string, string> = {
  blue:   "border-blue-500/40 bg-blue-500/10 hover:border-blue-400/70 text-blue-400",
  orange: "border-orange-500/40 bg-orange-500/10 hover:border-orange-400/70 text-orange-400",
  green:  "border-green-500/40 bg-green-500/10 hover:border-green-400/70 text-green-400",
  purple: "border-purple-500/40 bg-purple-500/10 hover:border-purple-400/70 text-purple-400",
};

const SPEC_OPTIONS = ["TIG", "MIG", "MAG", "MMA", "ARC / Electrode", "FCAW", "FABRICATOR"];

function DropZone({
  category,
  file,
  onFile,
}: {
  category: (typeof CATEGORIES)[number];
  file: DropZoneFile | null;
  onFile: (f: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const Icon = category.icon;
  const colors = COLOR_MAP[category.color];

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const f = e.dataTransfer.files[0];
      if (f) onFile(f);
    },
    [onFile]
  );

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`relative flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed cursor-pointer transition-all min-h-[120px] ${
        dragging ? "scale-[1.02] brightness-110" : ""
      } ${file ? "border-green-500/60 bg-green-500/10" : colors}`}
    >
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept=".pdf,.jpg,.jpeg,.png,.webp"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
      {file ? (
        <>
          <CheckCircle2 className="w-7 h-7 text-green-400" />
          <p className="text-xs font-bold text-green-300 text-center truncate w-full px-2">
            {file.file.name}
          </p>
          <button
            onClick={(e) => { e.stopPropagation(); onFile(null); }}
            className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"
          >
            <X className="w-3 h-3 text-white" />
          </button>
        </>
      ) : (
        <>
          <Icon className="w-6 h-6" />
          <p className="text-xs font-bold uppercase tracking-wider">{category.label}</p>
          <p className="text-[10px] text-center opacity-60 leading-tight">{category.hint}</p>
          <p className="text-[10px] opacity-40">Drop or click</p>
        </>
      )}
    </div>
  );
}

export function BulkUploadModal({ isOpen, onClose }: BulkUploadModalProps) {
  const [files, setFiles] = useState<Partial<Record<Category, DropZoneFile>>>({});
  const [workerName, setWorkerName] = useState("");
  const [profession, setProfession] = useState("");
  const [customProfession, setCustomProfession] = useState("");
  const [status, setStatus] = useState<"idle" | "scanning" | "creating" | "done" | "error">("idle");
  const [result, setResult] = useState<{ name?: string; trcExpiry?: string; bhpExpiry?: string; contractEndDate?: string; specialization?: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const setFile = (cat: Category) => (f: File | null) => {
    setFiles((prev) => {
      const next = { ...prev };
      if (f) {
        next[cat] = { file: f };
      } else {
        delete next[cat];
      }
      return next;
    });
  };

  const totalFiles = Object.keys(files).length;
  const effectiveProfession = profession === "__custom__" ? customProfession : profession;

  const handleSubmit = async () => {
    if (totalFiles === 0) return;
    setStatus("scanning");
    setResult(null);
    setErrorMsg("");

    try {
      const form = new FormData();
      for (const [cat, df] of Object.entries(files)) {
        if (df) form.append(cat, df.file);
      }
      if (effectiveProfession) {
        form.append("profession", effectiveProfession);
      }
      if (workerName.trim()) {
        form.append("workerName", workerName.trim());
      }

      setStatus("creating");
      const token = localStorage.getItem("apatris_jwt");
      const res = await fetch(`${import.meta.env.BASE_URL}api/workers/bulk-create`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error ?? "Upload failed");
      }

      const data = await res.json();
      setResult(data.extracted ?? {});
      setStatus("done");

      await queryClient.invalidateQueries();
      toast({
        title: "✓ Worker Created via AI Scan",
        description: data.extracted?.name
          ? `New worker "${data.extracted.name}" added to Airtable.`
          : "New worker record created and documents attached.",
      });
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Unknown error");
    }
  };

  const handleClose = () => {
    setFiles({});
    setWorkerName("");
    setProfession("");
    setCustomProfession("");
    setStatus("idle");
    setResult(null);
    setErrorMsg("");
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative w-full max-w-lg bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10 bg-gradient-to-r from-red-900/20 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-red-600/20 border border-red-500/30 flex items-center justify-center">
              <Zap className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide">AI SMART BULK UPLOAD</h2>
              <p className="text-xs text-gray-400 font-mono">Drop documents · AI extracts · Creates worker</p>
            </div>
          </div>
          <button onClick={handleClose} className="p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          {status === "idle" || status === "error" ? (
            <>
              <div className="grid grid-cols-2 gap-3 mb-4">
                {CATEGORIES.map((cat) => (
                  <DropZone
                    key={cat.key}
                    category={cat}
                    file={files[cat.key] ?? null}
                    onFile={setFile(cat.key)}
                  />
                ))}
              </div>

              {/* WORKER NAME — fallback if AI can't extract from passport */}
              <div className="mb-4 p-3 rounded-xl bg-slate-800 border border-slate-700 space-y-2">
                <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400">
                  Worker Name
                  <span className="ml-1 text-gray-600 normal-case font-normal">(optional — AI reads from passport, type here as backup)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Manish Suresh Shetty"
                  value={workerName}
                  onChange={(e) => setWorkerName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500/60 placeholder:text-gray-600"
                />
              </div>

              {/* PROFESSION / SPEC field */}
              <div className="mb-4 p-3 rounded-xl bg-slate-800 border border-slate-700 space-y-2">
                <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400">
                  Profession / Spec
                  <span className="ml-1 text-gray-600 normal-case font-normal">(AI auto-detects from certificate)</span>
                </label>
                <select
                  value={profession}
                  onChange={(e) => setProfession(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-red-500/60"
                >
                  <option value="">— Select or leave for AI —</option>
                  {SPEC_OPTIONS.filter(Boolean).map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                  <option value="__custom__">Custom…</option>
                </select>
                {profession === "__custom__" && (
                  <input
                    type="text"
                    placeholder="Type specialization…"
                    value={customProfession}
                    onChange={(e) => setCustomProfession(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-red-500/60 placeholder:text-gray-600"
                  />
                )}
              </div>

              {status === "error" && (
                <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-500/30 text-red-300 text-sm font-mono">
                  {errorMsg}
                </div>
              )}

              <p className="text-[11px] text-gray-500 text-center mb-4 font-mono">
                {totalFiles === 0
                  ? "Upload at least one document to create a new worker record"
                  : `${totalFiles} file${totalFiles > 1 ? "s" : ""} ready · AI will scan all images`}
              </p>

              <button
                onClick={handleSubmit}
                disabled={totalFiles === 0}
                className={`w-full py-3 rounded-xl font-bold text-sm uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${
                  totalFiles === 0
                    ? "bg-white/5 text-gray-600 cursor-not-allowed border border-white/5"
                    : "bg-red-600 hover:bg-red-700 text-white shadow-[0_0_20px_rgba(220,38,38,0.4)]"
                }`}
              >
                <Zap className="w-4 h-4" />
                Create Worker with AI Scan
              </button>
            </>
          ) : status === "scanning" || status === "creating" ? (
            <div className="py-12 flex flex-col items-center gap-4">
              <Loader2 className="w-12 h-12 text-red-400 animate-spin" />
              <p className="text-white font-bold text-lg">
                {status === "scanning" ? "AI Scanning Documents…" : "Creating Worker Record…"}
              </p>
              <p className="text-gray-400 text-sm font-mono">
                {status === "scanning"
                  ? "Extracting fields from uploaded images"
                  : "Writing to Airtable and attaching files"}
              </p>
            </div>
          ) : (
            <div className="py-8 flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center">
                <CheckCircle2 className="w-9 h-9 text-green-400" />
              </div>
              <div className="text-center">
                <p className="text-white font-bold text-lg">Worker Created!</p>
                <p className="text-gray-400 text-sm font-mono mt-1">Record saved to Airtable with documents attached</p>
              </div>

              {result && Object.keys(result).length > 0 && (
                <div className="w-full mt-2 p-4 rounded-xl bg-slate-800 border border-slate-700 space-y-2">
                  <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">AI Extracted Fields</p>
                  {result.name && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Name</span>
                      <span className="text-white font-medium">{result.name}</span>
                    </div>
                  )}
                  {result.specialization && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Specialization</span>
                      <span className="text-red-300 font-bold">{result.specialization}</span>
                    </div>
                  )}
                  {result.trcExpiry && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">TRC Expiry</span>
                      <span className="text-green-400 font-medium">{result.trcExpiry}</span>
                    </div>
                  )}
                  {result.bhpExpiry && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">BHP Expiry</span>
                      <span className="text-green-400 font-medium">{result.bhpExpiry}</span>
                    </div>
                  )}
                  {result.contractEndDate && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Contract End</span>
                      <span className="text-green-400 font-medium">{result.contractEndDate}</span>
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={handleClose}
                className="mt-2 px-6 py-2.5 bg-white/10 hover:bg-white/15 border border-white/10 rounded-xl text-white text-sm font-bold uppercase tracking-wider transition-all"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
