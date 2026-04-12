/**
 * DocumentStructuredIntake — renders extracted document fields as an editable form.
 * Shows confidence per field, highlights missing fields, allows manual correction.
 */

import React, { useState } from "react";
import {
  FileText, AlertTriangle, CheckCircle2, Edit2, Shield, Loader2,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ExtractedField {
  value: string | null;
  confidence: number;
  source: "ai" | "manual";
}

interface ExtractionResult {
  document_type: string;
  extracted_fields: Record<string, ExtractedField>;
  missing_fields: string[];
  overall_confidence: number;
  requires_review: boolean;
  extraction_timestamp?: string;
}

interface Props {
  /** If provided, renders this extraction. Otherwise shows the upload trigger. */
  extraction?: ExtractionResult | null;
  /** Called when user triggers extraction — with file if available */
  onExtract?: (file: File | null, fileName: string, documentType: string) => void;
  /** Called when user approves the corrected data */
  onApprove?: (data: Record<string, string>) => void;
  /** Loading state from parent */
  loading?: boolean;
  /** Whether approval is in progress (disables button) */
  approving?: boolean;
  /** Whether approval succeeded (shows confirmed state) */
  approved?: boolean;
}

// ─── Confidence helpers ─────────────────────────────────────────────────────

function confColor(c: number): string {
  if (c >= 0.9) return "text-emerald-400";
  if (c >= 0.7) return "text-amber-400";
  return "text-red-400";
}

function confBg(c: number): string {
  if (c >= 0.9) return "bg-emerald-500/10 border-emerald-500/20";
  if (c >= 0.7) return "bg-amber-500/10 border-amber-500/20";
  return "bg-red-500/10 border-red-500/20";
}

function confLabel(c: number): string {
  if (c >= 0.9) return "HIGH";
  if (c >= 0.7) return "MEDIUM";
  if (c > 0) return "LOW";
  return "MISSING";
}

const DOC_TYPES = ["TRC", "WORK_PERMIT", "UPO", "PASSPORT", "BHP", "CONTRACT", "DECISION_LETTER"] as const;

const DOC_TYPE_LABELS: Record<string, string> = {
  TRC: "TRC / Karta Pobytu",
  WORK_PERMIT: "Work Permit",
  UPO: "UPO Filing Confirmation",
  PASSPORT: "Passport",
  BHP: "BHP Safety Certificate",
  CONTRACT: "Employment Contract",
  DECISION_LETTER: "Decision Letter",
  UNKNOWN: "Unknown Document",
};

// ─── Field labels (human-readable) ──────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  full_name: "Full Name", passport_number: "Passport Number", nationality: "Nationality",
  date_of_birth: "Date of Birth", pesel: "PESEL", employer_name: "Employer Name",
  employer_nip: "Employer NIP", voivodeship: "Voivodeship", case_reference: "Case Reference",
  filing_date: "Filing Date", expiry_date: "Expiry Date", permit_type: "Permit Type",
  work_position: "Work Position", salary: "Salary (PLN)", permit_number: "Permit Number",
  issue_date: "Issue Date", conditions: "Special Conditions", filing_office: "Filing Office",
  application_type: "Application Type", upo_number: "UPO Number", confirmation_date: "Confirmation Date",
  issuing_country: "Issuing Country", sex: "Sex", certificate_number: "Certificate Number",
  training_type: "Training Type", issuing_body: "Issuing Body", contract_type: "Contract Type",
  start_date: "Start Date", end_date: "End Date", hourly_rate: "Hourly Rate",
  monthly_salary: "Monthly Salary", work_location: "Work Location", decision_date: "Decision Date",
  decision_type: "Decision Type", issuing_authority: "Issuing Authority", appeal_deadline: "Appeal Deadline",
  decision_outcome: "Outcome", legal_basis: "Legal Basis", document_date: "Document Date",
  reference_number: "Reference Number", raw_text: "Extracted Text",
};

// ─── Component ──────────────────────────────────────────────────────────────

