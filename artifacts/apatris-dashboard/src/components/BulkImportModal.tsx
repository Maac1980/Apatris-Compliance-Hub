import React, { useState, useRef, useCallback } from "react";
import Papa from "papaparse";
import {
  X, Upload, Download, FileText, CheckCircle2, AlertTriangle,
  Loader2, ChevronRight, Users,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetWorkersQueryKey } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

const CSV_HEADERS = [
  "Name", "Phone", "Email", "Specialization", "Assigned Site",
  "IBAN", "PESEL", "NIP", "Visa Type", "ZUS Status",
  "TRC Expiry", "Passport Expiry", "BHP Expiry", "Contract End Date",
  "Work Permit Expiry", "Medical Exam Expiry", "Oswiadczenie Expiry", "UDT Cert Expiry",
];

const COLUMN_MAP: Record<string, string> = {
  "Name":                "name",
  "Phone":               "phone",
  "Email":               "email",
  "Specialization":      "specialization",
  "Assigned Site":       "assignedSite",
  "IBAN":                "iban",
  "PESEL":               "pesel",
  "NIP":                 "nip",
  "Visa Type":           "visaType",
  "ZUS Status":          "zusStatus",
  "TRC Expiry":          "trcExpiry",
  "Passport Expiry":     "passportExpiry",
  "BHP Expiry":          "bhpExpiry",
  "Contract End Date":   "contractEndDate",
  "Work Permit Expiry":  "workPermitExpiry",
  "Medical Exam Expiry": "medicalExamExpiry",
  "Oswiadczenie Expiry": "oswiadczenieExpiry",
  "UDT Cert Expiry":     "udtCertExpiry",
};

type Step = "upload" | "preview" | "importing" | "done";

type ParsedRow = Record<string, string>;

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

function downloadTemplate() {
  const sampleRow = [
    "Jan Kowalski", "+48 600 000 001", "jan@example.com", "TIG", "Warsaw Plant",
    "PL61109010140000071219812874", "12345678901", "1234567890", "Karta Pobytu - Czasowy", "Registered",
    "2026-12-31", "2028-06-30", "2025-09-15", "2026-03-01",
    "2026-12-01", "2025-11-30", "2026-01-15", "2027-03-01",
  ];
  const csv = [CSV_HEADERS.join(","), sampleRow.join(",")].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "apatris_workers_template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function mapRow(raw: ParsedRow): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [csvCol, apiKey] of Object.entries(COLUMN_MAP)) {
    const val = (raw[csvCol] ?? raw[csvCol.toLowerCase()] ?? "").trim();
    if (val) out[apiKey] = val;
  }
  return out;
}