export function DocumentStructuredIntake({ extraction, onExtract, onApprove, loading, approving, approved }: Props) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [docType, setDocType] = useState("TRC");
  const [edits, setEdits] = useState<Record<string, string>>({});

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setSelectedFile(f);
  };

  const canExtract = !!(selectedFile) && !loading;

  // Upload trigger view
  if (!extraction) {
    return (
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <FileText className="w-5 h-5 text-primary" />
          <h3 className="text-sm font-bold text-foreground">Document Structured Intake</h3>
        </div>
        <p className="text-xs text-muted-foreground">Upload a document (PDF, JPEG, PNG) to extract structured data for review.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Document File</label>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={handleFileChange}
              className="w-full text-xs text-slate-300 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-slate-700 file:text-slate-300 hover:file:bg-slate-600" />
            {selectedFile && (
              <p className="text-[10px] text-slate-500">{selectedFile.name} · {(selectedFile.size / 1024).toFixed(0)} KB</p>
            )}
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Document Type</label>
            <select value={docType} onChange={e => setDocType(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:ring-1 focus:ring-primary/50">
              {DOC_TYPES.map(t => <option key={t} value={t}>{DOC_TYPE_LABELS[t]}</option>)}
            </select>
          </div>
        </div>

        <button onClick={() => onExtract?.(selectedFile, selectedFile?.name ?? "", docType)} disabled={!canExtract}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary/90 disabled:opacity-50 transition-colors">
          {loading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Extracting...</> : <><FileText className="w-3.5 h-3.5" /> Extract Document</>}
        </button>
      </div>
    );
  }

  // ── Extraction result view ──
  const fields = Object.entries(extraction.extracted_fields);
  const missingSet = new Set(extraction.missing_fields);

  const getValue = (key: string): string => {
    if (edits[key] !== undefined) return edits[key];
    return extraction.extracted_fields[key]?.value ?? "";
  };

  const handleEdit = (key: string, value: string) => {
    setEdits(prev => ({ ...prev, [key]: value }));
  };

  const handleApprove = () => {
    const data: Record<string, string> = {};
    for (const [key, field] of fields) {
      data[key] = edits[key] !== undefined ? edits[key] : (field.value ?? "");
    }
    onApprove?.(data);
  };

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            <div>
              <h3 className="text-sm font-bold text-foreground">{DOC_TYPE_LABELS[extraction.document_type] ?? extraction.document_type}</h3>
              <p className="text-[10px] text-muted-foreground">Extracted fields — review and correct before approving</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {extraction.requires_review && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">REVIEW REQUIRED</span>
            )}
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${confBg(extraction.overall_confidence)}`}>
              <span className={confColor(extraction.overall_confidence)}>{Math.round(extraction.overall_confidence * 100)}% overall</span>
            </span>
            {extraction.missing_fields.length > 0 && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/30">
                {extraction.missing_fields.length} missing
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Fields grid */}
      <div className="px-5 py-4 space-y-2">
        {fields.map(([key, field]) => {
          const isMissing = missingSet.has(key);
          const isEdited = edits[key] !== undefined;
          const conf = isEdited ? 1 : field.confidence;
          const label = FIELD_LABELS[key] ?? key.replace(/_/g, " ");

          return (
            <div key={key} className={`flex items-center gap-3 rounded-lg px-3 py-2 ${isMissing && !isEdited ? "bg-red-500/5 border border-red-500/15" : "bg-slate-800/30"}`}>
              {/* Label */}
              <div className="w-40 shrink-0">
                <div className="flex items-center gap-1.5">
                  {isMissing && !isEdited
                    ? <AlertTriangle className="w-3 h-3 text-red-400" />
                    : <CheckCircle2 className={`w-3 h-3 ${confColor(conf)}`} />}
                  <span className="text-[11px] font-bold text-muted-foreground">{label}</span>
                </div>
              </div>

              {/* Input */}
              <div className="flex-1">
                <input type="text" value={getValue(key)} onChange={e => handleEdit(key, e.target.value)}
                  placeholder={isMissing ? "Missing — enter manually" : ""}
                  className={`w-full px-2 py-1 bg-transparent border-b text-xs text-foreground placeholder:text-red-400/50 focus:outline-none focus:border-primary/50 ${
                    isEdited ? "border-blue-500/50" : isMissing ? "border-red-500/30" : "border-slate-700"
                  }`} />
              </div>

              {/* Confidence + source */}
              <div className="w-20 shrink-0 text-right">
                <span className={`text-[9px] font-bold ${confColor(conf)}`}>
                  {isEdited ? "MANUAL" : `${Math.round(conf * 100)}% ${confLabel(conf)}`}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-border flex items-center justify-between">
        <p className="text-[10px] text-muted-foreground">
          {Object.keys(edits).length > 0
            ? `${Object.keys(edits).length} field(s) manually corrected`
            : "Review fields above — edit any incorrect values"}
        </p>
        {approved ? (
          <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-bold">
            <CheckCircle2 className="w-3.5 h-3.5" /> Confirmed
          </div>
        ) : (
          <button onClick={handleApprove} disabled={approving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-50 transition-colors">
            {approving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...</> : <><Shield className="w-3.5 h-3.5" /> Approve Data</>}
          </button>
        )}
      </div>
    </div>
  );
}