export function BulkImportModal({ isOpen, onClose }: Props) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [isDragging, setIsDragging] = useState(false);
  const [parsedRows, setParsedRows] = useState<ReturnType<typeof mapRow>[]>([]);
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [importProgress, setImportProgress] = useState(0);
  const [result, setResult] = useState<{ imported: number; errors: string[] } | null>(null);
  const [parseError, setParseError] = useState("");

  const reset = () => {
    setStep("upload");
    setIsDragging(false);
    setParsedRows([]);
    setRawHeaders([]);
    setImportProgress(0);
    setResult(null);
    setParseError("");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const parseFile = useCallback((file: File) => {
    setParseError("");
    Papa.parse<ParsedRow>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      complete: (results) => {
        const rows = results.data.filter((r) => {
          const name = (r["Name"] ?? r["name"] ?? "").trim();
          return !!name;
        });
        if (rows.length === 0) {
          setParseError("No valid rows found. Make sure your CSV has a 'Name' column with data.");
          return;
        }
        setRawHeaders(results.meta.fields ?? []);
        setParsedRows(rows.map(mapRow));
        setStep("preview");
      },
      error: (err) => {
        setParseError(`CSV parse error: ${err.message}`);
      },
    });
  }, []);

  const handleFileDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file && file.name.endsWith(".csv")) {
        parseFile(file);
      } else {
        setParseError("Please drop a .csv file.");
      }
    },
    [parseFile]
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
  };

  const runImport = async () => {
    setStep("importing");
    setImportProgress(0);

    let imported = 0;
    const errors: string[] = [];

    const BATCH = 10;
    for (let i = 0; i < parsedRows.length; i += BATCH) {
      const batch = parsedRows.slice(i, i + BATCH);
      try {
        const res = await fetch(`${BASE_URL}/api/workers/bulk-import`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workers: batch }),
        });
        const json = await res.json() as { imported: number; errors: string[] };
        imported += json.imported ?? 0;
        if (json.errors?.length) errors.push(...json.errors);
      } catch (e) {
        errors.push(`Network error on batch starting at row ${i + 1}`);
      }
      setImportProgress(Math.round(((i + BATCH) / parsedRows.length) * 100));
    }

    setResult({ imported, errors });
    setStep("done");

    queryClient.invalidateQueries({ queryKey: getGetWorkersQueryKey() });

    toast({
      title: `Successfully imported ${imported} worker${imported !== 1 ? "s" : ""}!`,
      description: errors.length ? `${errors.length} row(s) had errors.` : "All rows imported cleanly.",
    });
  };

  if (!isOpen) return null;

  const PREVIEW_ROWS = parsedRows.slice(0, 3);
  const PREVIEW_COLS = ["Name", "Phone", "Specialization", "Assigned Site", "TRC Expiry"];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        className="bg-slate-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        style={{ boxShadow: "0 0 0 1px rgba(196,30,24,0.15), 0 24px 80px rgba(0,0,0,0.6)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-900/40 border border-red-500/30 flex items-center justify-center">
              <Users className="w-4 h-4 text-red-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold uppercase tracking-widest text-white font-mono">Bulk Import Workers</h2>
              <p className="text-[10px] text-gray-500 font-mono mt-0.5">CSV → Database in seconds</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 text-gray-500 hover:text-white transition-colors rounded-lg hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* ── STEP: UPLOAD ── */}
          {step === "upload" && (
            <div className="space-y-4">
              {/* Template download */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-white/3 border border-white/6">
                <div className="flex items-center gap-2.5">
                  <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <span className="text-xs text-gray-400 font-mono">
                    Need the correct format? Use the official template.
                  </span>
                </div>
                <button
                  onClick={downloadTemplate}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-bold uppercase tracking-wide text-lime-400 border border-lime-500/40 rounded-lg hover:bg-lime-500/10 transition-colors flex-shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download CSV Template
                </button>
              </div>

              {/* Drag-and-drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed py-14 px-8 cursor-pointer transition-all ${
                  isDragging
                    ? "border-red-500/70 bg-red-900/10"
                    : "border-white/12 hover:border-white/25 hover:bg-white/3"
                }`}
              >
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${
                  isDragging ? "bg-red-900/40 border border-red-500/40" : "bg-white/5 border border-white/10"
                }`}>
                  <Upload className={`w-6 h-6 ${isDragging ? "text-red-400" : "text-gray-400"}`} />
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold text-white font-mono">
                    {isDragging ? "Drop your CSV file here" : "Drag & drop your CSV file"}
                  </p>
                  <p className="text-xs text-gray-500 font-mono mt-1">
                    or click to browse — .csv files only
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleFileInput}
                />
              </div>

              {parseError && (
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-900/20 border border-red-500/30">
                  <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-300 font-mono">{parseError}</p>
                </div>
              )}

              {/* Column reference */}
              <div className="rounded-xl bg-white/3 border border-white/6 p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2.5">Expected CSV Columns</p>
                <div className="flex flex-wrap gap-1.5">
                  {CSV_HEADERS.map((h) => (
                    <span
                      key={h}
                      className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-medium border ${
                        h === "Name"
                          ? "bg-red-900/30 border-red-500/40 text-red-300"
                          : "bg-white/5 border-white/10 text-gray-400"
                      }`}
                    >
                      {h === "Name" ? `${h} *` : h}
                    </span>
                  ))}
                </div>
                <p className="text-[10px] text-gray-600 font-mono mt-2">* Required. Date fields: YYYY-MM-DD</p>
              </div>
            </div>
          )}

          {/* ── STEP: PREVIEW ── */}
          {step === "preview" && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-green-900/20 border border-green-500/25">
                <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                <div>
                  <p className="text-xs font-bold text-green-300 font-mono">
                    {parsedRows.length} valid row{parsedRows.length !== 1 ? "s" : ""} ready to import
                  </p>
                  {rawHeaders.length > 0 && (
                    <p className="text-[10px] text-gray-500 font-mono mt-0.5">
                      Columns detected: {rawHeaders.slice(0, 6).join(", ")}{rawHeaders.length > 6 ? ` +${rawHeaders.length - 6} more` : ""}
                    </p>
                  )}
                </div>
              </div>

              {/* Preview table */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">
                  Preview — first {Math.min(3, parsedRows.length)} row{parsedRows.length > 1 ? "s" : ""}
                </p>
                <div className="app-table-scroll rounded-xl border border-white/8 overflow-hidden">
                  <table className="w-full text-xs font-mono" style={{ minWidth: "600px" }}>
                    <thead>
                      <tr className="bg-slate-800/80 border-b border-white/8">
                        {PREVIEW_COLS.map((col) => (
                          <th key={col} className="px-3 py-2.5 text-left text-[10px] uppercase tracking-widest text-gray-400 font-bold whitespace-nowrap">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {PREVIEW_ROWS.map((row, i) => (
                        <tr key={i} className={`border-b border-white/5 ${i % 2 === 0 ? "bg-slate-800/20" : ""}`}>
                          <td className="px-3 py-2 text-white font-bold truncate max-w-[140px]">{row.name || <span className="text-red-400">—</span>}</td>
                          <td className="px-3 py-2 text-gray-300 truncate max-w-[110px]">{row.phone || "—"}</td>
                          <td className="px-3 py-2 text-gray-300">{row.specialization || "—"}</td>
                          <td className="px-3 py-2 text-gray-300">{row.assignedSite || "—"}</td>
                          <td className="px-3 py-2 text-gray-300">{row.trcExpiry || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {parsedRows.length > 3 && (
                  <p className="text-[10px] text-gray-600 font-mono mt-1.5 text-right">
                    +{parsedRows.length - 3} more row{parsedRows.length - 3 !== 1 ? "s" : ""} not shown
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ── STEP: IMPORTING ── */}
          {step === "importing" && (
            <div className="flex flex-col items-center justify-center py-10 gap-5">
              <div className="w-14 h-14 rounded-2xl bg-red-900/30 border border-red-500/30 flex items-center justify-center">
                <Loader2 className="w-7 h-7 text-red-400 animate-spin" />
              </div>
              <div className="text-center">
                <p className="text-sm font-bold text-white font-mono">Importing workers…</p>
                <p className="text-xs text-gray-500 font-mono mt-1">Writing to Airtable in batches of 10</p>
              </div>
              <div className="w-full max-w-xs">
                <div className="h-2 rounded-full bg-white/8 overflow-hidden">
                  <div
                    className="h-full bg-red-600 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(importProgress, 100)}%` }}
                  />
                </div>
                <p className="text-[10px] text-gray-500 font-mono mt-1.5 text-center">{Math.min(importProgress, 100)}%</p>
              </div>
            </div>
          )}

          {/* ── STEP: DONE ── */}
          {step === "done" && result && (
            <div className="flex flex-col items-center justify-center py-10 gap-4">
              <div className="w-16 h-16 rounded-2xl bg-green-900/30 border border-green-500/30 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-green-400" />
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-white font-mono">
                  {result.imported} worker{result.imported !== 1 ? "s" : ""} imported!
                </p>
                <p className="text-xs text-gray-400 font-mono mt-1">
                  The worker list has been refreshed automatically.
                </p>
              </div>
              {result.errors.length > 0 && (
                <div className="w-full p-3 rounded-xl bg-orange-900/20 border border-orange-500/25 text-left">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-orange-400 mb-1.5">
                    {result.errors.length} batch error{result.errors.length !== 1 ? "s" : ""}
                  </p>
                  {result.errors.slice(0, 3).map((e, i) => (
                    <p key={i} className="text-[10px] text-orange-300 font-mono">{e}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/8 flex-shrink-0">
          <button
            onClick={step === "done" ? handleClose : (step === "preview" ? reset : handleClose)}
            className="px-4 py-2 text-xs font-mono font-bold uppercase tracking-wide text-gray-400 border border-white/10 rounded-lg hover:bg-white/5 hover:text-white transition-colors"
          >
            {step === "done" ? "Close" : step === "preview" ? "← Back" : "Cancel"}
          </button>

          {step === "preview" && (
            <button
              onClick={runImport}
              className="flex items-center gap-2 px-5 py-2 bg-red-700 hover:bg-red-600 border border-red-500 text-white rounded-lg text-xs font-mono font-bold uppercase tracking-wide transition-all shadow-[0_0_12px_rgba(196,30,24,0.35)]"
            >
              Confirm & Import {parsedRows.length} Worker{parsedRows.length !== 1 ? "s" : ""}
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
          {step === "done" && result && (
            <button
              onClick={() => { reset(); }}
              className="px-4 py-2 text-xs font-mono font-bold uppercase tracking-wide text-gray-400 border border-white/10 rounded-lg hover:bg-white/5 hover:text-white transition-colors"
            >
              Import Another File
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
