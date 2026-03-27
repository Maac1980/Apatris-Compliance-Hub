import React, { useEffect, useRef, useState } from "react";
import {
  X, Mail, Phone, FileText, Download, Upload, CheckCircle2, Loader2, Pencil, Save,
  XCircle, MapPin, ChevronDown, Plus, MessageSquare, AlertTriangle, Shield,
  CreditCard, Flame, ClipboardCheck, ChevronRight, Printer, Trash2, History, Calculator, Link, CheckSquare, Square, QrCode, Landmark
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { format, parseISO } from "date-fns";
import { useGetWorker, getGetWorkerQueryKey, getGetWorkersQueryKey } from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { StatusBadge } from "./ui/StatusBadge";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} xmlns="http://www.w3.org/2000/svg">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}

function formatWaNum(phone: string): string {
  const d = phone.replace(/\D/g, "");
  if (d.startsWith("48") && d.length >= 10) return d;
  if (d.startsWith("0") && d.length >= 9) return "48" + d.slice(1);
  if (d.length === 9) return "48" + d;
  return "48" + d;
}

function buildWaUrl(phone: string, urgentDoc?: string | null): string {
  const num = formatWaNum(phone);
  if (urgentDoc) {
    const msg = encodeURIComponent(`Dzień dobry, tutaj biuro Apatris. Twoje dokumenty (${urgentDoc}) wygasają. Prosimy o pilny kontakt.`);
    return `https://wa.me/${num}?text=${msg}`;
  }
  return `https://wa.me/${num}`;
}

function getUrgentDoc(worker: any): string | null {
  const RED_MS = 30 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const checks: [string, string | undefined | null][] = [
    ["TRC", worker.trcExpiry], ["Passport", worker.passportExpiry],
    ["Medical Exam", worker.medicalExamExpiry], ["Oświadczenie", worker.oswiadczenieExpiry],
  ];
  for (const [label, expiry] of checks) {
    if (expiry && new Date(expiry).getTime() - now <= RED_MS) return label;
  }
  return null;
}

const SPEC_OPTIONS = ["TIG", "MIG", "MAG", "MMA", "ARC / Electrode", "FCAW", "FABRICATOR"];
const ZUS_OPTIONS = ["Registered", "Unregistered", "Unknown"];
const WELDING_PROCESSES = ["TIG", "MIG", "MAG", "MMA", "FCAW", "SAW", "Plasma", "Oxy-fuel"];
const WELDING_POSITIONS = ["PA", "PB", "PC", "PD", "PE", "PF", "PG", "H-L045", "J-L045"];
const VISA_TYPES = ["Karta Pobytu - Czasowy", "Karta Pobytu - Stały", "Karta Pobytu - UE LT", "Wiza D", "Wiza C", "EU Citizen", "Other"];

function SiteCombobox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const wrapRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery<{ sites: string[] }>({
    queryKey: ["workers-sites"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/workers/sites`);
      if (!res.ok) throw new Error("Failed to fetch sites");
      return res.json();
    },
    staleTime: 30_000,
  });
  const liveSites = data?.sites ?? [];

  useEffect(() => { setQuery(value); }, [value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = liveSites.filter((s) => s.toLowerCase().includes(query.toLowerCase()));
  const isNew = query.trim() !== "" && !liveSites.some((s) => s.toLowerCase() === query.toLowerCase());

  const select = (s: string) => { setQuery(s); onChange(s); setOpen(false); };

  return (
    <div ref={wrapRef} className="relative w-full">
      <div className="relative">
        <input
          type="text" value={query} placeholder="Type or search site…"
          onFocus={() => setOpen(true)}
          onChange={(e) => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); }}
          className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg pl-3 pr-9 py-2 text-sm font-mono focus:outline-none focus:border-red-500/60 placeholder:text-gray-600 transition-colors"
        />
        <button type="button" onMouseDown={(e) => { e.preventDefault(); setOpen((o) => !o); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors">
          <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </button>
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg bg-slate-800 border border-red-500/20 shadow-2xl overflow-hidden">
          {isNew && (
            <button type="button" onMouseDown={() => select(query.trim())} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-mono text-red-400 hover:bg-red-500/10 border-b border-slate-700 transition-colors">
              <Plus className="w-3.5 h-3.5 flex-shrink-0" />
              <span>Add "<strong>{query.trim()}</strong>" as new site</span>
            </button>
          )}
          {filtered.length === 0 && !isNew && <div className="px-3 py-3 text-xs text-gray-500 font-mono">No sites found — type to create one</div>}
          {filtered.map((s) => (
            <button key={s} type="button" onMouseDown={() => select(s)} className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm font-mono text-left hover:bg-white/5 transition-colors ${s === value ? "text-red-400 bg-red-500/10" : "text-gray-300"}`}>
              <MapPin className="w-3.5 h-3.5 flex-shrink-0 text-gray-500" />
              {s}
              {s === value && <span className="ml-auto text-[10px] text-red-400 font-bold">CURRENT</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function EditSection({ title, icon: Icon, children, defaultOpen = true }: { title: string; icon: React.ElementType; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-slate-700 overflow-hidden">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between px-3 py-2.5 bg-slate-800/80 text-left hover:bg-slate-700/60 transition-colors">
        <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">
          <Icon className="w-3.5 h-3.5 text-red-500" />{title}
        </span>
        <ChevronRight className={`w-3.5 h-3.5 text-gray-500 transition-transform duration-200 ${open ? "rotate-90" : ""}`} />
      </button>
      {open && <div className="p-3 space-y-3 bg-slate-900/30">{children}</div>}
    </div>
  );
}

function FRow({ label, value, accent }: { label: string; value?: string | null; accent?: "green" | "red" | "yellow" | "blue" }) {
  const colors = { green: "text-green-400", red: "text-red-400", yellow: "text-yellow-400", blue: "text-blue-400" };
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-gray-500 font-mono">{label}</span>
      <span className={`text-[11px] font-mono font-semibold ${accent ? colors[accent] : "text-gray-300"}`}>{value || "—"}</span>
    </div>
  );
}

function DocRow({ label, date }: { label: string; date?: string | null }) {
  if (!date) return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800 border border-slate-700">
      <span className="text-sm font-medium text-gray-300">{label}</span>
      <span className="text-sm font-mono text-gray-500">N/A</span>
    </div>
  );
  const d = parseISO(date);
  const isExpired = d < new Date();
  const isWarning = !isExpired && d < new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
  return (
    <div className={`flex items-center justify-between p-3 rounded-lg bg-slate-800 border ${isExpired ? "border-red-500/40" : isWarning ? "border-yellow-500/40" : "border-slate-700"}`}>
      <span className="text-sm font-medium text-gray-300">{label}</span>
      <span className={`text-sm font-mono font-semibold ${isExpired ? "text-red-400" : isWarning ? "text-yellow-400" : "text-green-400"}`}>
        {format(d, "MMM d, yyyy")}
      </span>
    </div>
  );
}

function AttachmentCard({ title, filename, url }: { title: string; filename: string; url: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="relative p-4 rounded-xl bg-slate-800 border border-slate-700 hover:bg-slate-700 hover:border-red-500/30 transition-all cursor-pointer group flex flex-col items-center justify-center text-center gap-2">
      <div className="w-10 h-10 rounded-full bg-red-500/10 text-red-400 flex items-center justify-center group-hover:scale-110 transition-transform">
        <FileText className="w-5 h-5" />
      </div>
      <div>
        <p className="text-sm font-bold text-white">{title}</p>
        <p className="text-xs text-gray-400 font-mono truncate w-28">{filename}</p>
      </div>
      <Download className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity absolute top-2 right-2" />
    </a>
  );
}

function UploadButton({ workerId, docType, label, accent = "red" }: { workerId: string; docType: "passport" | "contract" | "trc" | "bhp"; label: string; accent?: "red" | "green" | "orange" | "violet" }) {
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const accentClasses = { red: "border-red-500/70 hover:bg-red-500/10 hover:text-white", green: "border-green-500/70 hover:bg-green-500/10 hover:text-green-300", orange: "border-orange-500/70 hover:bg-orange-500/10 hover:text-orange-300", violet: "border-violet-500/70 hover:bg-violet-500/10 hover:text-violet-300" };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setDone(false);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("docType", docType);
      const res = await fetch(`${import.meta.env.BASE_URL}api/workers/${workerId}/upload`, { method: "POST", body: form });
      if (!res.ok) { const err = await res.json().catch(() => ({ error: "Upload failed" })); throw new Error(err.error ?? "Upload failed"); }
      const data = await res.json();
      await Promise.all([queryClient.invalidateQueries({ queryKey: getGetWorkerQueryKey(workerId) }), queryClient.invalidateQueries({ queryKey: getGetWorkersQueryKey() })]);
      setDone(true);
      const filled = data.autoFilled as Record<string, string> | undefined;
      const filledLines: string[] = [];
      if (filled?.name) filledLines.push(`Name: ${filled.name}`);
      if (filled?.passportExpiry) filledLines.push(`Passport expires: ${filled.passportExpiry}`);
      if (filled?.trcExpiry) filledLines.push(`TRC expires: ${filled.trcExpiry}`);
      if (filled?.bhpExpiry) filledLines.push(`BHP expires: ${filled.bhpExpiry}`);
      if (filled?.specialization) filledLines.push(`Spec: ${filled.specialization}`);
      if (filled?.contractEndDate) filledLines.push(`Contract end: ${filled.contractEndDate}`);
      toast({ title: data.scanned ? "Document Scanned & Saved" : "Document Uploaded", description: filledLines.length > 0 ? `AI auto-filled: ${filledLines.join(" · ")}` : `${label} saved successfully.` });
      setTimeout(() => setDone(false), 4000);
    } catch (err) {
      toast({ title: "Upload Failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <label className={`w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl border-2 border-dashed cursor-pointer transition-all select-none font-semibold text-sm ${done ? "bg-green-500/15 border-green-500/60 text-green-400" : uploading ? "bg-slate-700 border-slate-500 text-gray-400 cursor-not-allowed" : `bg-slate-800 ${accentClasses[accent]} text-gray-300`}`}>
      <input ref={inputRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={handleFile} disabled={uploading} />
      {uploading ? <Loader2 className="w-5 h-5 animate-spin flex-shrink-0" /> : done ? <CheckCircle2 className="w-5 h-5 flex-shrink-0" /> : <Upload className="w-5 h-5 flex-shrink-0" />}
      <span>{uploading ? `Uploading ${label}…` : done ? `${label} Saved!` : `Upload ${label}`}</span>
    </label>
  );
}

/* ─── QR Code Modal ─────────────────────────────────────────────────────────── */
function QRModal({ worker, onClose }: { worker: any; onClose: () => void }) {
  const base = (import.meta.env.BASE_URL as string).replace(/\/$/, "");
  const url = `${window.location.origin}${base}?worker=${encodeURIComponent(worker.id)}`;

  function downloadQR() {
    const svg = document.getElementById("worker-qr-svg");
    if (!svg) return;
    const serialized = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([serialized], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${worker.name.replace(/\s+/g, "_")}_QR.svg`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 100);
  }

  const cs = worker.complianceStatus as string;
  const statusColor = cs === "critical" || cs === "non-compliant" ? "#ef4444" : cs === "warning" ? "#eab308" : "#22c55e";
  const statusLabel = cs === "critical" || cs === "non-compliant" ? "CRITICAL" : cs === "warning" ? "WARNING" : "COMPLIANT";

  const docs: [string, string | null | undefined][] = [
    ["TRC", worker.trcExpiry], ["Passport", worker.passportExpiry],
    ["Medical", worker.medicalExamExpiry], ["BHP", worker.bhpExpiry],
  ];
  function daysLeft(d: string | null | undefined): string {
    if (!d) return "—";
    const diff = Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
    if (diff < 0) return "EXPIRED";
    return `${diff}d`;
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-white/15 rounded-2xl shadow-2xl w-full max-w-xs p-6 flex flex-col items-center gap-4" onClick={(e) => e.stopPropagation()}>
        {/* Title */}
        <div className="w-full flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-widest text-red-400 font-mono">Worker QR</span>
          <button onClick={onClose} className="p-1.5 bg-white/10 hover:bg-white/20 rounded-full transition-colors"><X className="w-4 h-4 text-gray-300" /></button>
        </div>

        {/* QR Code */}
        <div className="bg-white p-3 rounded-xl shadow-inner">
          <QRCodeSVG id="worker-qr-svg" value={url} size={180} bgColor="#ffffff" fgColor="#0f172a" level="M" />
        </div>

        {/* Worker summary */}
        <div className="w-full bg-slate-800/60 rounded-xl border border-white/10 p-3 space-y-2">
          <p className="font-bold text-white text-sm font-mono text-center">{worker.name}</p>
          <div className="flex items-center justify-center gap-2">
            <span className="text-xs font-mono text-gray-400">{worker.specialization || "No Spec"}</span>
            {worker.assignedSite && (
              <span className="text-[10px] font-bold text-red-300 bg-red-600/20 border border-red-500/30 rounded px-2 py-0.5">{worker.assignedSite}</span>
            )}
          </div>
          <div className="flex items-center justify-center">
            <span className="text-xs font-bold px-3 py-0.5 rounded-full border font-mono" style={{ color: statusColor, borderColor: statusColor, backgroundColor: `${statusColor}18` }}>{statusLabel}</span>
          </div>
          {/* Document expiry grid */}
          <div className="grid grid-cols-2 gap-1 mt-1">
            {docs.map(([label, expiry]) => {
              const dl = daysLeft(expiry);
              const isExpired = dl === "EXPIRED";
              const isSoon = !isExpired && expiry && Math.ceil((new Date(expiry).getTime() - Date.now()) / 86400000) <= 30;
              return (
                <div key={label} className="flex items-center justify-between bg-slate-900/60 rounded px-2 py-1">
                  <span className="text-[10px] font-mono text-gray-500">{label}</span>
                  <span className={`text-[10px] font-bold font-mono ${isExpired ? "text-red-400" : isSoon ? "text-yellow-400" : "text-green-400"}`}>{dl}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Hint */}
        <p className="text-[10px] text-gray-500 font-mono text-center leading-relaxed">Scan to open this worker's full profile including documents, payroll & compliance status.</p>

        {/* Download button */}
        <button onClick={downloadQR} className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-red-700 hover:bg-red-600 border border-red-500 text-white text-xs font-bold uppercase tracking-wider transition-colors">
          <Download className="w-3.5 h-3.5" /> Download QR
        </button>
      </div>
    </div>
  );
}

/* ─── PIP Inspection Modal ─────────────────────────────────────────────────── */
function PIPModal({ worker, onClose }: { worker: any; onClose: () => void }) {
  const today = format(new Date(), "dd.MM.yyyy");

  const docRows = [
    { label: "TRC / Karta Pobytu", date: worker.trcExpiry },
    { label: "Paszport", date: worker.passportExpiry },
    { label: "Badania Lekarskie", date: worker.medicalExamExpiry },
    { label: "Oświadczenie PUP", date: worker.oswiadczenieExpiry },
    { label: "BHP Certificate", date: worker.bhpExpiry },
    { label: "Contract End", date: worker.contractEndDate },
    { label: "UDT Certificate", date: worker.udtCertExpiry },
    { label: "RODO Consent", date: worker.rodoConsentDate },
  ];

  function docStatus(date: string | null) {
    if (!date) return { label: "N/A", cls: "text-gray-500" };
    const d = parseISO(date);
    const now = new Date();
    if (d < now) return { label: "EXPIRED", cls: "text-red-500 font-bold" };
    const days = Math.ceil((d.getTime() - now.getTime()) / 86400000);
    if (days < 30) return { label: `${days}d (CRITICAL)`, cls: "text-red-400 font-bold" };
    if (days < 60) return { label: `${days}d (WARNING)`, cls: "text-yellow-400" };
    return { label: format(d, "dd.MM.yyyy"), cls: "text-green-400" };
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white text-black rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-[#C41E18] text-white p-5 flex items-start justify-between rounded-t-xl">
          <div>
            <p className="text-xs font-mono opacity-70 uppercase tracking-widest">PIP Inspection Card — Apatris Sp. z o.o.</p>
            <h2 className="text-xl font-bold mt-1">{worker.name}</h2>
            <p className="text-sm opacity-80 mt-0.5">{worker.specialization || "—"} · {worker.assignedSite || "No Site"}</p>
          </div>
          <div className="text-right text-xs font-mono opacity-70">
            <p>Generated:</p>
            <p className="font-bold text-white">{today}</p>
            <StatusBadge status={worker.complianceStatus} />
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* Identity */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 border-b border-gray-200 pb-1 mb-3">Identity & Legal Status</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {[
                ["PESEL", worker.pesel], ["NIP", worker.nip],
                ["Visa / Permit Type", worker.visaType],
                ["ZUS Status", worker.zusStatus],
                ["Email", worker.email], ["Phone", worker.phone],
              ].map(([label, val]) => (
                <div key={label} className="flex flex-col">
                  <span className="text-[10px] font-bold text-gray-400 uppercase">{label}</span>
                  <span className="font-mono">{val || "—"}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Documents */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 border-b border-gray-200 pb-1 mb-3">Document Compliance Status</h3>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[10px] text-gray-400 uppercase"><th className="pb-1">Document</th><th className="pb-1">Expiry / Status</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {docRows.map(({ label, date }) => {
                  const s = docStatus(date);
                  return (
                    <tr key={label} className="py-1">
                      <td className="py-1.5 font-medium text-gray-700">{label}</td>
                      <td className={`py-1.5 font-mono text-xs ${s.cls}`}>{s.label}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* EN ISO 9606 */}
          {(worker.weldingProcess || worker.weldingMaterialGroup || worker.weldingThickness || worker.weldingPosition) && (
            <div>
              <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 border-b border-gray-200 pb-1 mb-3">EN ISO 9606 Welding Certification</h3>
              <div className="grid grid-cols-4 gap-2 text-sm">
                {[["Process", worker.weldingProcess], ["Material Group", worker.weldingMaterialGroup], ["Thickness", worker.weldingThickness], ["Position", worker.weldingPosition]].map(([label, val]) => (
                  <div key={label}>
                    <span className="text-[10px] font-bold text-gray-400 uppercase block">{label}</span>
                    <span className="font-mono font-bold">{val || "—"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Signature block */}
          <div className="border-t border-gray-200 pt-4 grid grid-cols-2 gap-8 text-xs text-gray-400">
            <div><p className="mb-8">Inspector Signature:</p><div className="border-b border-gray-400" /></div>
            <div><p className="mb-8">Date of Inspection:</p><div className="border-b border-gray-400" /></div>
          </div>
        </div>

        <div className="px-5 pb-5 flex gap-3">
          <button onClick={() => window.print()} className="flex-1 flex items-center justify-center gap-2 py-2 bg-[#C41E18] text-white rounded-lg text-sm font-bold hover:bg-red-700 transition-colors">
            <Printer className="w-4 h-4" /> Print / Save as PDF
          </button>
          <button onClick={onClose} className="py-2 px-4 border border-gray-300 rounded-lg text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors">Close</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Panel ────────────────────────────────────────────────────────────── */
interface WorkerProfilePanelProps {
  workerId: string | null;
  initialEditMode?: boolean;
  onClose: () => void;
  onRenew: (worker: any) => void;
  onNotify: (worker: any) => void;
}

export function WorkerProfilePanel({ workerId, initialEditMode = false, onClose, onRenew, onNotify }: WorkerProfilePanelProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === "Admin";
  const isCoordinator = user?.role === "Coordinator";
  const { data: worker, isLoading } = useGetWorker(workerId || "", { query: { enabled: !!workerId } as any });

  const [isEditing, setIsEditing] = useState(false);
  const [showPIP, setShowPIP] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [saving, setSaving] = useState(false);

  // Core fields
  const [editWorkerStatus, setEditWorkerStatus] = useState("");
  const [editSpec, setEditSpec] = useState("");
  const [editSite, setEditSite] = useState("");
  const [editTrcExpiry, setEditTrcExpiry] = useState("");
  const [editBhpExpiry, setEditBhpExpiry] = useState("");
  const [editPassportExpiry, setEditPassportExpiry] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editContractEndDate, setEditContractEndDate] = useState("");
  // Polish compliance
  const [editMedicalExamExpiry, setEditMedicalExamExpiry] = useState("");
  const [editOswiadczenieExpiry, setEditOswiadczenieExpiry] = useState("");
  const [editUdtCertExpiry, setEditUdtCertExpiry] = useState("");
  const [editRodoConsentDate, setEditRodoConsentDate] = useState("");
  const [editPupFiledDate, setEditPupFiledDate] = useState("");
  // Identity
  const [editPesel, setEditPesel] = useState("");
  const [editNip, setEditNip] = useState("");
  const [editVisaType, setEditVisaType] = useState("");
  const [editZusStatus, setEditZusStatus] = useState("");
  // Bank
  const [editIban, setEditIban] = useState("");
  // EN ISO 9606
  const [editWorkPermitExpiry, setEditWorkPermitExpiry] = useState("");
  // Welding cert
  const [editWeldingProcess, setEditWeldingProcess] = useState("");
  const [editWeldingMaterialGroup, setEditWeldingMaterialGroup] = useState("");
  const [editWeldingThickness, setEditWeldingThickness] = useState("");
  const [editWeldingPosition, setEditWeldingPosition] = useState("");
  // Financial
  const [editHourlyRate, setEditHourlyRate] = useState("");
  const [editMonthlyHours, setEditMonthlyHours] = useState("");
  const [editAdvance, setEditAdvance] = useState("");
  // Delete state
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Panel tabs
  const [activeTab, setActiveTab] = useState<"profile" | "payroll-history">("profile");

  // Payroll history
  const { data: payrollHistoryData } = useQuery<{ records: any[] }>({
    queryKey: ["payroll-history", workerId],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/payroll/history/${workerId}`);
      if (!res.ok) throw new Error("Failed to load payroll history");
      return res.json();
    },
    enabled: !!workerId && isAdmin && activeTab === "payroll-history",
    staleTime: 30_000,
  });
  const payrollRecords: any[] = payrollHistoryData?.records ?? [];

  const handlePrintFinalSettlement = () => {
    if (!worker) return;
    const w = worker as any;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    // Header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(196, 30, 24);
    doc.text("APATRIS SP. Z O.O.", 105, 20, { align: "center" });
    doc.setFontSize(13);
    doc.setTextColor(30, 41, 59);
    doc.text("FINAL SETTLEMENT / ROZLICZENIE KOŃCOWE", 105, 28, { align: "center" });

    // Worker info box
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    const infoY = 36;
    doc.text(`Worker / Pracownik: ${w.name}`, 14, infoY);
    doc.text(`Specialization: ${w.specialization || "—"}`, 14, infoY + 6);
    doc.text(`Site: ${w.assignedSite || "—"}`, 14, infoY + 12);
    doc.text(`PESEL: ${w.pesel || "—"}`, 120, infoY);
    doc.text(`NIP: ${w.nip || "—"}`, 120, infoY + 6);
    doc.text(`ZUS Status: ${w.zusStatus || "—"}`, 120, infoY + 12);
    doc.text(`Generated: ${format(new Date(), "dd.MM.yyyy HH:mm")}`, 120, infoY + 18);

    const fmtPln = (n: number) => n.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // Payroll records table
    autoTable(doc, {
      startY: infoY + 26,
      head: [["Month", "Hours", "Rate (PLN/h)", "Gross (PLN)", "Advances", "Penalties", "Final Netto (PLN)"]],
      body: payrollRecords.map((r) => [
        r.monthYear,
        String(r.totalHours),
        fmtPln(r.hourlyRate),
        fmtPln(r.grossPayout ?? r.hourlyRate * r.totalHours),
        fmtPln(r.advancesDeducted),
        fmtPln(r.penaltiesDeducted),
        fmtPln(r.finalNettoPayout),
      ]),
      headStyles: { fillColor: [196, 30, 24], textColor: 255, fontStyle: "bold", fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      styles: { cellPadding: 2.5 },
      columnStyles: {
        1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" },
        4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right", fontStyle: "bold" },
      },
    });

    // Totals
    const totalHours = payrollRecords.reduce((s, r) => s + r.totalHours, 0);
    const totalNetto = payrollRecords.reduce((s, r) => s + r.finalNettoPayout, 0);
    const totalAdvances = payrollRecords.reduce((s, r) => s + r.advancesDeducted, 0);
    const totalPenalties = payrollRecords.reduce((s, r) => s + r.penaltiesDeducted, 0);
    const finalY: number = (doc as any).lastAutoTable?.finalY ?? 150;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(30, 41, 59);
    doc.text(`Lifetime Total Hours: ${fmtPln(totalHours)} h`, 14, finalY + 10);
    doc.text(`Total Advances Taken: ${fmtPln(totalAdvances)} PLN`, 14, finalY + 17);
    doc.text(`Total Penalties: ${fmtPln(totalPenalties)} PLN`, 14, finalY + 24);
    doc.setTextColor(22, 163, 74);
    doc.setFontSize(13);
    doc.text(`TOTAL LIFETIME NETTO PAYOUT: ${fmtPln(totalNetto)} PLN`, 14, finalY + 35);

    // Signature lines
    const sigY = finalY + 55;
    doc.setDrawColor(100, 100, 100);
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.line(14, sigY, 90, sigY);
    doc.text("Worker / Pracownik (Signature & Date)", 14, sigY + 5);
    doc.line(110, sigY, 196, sigY);
    doc.text("Employer / Pracodawca (Signature & Date)", 110, sigY + 5);

    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text("APATRIS SP. Z O.O. · ul. Chłodna 51, 00-867 Warszawa · NIP: 5252828706 · KRS: 0000849614 · REGON: 386546470", 105, 287, { align: "center" });

    const filename = `apatris-final-settlement-${w.name.replace(/\s+/g, "-").toLowerCase()}.pdf`;
    const blob = doc.output("blob");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.target = "_blank"; a.rel = "noopener noreferrer";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (workerId) {
      setIsEditing(initialEditMode);
      setActiveTab("profile");
    }
  }, [workerId, initialEditMode]);

  useEffect(() => {
    if (worker && isEditing) {
      const w = worker as any;
      setEditWorkerStatus(w.workerStatus || "Active");
      setEditSpec(w.specialization || "");
      setEditSite(w.assignedSite || "");
      setEditTrcExpiry(w.trcExpiry || "");
      setEditBhpExpiry(w.bhpExpiry || w.bhpStatus || "");
      setEditPassportExpiry(w.passportExpiry || "");
      setEditEmail(w.email || "");
      setEditPhone(w.phone || "");
      setEditContractEndDate(w.contractEndDate || "");
      setEditMedicalExamExpiry(w.medicalExamExpiry || "");
      setEditOswiadczenieExpiry(w.oswiadczenieExpiry || "");
      setEditUdtCertExpiry(w.udtCertExpiry || "");
      setEditRodoConsentDate(w.rodoConsentDate || "");
      setEditPupFiledDate(w.pupFiledDate || "");
      setEditPesel(w.pesel || "");
      setEditNip(w.nip || "");
      setEditVisaType(w.visaType || "");
      setEditZusStatus(w.zusStatus || "");
      setEditIban(w.iban || w.IBAN || "");
      setEditWorkPermitExpiry(w.workPermitExpiry || "");
      setEditWeldingProcess(w.weldingProcess || "");
      setEditWeldingMaterialGroup(w.weldingMaterialGroup || "");
      setEditWeldingThickness(w.weldingThickness || "");
      setEditWeldingPosition(w.weldingPosition || "");
      setEditHourlyRate(w.hourlyRate != null ? String(w.hourlyRate) : "");
      setEditMonthlyHours(w.monthlyHours != null ? String(w.monthlyHours) : "");
      setEditAdvance(w.advance != null ? String(w.advance) : "");
    }
  }, [worker, isEditing]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") { if (isEditing) setIsEditing(false); else onClose(); } };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, isEditing]);

  const inputCls = "w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-red-500/60 placeholder:text-gray-600";
  const labelCls = "block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5";

  const handleSave = async () => {
    if (!workerId) return;
    setSaving(true);
    try {
      const body: Record<string, string> = {
        workerStatus: editWorkerStatus,
        specialization: editSpec,
        assignedSite: editSite,
        trcExpiry: editTrcExpiry,
        bhpExpiry: editBhpExpiry,
        passportExpiry: editPassportExpiry,
        email: editEmail,
        phone: editPhone,
        contractEndDate: editContractEndDate,
        workPermitExpiry: editWorkPermitExpiry,
        medicalExamExpiry: editMedicalExamExpiry,
        oswiadczenieExpiry: editOswiadczenieExpiry,
        udtCertExpiry: editUdtCertExpiry,
        rodoConsentDate: editRodoConsentDate,
        pupFiledDate: editPupFiledDate,
        pesel: editPesel,
        nip: editNip,
        visaType: editVisaType,
        zusStatus: editZusStatus,
        iban: editIban,
        weldingProcess: editWeldingProcess,
        weldingMaterialGroup: editWeldingMaterialGroup,
        weldingThickness: editWeldingThickness,
        weldingPosition: editWeldingPosition,
        hourlyRate: editHourlyRate,
        monthlyHours: editMonthlyHours,
        advance: editAdvance,
      };
      const res = await fetch(`${import.meta.env.BASE_URL}api/workers/${workerId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({ error: "Save failed" })); throw new Error(err.error ?? "Save failed"); }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetWorkerQueryKey(workerId) }),
        queryClient.invalidateQueries({ queryKey: getGetWorkersQueryKey() }),
        queryClient.invalidateQueries({ queryKey: ["workers-sites"] }),
        queryClient.invalidateQueries({ queryKey: ["compliance-trend"] }),
      ]);
      toast({ title: "Welder Records Updated", description: "All fields saved. Compliance status recalculated.", className: "border-red-500/50 bg-slate-900 text-white [&>div]:text-red-400" });
      setIsEditing(false);
    } catch (err) {
      toast({ title: "Save Failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!workerId) return;
    setDeleting(true);
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/workers/${workerId}`, { method: "DELETE" });
      if (!res.ok) { const err = await res.json().catch(() => ({ error: "Delete failed" })); throw new Error(err.error ?? "Delete failed"); }
      await queryClient.invalidateQueries({ queryKey: getGetWorkersQueryKey() });
      toast({ title: "Worker Deleted", description: `${(worker as any)?.name} has been permanently removed.`, variant: "destructive" });
      setDeleteConfirm(false);
      onClose();
    } catch (err) {
      toast({ title: "Delete Failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally { setDeleting(false); }
  };

  const isOpen = !!workerId;
  const [copiedLink, setCopiedLink] = useState(false);

  const handleCopyUploadLink = () => {
    if (!workerId) return;
    const base = window.location.origin + import.meta.env.BASE_URL.replace(/\/$/, "");
    const url = `${base}/worker-upload/${workerId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    });
  };

  // Salary calculations
  const gross = editHourlyRate && editMonthlyHours
    ? parseFloat(editHourlyRate) * parseFloat(editMonthlyHours)
    : null;
  const advanceNum = editAdvance ? parseFloat(editAdvance) : 0;
  const finalSalary = gross !== null ? gross - advanceNum : null;

  const wGross = (worker as any)?.hourlyRate != null && (worker as any)?.monthlyHours != null
    ? (worker as any).hourlyRate * (worker as any).monthlyHours
    : null;
  const wFinal = wGross !== null ? wGross - ((worker as any)?.advance ?? 0) : null;

  return (
    <>
      <div onClick={onClose} className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity duration-300 ${isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`} />
      <div ref={panelRef} className={`fixed right-0 top-0 bottom-0 w-full max-w-md bg-slate-900 border-l border-white/10 shadow-2xl z-50 flex flex-col transform transition-transform duration-300 ease-out ${isOpen ? "translate-x-0" : "translate-x-full"}`}>
        {isLoading || !worker ? (
          <div className="flex h-full items-center justify-center">
            <div className="w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="flex flex-col h-full min-h-0">
            {/* Header */}
            <div className="flex-shrink-0 p-6 border-b border-white/10 relative overflow-hidden bg-slate-900">
              <div className="absolute top-0 right-0 p-4 flex items-center gap-2">
                <button
                  onClick={handleCopyUploadLink}
                  title="Copy shareable document upload link for this worker"
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors text-xs font-bold uppercase tracking-wider border ${copiedLink ? "bg-green-600 border-green-500 text-white" : "bg-slate-700 hover:bg-slate-600 border-slate-500 text-gray-300"}`}
                >
                  <Link className="w-3.5 h-3.5" /> {copiedLink ? "Copied!" : "Upload Link"}
                </button>
                <button onClick={() => setShowQR(true)} title="Show QR code for this worker" className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 border border-slate-500 rounded-lg transition-colors text-xs font-bold text-gray-300 uppercase tracking-wider">
                  <QrCode className="w-3.5 h-3.5" /> QR
                </button>
                <button onClick={() => setShowPIP(true)} title="PIP Inspection Card" className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 border border-slate-500 rounded-lg transition-colors text-xs font-bold text-gray-300 uppercase tracking-wider">
                  <ClipboardCheck className="w-3.5 h-3.5" /> PIP
                </button>
                {!isEditing && (
                  <button onClick={() => setIsEditing(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-700 hover:bg-red-600 border border-red-500 rounded-lg transition-colors text-xs font-bold text-white uppercase tracking-wider">
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </button>
                )}
                <button onClick={onClose} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors">
                  <X className="w-5 h-5 text-gray-300" />
                </button>
              </div>
              <div className="flex items-center gap-4 mt-4">
                <div className="w-16 h-16 rounded-xl bg-red-600/20 border border-red-500/30 flex items-center justify-center text-red-400 text-xl font-bold uppercase">
                  {(worker as any).name.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white">{(worker as any).name}</h2>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="px-2 py-0.5 rounded text-xs font-mono bg-white/10 text-gray-300 border border-white/10">{(worker as any).specialization || "No Spec"}</span>
                    {(worker as any).assignedSite && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-600/20 border border-red-500/30 text-red-300 flex items-center gap-1">
                        <MapPin className="w-3 h-3" />{(worker as any).assignedSite}
                      </span>
                    )}
                    <StatusBadge status={(worker as any).complianceStatus} />
                    {(worker as any).workerStatus && (worker as any).workerStatus !== "Active" && (() => {
                      const s = (worker as any).workerStatus as string;
                      const cls = s === "On Leave" ? "bg-yellow-600/20 border-yellow-500/40 text-yellow-300"
                                : s === "Departed" ? "bg-orange-600/20 border-orange-500/40 text-orange-300"
                                : "bg-slate-600/30 border-slate-500/40 text-slate-300";
                      return <span className={`px-2 py-0.5 rounded text-xs font-bold border ${cls}`}>{s}</span>;
                    })()}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 space-y-4 flex-1 overflow-y-auto min-h-0">

              {/* ── EDIT MODE ── */}
              {isEditing && (
                <div className="space-y-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-red-400 flex items-center gap-2">
                    <Pencil className="w-3.5 h-3.5" /> Editing: {(worker as any).name}
                  </p>

                  {/* Core */}
                  <EditSection title="Core Details" icon={Pencil}>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>Worker Status</label>
                        <select value={editWorkerStatus} onChange={(e) => setEditWorkerStatus(e.target.value)} className={inputCls}>
                          <option value="Active">Active</option>
                          <option value="On Leave">On Leave</option>
                          <option value="Departed">Departed</option>
                          <option value="Archived">Archived</option>
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>Welding Spec</label>
                        <select value={editSpec} onChange={(e) => setEditSpec(e.target.value)} className={inputCls}>
                          <option value="">— Select —</option>
                          {SPEC_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>Client / Site</label>
                        <SiteCombobox value={editSite} onChange={setEditSite} />
                      </div>
                      <div>
                        <label className={labelCls}>TRC Expiry</label>
                        <input type="date" value={editTrcExpiry} onChange={(e) => setEditTrcExpiry(e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>BHP Expiry</label>
                        <input type="date" value={editBhpExpiry} onChange={(e) => setEditBhpExpiry(e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Passport Expiry</label>
                        <input type="date" value={editPassportExpiry} onChange={(e) => setEditPassportExpiry(e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Contract End Date</label>
                        <input type="date" value={editContractEndDate} onChange={(e) => setEditContractEndDate(e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Work Permit Expiry</label>
                        <input type="date" value={editWorkPermitExpiry} onChange={(e) => setEditWorkPermitExpiry(e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Email</label>
                        <input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="email@example.com" className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Phone</label>
                        <input type="tel" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="+48 000 000 000" className={inputCls} />
                      </div>
                    </div>
                  </EditSection>

                  {/* Polish Compliance */}
                  <EditSection title="Polish Compliance Documents" icon={Shield} defaultOpen={false}>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>Badania Lekarskie Expiry</label>
                        <input type="date" value={editMedicalExamExpiry} onChange={(e) => setEditMedicalExamExpiry(e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Oświadczenie Expiry</label>
                        <input type="date" value={editOswiadczenieExpiry} onChange={(e) => setEditOswiadczenieExpiry(e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>UDT Cert Expiry</label>
                        <input type="date" value={editUdtCertExpiry} onChange={(e) => setEditUdtCertExpiry(e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>PUP Filed Date</label>
                        <input type="date" value={editPupFiledDate} onChange={(e) => setEditPupFiledDate(e.target.value)} className={inputCls} />
                      </div>
                      <div className="col-span-2">
                        <label className={labelCls}>RODO Consent Date</label>
                        <input type="date" value={editRodoConsentDate} onChange={(e) => setEditRodoConsentDate(e.target.value)} className={inputCls} />
                      </div>
                    </div>
                  </EditSection>

                  {/* Identity & Legal */}
                  <EditSection title="Identity & Legal" icon={CreditCard} defaultOpen={false}>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>PESEL</label>
                        <input type="text" value={editPesel} onChange={(e) => setEditPesel(e.target.value)} placeholder="00000000000" className={inputCls} maxLength={11} />
                      </div>
                      <div>
                        <label className={labelCls}>NIP</label>
                        <input type="text" value={editNip} onChange={(e) => setEditNip(e.target.value)} placeholder="000-000-00-00" className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>ZUS Status</label>
                        <select value={editZusStatus} onChange={(e) => setEditZusStatus(e.target.value)} className={inputCls}>
                          <option value="">— Select —</option>
                          {ZUS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>Visa / Permit Type</label>
                        <select value={editVisaType} onChange={(e) => setEditVisaType(e.target.value)} className={inputCls}>
                          <option value="">— Select —</option>
                          {VISA_TYPES.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </div>
                    </div>
                  </EditSection>

                  {/* Bank Details */}
                  <EditSection title="Bank Details" icon={Landmark} defaultOpen={!!editIban}>
                    <div className="space-y-3">
                      <div>
                        <label className={labelCls}>IBAN (Bank Account Number)</label>
                        <input
                          type="text"
                          value={editIban}
                          onChange={(e) => setEditIban(e.target.value.toUpperCase().replace(/\s/g, ""))}
                          placeholder="e.g. PL61109010140000071219812874"
                          className={inputCls}
                          maxLength={34}
                        />
                        <p className="text-[10px] text-gray-600 font-mono mt-1">Used for bank transfer CSV. No spaces needed — they are auto-removed.</p>
                      </div>
                    </div>
                  </EditSection>

                  {/* EN ISO 9606 */}
                  <EditSection title="EN ISO 9606 Welding Cert" icon={Flame} defaultOpen={false}>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>Welding Process</label>
                        <select value={editWeldingProcess} onChange={(e) => setEditWeldingProcess(e.target.value)} className={inputCls}>
                          <option value="">— Select —</option>
                          {WELDING_PROCESSES.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>Position</label>
                        <select value={editWeldingPosition} onChange={(e) => setEditWeldingPosition(e.target.value)} className={inputCls}>
                          <option value="">— Select —</option>
                          {WELDING_POSITIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>Material Group</label>
                        <input type="text" value={editWeldingMaterialGroup} onChange={(e) => setEditWeldingMaterialGroup(e.target.value)} placeholder="e.g. 1, 2, 8" className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Thickness Range</label>
                        <input type="text" value={editWeldingThickness} onChange={(e) => setEditWeldingThickness(e.target.value)} placeholder="e.g. 3–40mm" className={inputCls} />
                      </div>
                    </div>
                  </EditSection>

                  {/* Working Hours — visible to Admin + Coordinator */}
                  {(isAdmin || isCoordinator) && (
                    <EditSection title="Working Hours" icon={CreditCard} defaultOpen={true}>
                      <div>
                        <label className={labelCls}>Current Month Hours</label>
                        <input type="number" min="0" step="1" value={editMonthlyHours} onChange={(e) => setEditMonthlyHours(e.target.value)} placeholder="0" className={inputCls} />
                      </div>
                    </EditSection>
                  )}

                  {/* Payroll & Advance — Admin only */}
                  {isAdmin && (
                    <EditSection title="Payroll & Advance" icon={CreditCard} defaultOpen={false}>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={labelCls}>Hourly Rate (PLN)</label>
                          <input type="number" min="0" step="0.01" value={editHourlyRate} onChange={(e) => setEditHourlyRate(e.target.value)} placeholder="0.00" className={inputCls} />
                        </div>
                        <div className="col-span-2">
                          <label className={labelCls}>Advance Taken (PLN)</label>
                          <input type="number" min="0" step="0.01" value={editAdvance} onChange={(e) => setEditAdvance(e.target.value)} placeholder="0.00" className={inputCls} />
                        </div>
                      </div>
                      {gross !== null && (
                        <div className="space-y-1.5 pt-1">
                          <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-800 border border-slate-600">
                            <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Gross Salary</span>
                            <span className="text-sm font-mono font-bold text-blue-400">{gross.toLocaleString("pl-PL", { minimumFractionDigits: 2 })} PLN</span>
                          </div>
                          {advanceNum > 0 && (
                            <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-orange-500/5 border border-orange-500/20">
                              <span className="text-[11px] font-bold uppercase tracking-widest text-orange-400">Advance Deduction</span>
                              <span className="text-sm font-mono font-bold text-orange-400">- {advanceNum.toLocaleString("pl-PL", { minimumFractionDigits: 2 })} PLN</span>
                            </div>
                          )}
                          <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/30">
                            <span className="text-[11px] font-bold uppercase tracking-widest text-green-400">Final Net Salary</span>
                            <span className="text-lg font-mono font-bold text-green-400">{finalSalary!.toLocaleString("pl-PL", { minimumFractionDigits: 2 })} PLN</span>
                          </div>
                        </div>
                      )}
                    </EditSection>
                  )}

                  <div className="flex gap-2 pt-1">
                    <button onClick={() => setIsEditing(false)} disabled={saving} className="flex-1 py-2 border border-white/15 bg-white/5 hover:bg-white/10 text-gray-300 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5">
                      <XCircle className="w-3.5 h-3.5" /> Cancel
                    </button>
                    <button onClick={handleSave} disabled={saving} className="flex-1 py-2 bg-red-700 hover:bg-red-600 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-[0_0_15px_rgba(196,30,24,0.35)]">
                      {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      {saving ? "Saving…" : "Save Changes"}
                    </button>
                  </div>
                </div>
              )}

              {/* ── PANEL TABS (view mode only) ── */}
              {!isEditing && isAdmin && (
                <div className="flex gap-1 p-1 bg-slate-800/60 rounded-xl border border-slate-700">
                  <button
                    onClick={() => setActiveTab("profile")}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${activeTab === "profile" ? "bg-slate-700 text-white shadow" : "text-gray-500 hover:text-gray-300"}`}
                  >
                    <FileText className="w-3.5 h-3.5" /> Profile
                  </button>
                  <button
                    onClick={() => setActiveTab("payroll-history")}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${activeTab === "payroll-history" ? "bg-slate-700 text-white shadow" : "text-gray-500 hover:text-gray-300"}`}
                  >
                    <History className="w-3.5 h-3.5" /> Payroll History
                  </button>
                </div>
              )}

              {/* ── PAYROLL HISTORY TAB ── */}
              {!isEditing && isAdmin && activeTab === "payroll-history" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Payroll Records</p>
                    <button
                      onClick={handlePrintFinalSettlement}
                      disabled={payrollRecords.length === 0}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-red-700 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-all shadow-[0_0_12px_rgba(196,30,24,0.3)]"
                    >
                      <Printer className="w-3.5 h-3.5" /> Final Settlement PDF
                    </button>
                  </div>

                  {payrollRecords.length === 0 ? (
                    <div className="text-center py-10 text-gray-500">
                      <Calculator className="w-10 h-10 mx-auto mb-3 opacity-20" />
                      <p className="text-sm font-mono">No payroll records yet.</p>
                      <p className="text-xs mt-1">Records appear after the first month is closed.</p>
                    </div>
                  ) : (
                    <>
                      {/* Summary totals */}
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { label: "Lifetime Hours", value: `${payrollRecords.reduce((s, r) => s + r.totalHours, 0).toLocaleString("pl-PL")} h`, color: "text-blue-400" },
                          { label: "Total Advances", value: `${payrollRecords.reduce((s, r) => s + r.advancesDeducted, 0).toLocaleString("pl-PL", { minimumFractionDigits: 2 })} PLN`, color: "text-orange-400" },
                          { label: "Total Netto Paid", value: `${payrollRecords.reduce((s, r) => s + r.finalNettoPayout, 0).toLocaleString("pl-PL", { minimumFractionDigits: 2 })} PLN`, color: "text-green-400" },
                        ].map((c) => (
                          <div key={c.label} className="p-2.5 bg-slate-800 border border-slate-700 rounded-xl text-center">
                            <p className={`text-sm font-mono font-bold ${c.color}`}>{c.value}</p>
                            <p className="text-[9px] font-bold uppercase tracking-widest text-gray-500 mt-1">{c.label}</p>
                          </div>
                        ))}
                      </div>

                      {/* Records table */}
                      <div className="rounded-xl border border-slate-700 overflow-hidden">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-800 border-b border-slate-700">
                            <tr>
                              <th className="px-3 py-2 text-left font-bold text-gray-400 uppercase tracking-wider">Month</th>
                              <th className="px-3 py-2 text-right font-bold text-gray-400 uppercase tracking-wider">Hrs</th>
                              <th className="px-3 py-2 text-right font-bold text-gray-400 uppercase tracking-wider">Rate</th>
                              <th className="px-3 py-2 text-right font-bold text-gray-400 uppercase tracking-wider">Deductions</th>
                              <th className="px-3 py-2 text-right font-bold text-green-400 uppercase tracking-wider">Netto</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-700/50">
                            {payrollRecords.map((r) => (
                              <tr key={r.id} className="hover:bg-slate-700/20 transition-colors">
                                <td className="px-3 py-2 font-mono text-white">{r.monthYear}</td>
                                <td className="px-3 py-2 text-right font-mono text-blue-400">{r.totalHours}</td>
                                <td className="px-3 py-2 text-right font-mono text-gray-300">{r.hourlyRate.toFixed(2)}</td>
                                <td className="px-3 py-2 text-right font-mono text-orange-400">
                                  {(r.advancesDeducted + r.penaltiesDeducted) > 0 ? `- ${(r.advancesDeducted + r.penaltiesDeducted).toLocaleString("pl-PL", { minimumFractionDigits: 2 })}` : "—"}
                                </td>
                                <td className="px-3 py-2 text-right font-mono font-bold text-green-400">
                                  {r.finalNettoPayout.toLocaleString("pl-PL", { minimumFractionDigits: 2 })} PLN
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ── VIEW MODE ── */}
              {!isEditing && (!isAdmin || activeTab === "profile") && (
                <>
                  {/* Contact */}
                  <div className="grid grid-cols-1 gap-3 p-4 rounded-xl bg-slate-800 border border-slate-700">
                    <div className="flex items-center gap-3 text-sm">
                      <Mail className="w-4 h-4 text-red-400 flex-shrink-0" />
                      <span className="text-gray-300 font-mono">{(worker as any).email || t("panel.noEmail")}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm flex-wrap">
                      <Phone className="w-4 h-4 text-red-400 flex-shrink-0" />
                      {(worker as any).phone
                        ? <a href={`tel:${(worker as any).phone}`} className="text-lime-400 font-mono flex-1 hover:text-lime-300 hover:underline transition-colors">{(worker as any).phone}</a>
                        : <span className="text-gray-500 font-mono flex-1">{t("panel.noPhone")}</span>
                      }
                      {(worker as any).phone && (
                        <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap mt-1">
                          <a href={`tel:${(worker as any).phone}`} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-green-600/20 hover:bg-green-600/40 border border-green-500/30 text-green-400 text-xs font-bold transition-colors"><Phone className="w-3.5 h-3.5" />{t("comm.call")}</a>
                          <a href={`sms:${(worker as any).phone}`} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/30 text-blue-400 text-xs font-bold transition-colors"><MessageSquare className="w-3.5 h-3.5" />{t("comm.sms")}</a>
                          {(() => {
                            const urgentDoc = getUrgentDoc(worker);
                            const waUrl = buildWaUrl((worker as any).phone, urgentDoc);
                            return urgentDoc ? (
                              <a href={waUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 border border-red-400 text-white text-xs font-bold transition-colors animate-pulse"><AlertTriangle className="w-3.5 h-3.5" />{t("comm.urgentAlert")}</a>
                            ) : (
                              <a href={waUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-500/30 text-emerald-400 text-xs font-bold transition-colors"><WhatsAppIcon className="w-3.5 h-3.5" />{t("comm.whatsapp")}</a>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                    {(worker as any).assignedSite && (
                      <div className="flex items-center gap-3 text-sm">
                        <MapPin className="w-4 h-4 text-red-400 flex-shrink-0" />
                        <span className="text-gray-300 font-mono">{(worker as any).assignedSite}</span>
                      </div>
                    )}
                  </div>

                  {/* Onboarding Checklist */}
                  {(() => {
                    const w = worker as any;
                    const checks = [
                      { label: "TRC / Karta Pobytu", ok: !!(w.trcExpiry || w.trcAttachments?.length) },
                      { label: "Passport", ok: !!(w.passportExpiry || w.passportAttachments?.length) },
                      { label: "BHP Certificate", ok: !!(w.bhpExpiry || w.bhpStatus || w.bhpAttachments?.length) },
                      { label: "Work Permit", ok: !!w.workPermitExpiry },
                      { label: "Contract / End Date", ok: !!(w.contractEndDate || w.contractAttachments?.length) },
                      { label: "Medical Exam (Badania)", ok: !!w.medicalExamExpiry },
                      { label: "Oświadczenie PUP", ok: !!w.oswiadczenieExpiry },
                      { label: "PESEL / NIP", ok: !!(w.pesel || w.nip) },
                      { label: "ZUS Registered", ok: w.zusStatus === "Registered" },
                      { label: "RODO Consent", ok: !!w.rodoConsentDate },
                    ];
                    const done = checks.filter((c) => c.ok).length;
                    const pct = Math.round((done / checks.length) * 100);
                    return (
                      <div className="rounded-xl border border-slate-700 bg-slate-800/50 overflow-hidden">
                        <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <CheckSquare className="w-3.5 h-3.5 text-red-400" />
                            <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Onboarding Checklist</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-24 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct === 100 ? "#22c55e" : pct >= 70 ? "#eab308" : "#C41E18" }} />
                            </div>
                            <span className={`text-xs font-mono font-bold ${pct === 100 ? "text-green-400" : pct >= 70 ? "text-yellow-400" : "text-red-400"}`}>{done}/{checks.length}</span>
                          </div>
                        </div>
                        <div className="p-3 grid grid-cols-2 gap-1.5">
                          {checks.map((c) => (
                            <div key={c.label} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs ${c.ok ? "bg-green-500/10 border border-green-500/20 text-green-300" : "bg-slate-800 border border-slate-700 text-gray-500"}`}>
                              {c.ok ? <CheckSquare className="w-3 h-3 flex-shrink-0 text-green-400" /> : <Square className="w-3 h-3 flex-shrink-0 text-gray-600" />}
                              <span className="truncate">{c.label}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Compliance Timeline */}
                  <div>
                    <h3 className="text-xs font-bold tracking-widest text-gray-400 uppercase mb-3">{t("panel.complianceTimeline")}</h3>
                    <div className="space-y-2">
                      <DocRow label="TRC Certificate Expiry" date={(worker as any).trcExpiry} />
                      <DocRow label="BHP Certificate Expiry" date={(worker as any).bhpExpiry} />
                      <DocRow label="Passport Expiry" date={(worker as any).passportExpiry} />
                      <DocRow label="Contract End Date" date={(worker as any).contractEndDate} />
                      <DocRow label="Badania Lekarskie (Medical)" date={(worker as any).medicalExamExpiry} />
                      <DocRow label="Oświadczenie (Work Decl.)" date={(worker as any).oswiadczenieExpiry} />
                      <DocRow label="UDT Certificate" date={(worker as any).udtCertExpiry} />
                      {(worker as any).workPermitExpiry && <DocRow label="Work Permit" date={(worker as any).workPermitExpiry} />}
                    </div>
                  </div>

                  {/* Bank Details — view mode */}
                  {((worker as any).iban || (worker as any).IBAN) && (
                    <div>
                      <h3 className="text-xs font-bold tracking-widest text-gray-400 uppercase mb-3">Bank Details</h3>
                      <div className="p-3 rounded-xl bg-slate-800 border border-slate-700 space-y-2">
                        <FRow
                          label="IBAN"
                          value={(worker as any).iban || (worker as any).IBAN}
                          accent="blue"
                        />
                      </div>
                    </div>
                  )}

                  {/* Identity & Legal */}
                  {((worker as any).pesel || (worker as any).nip || (worker as any).zusStatus || (worker as any).visaType || (worker as any).rodoConsentDate || (worker as any).pupFiledDate) && (
                    <div>
                      <h3 className="text-xs font-bold tracking-widest text-gray-400 uppercase mb-3">Identity & Legal</h3>
                      <div className="p-3 rounded-xl bg-slate-800 border border-slate-700 space-y-2">
                        <FRow label="PESEL" value={(worker as any).pesel} />
                        <FRow label="NIP" value={(worker as any).nip} />
                        <FRow label="Visa / Permit Type" value={(worker as any).visaType} />
                        <FRow label="ZUS Status" value={(worker as any).zusStatus} accent={(worker as any).zusStatus === "Registered" ? "green" : (worker as any).zusStatus === "Unregistered" ? "red" : undefined} />
                        <FRow label="RODO Consent" value={(worker as any).rodoConsentDate ? format(parseISO((worker as any).rodoConsentDate), "MMM d, yyyy") : null} accent="green" />
                        <FRow label="PUP Filed" value={(worker as any).pupFiledDate ? format(parseISO((worker as any).pupFiledDate), "MMM d, yyyy") : null} />
                      </div>
                    </div>
                  )}

                  {/* EN ISO 9606 */}
                  {((worker as any).weldingProcess || (worker as any).weldingMaterialGroup || (worker as any).weldingThickness || (worker as any).weldingPosition) && (
                    <div>
                      <h3 className="text-xs font-bold tracking-widest text-gray-400 uppercase mb-3">EN ISO 9606 Cert</h3>
                      <div className="p-3 rounded-xl bg-slate-800 border border-slate-700 grid grid-cols-2 gap-2">
                        <FRow label="Process" value={(worker as any).weldingProcess} accent="blue" />
                        <FRow label="Position" value={(worker as any).weldingPosition} accent="blue" />
                        <FRow label="Material Group" value={(worker as any).weldingMaterialGroup} />
                        <FRow label="Thickness" value={(worker as any).weldingThickness} />
                      </div>
                    </div>
                  )}

                  {/* Payroll — Admin only */}
                  {isAdmin && (
                    <div>
                      <h3 className="text-xs font-bold tracking-widest text-gray-400 uppercase mb-3">Payroll</h3>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800 border border-slate-700">
                          <span className="text-sm font-medium text-gray-300">{t("panel.monthlyHoursLabel")}</span>
                          <span className="text-sm font-mono text-blue-400 font-semibold">{(worker as any).monthlyHours != null ? `${(worker as any).monthlyHours} hrs` : <span className="text-gray-500">N/A</span>}</span>
                        </div>
                        {wGross !== null && (
                          <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800 border border-slate-700">
                            <span className="text-sm font-medium text-gray-300">Gross Salary</span>
                            <span className="text-sm font-mono font-bold text-blue-400">{wGross.toLocaleString("pl-PL", { minimumFractionDigits: 2 })} PLN</span>
                          </div>
                        )}
                        {(worker as any).advance != null && (worker as any).advance > 0 && (
                          <div className="flex items-center justify-between p-3 rounded-lg bg-orange-500/5 border border-orange-500/20">
                            <span className="text-sm font-medium text-orange-400">Advance Taken</span>
                            <span className="text-sm font-mono font-bold text-orange-400">- {((worker as any).advance).toLocaleString("pl-PL", { minimumFractionDigits: 2 })} PLN</span>
                          </div>
                        )}
                        {wFinal !== null && (
                          <div className="flex items-center justify-between p-3 rounded-lg bg-green-500/5 border border-green-500/20">
                            <span className="text-sm font-medium text-green-300">Final Net Salary</span>
                            <span className="text-lg font-mono font-bold text-green-400">{wFinal.toLocaleString("pl-PL", { minimumFractionDigits: 2 })} PLN</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Document Vault */}
                  <div>
                    <h3 className="text-xs font-bold tracking-widest text-gray-400 uppercase mb-3">{t("panel.documentVault")}</h3>
                    {((worker as any).passportAttachments?.length > 0 || (worker as any).trcAttachments?.length > 0 || (worker as any).bhpAttachments?.length > 0 || (worker as any).contractAttachments?.length > 0) && (
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        {(worker as any).passportAttachments?.map((att: any) => <AttachmentCard key={att.id} title="Passport" filename={att.filename} url={att.url} />)}
                        {(worker as any).trcAttachments?.map((att: any) => <AttachmentCard key={att.id} title="TRC Certificate" filename={att.filename} url={att.url} />)}
                        {(worker as any).bhpAttachments?.map((att: any) => <AttachmentCard key={att.id} title="BHP Certificate" filename={att.filename} url={att.url} />)}
                        {(worker as any).contractAttachments?.map((att: any) => <AttachmentCard key={att.id} title={t("panel.contract")} filename={att.filename} url={att.url} />)}
                      </div>
                    )}
                    <div className="space-y-2.5">
                      <p className="text-xs text-gray-500 font-mono uppercase tracking-widest">Upload Document</p>
                      <UploadButton workerId={(worker as any).id} docType="passport" label="Passport" accent="red" />
                      <UploadButton workerId={(worker as any).id} docType="trc" label="TRC Certificate" accent="green" />
                      <UploadButton workerId={(worker as any).id} docType="bhp" label="BHP Certificate" accent="orange" />
                      <UploadButton workerId={(worker as any).id} docType="contract" label="Contract" accent="violet" />
                      <p className="text-xs text-gray-600 text-center">PDF, JPG, PNG or WebP · AI scans docs automatically</p>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Delete confirmation inline */}
            {deleteConfirm && isAdmin && (
              <div className="mx-5 mb-3 p-4 rounded-xl bg-red-950/60 border border-red-500/50">
                <p className="text-sm font-bold text-red-300 mb-1">Permanently delete this worker?</p>
                <p className="text-xs text-red-400 font-mono mb-3">This cannot be undone. The record will be removed from Airtable.</p>
                <div className="flex gap-2">
                  <button onClick={() => setDeleteConfirm(false)} className="flex-1 py-1.5 text-xs font-bold border border-white/20 bg-white/5 hover:bg-white/10 text-gray-300 rounded-lg transition-colors">
                    Cancel
                  </button>
                  <button onClick={handleDelete} disabled={deleting} className="flex-1 py-1.5 text-xs font-bold bg-red-700 hover:bg-red-600 text-white rounded-lg transition-colors flex items-center justify-center gap-1.5">
                    {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                    {deleting ? "Deleting…" : "Yes, Delete"}
                  </button>
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="p-5 border-t border-white/10 bg-slate-800/50 flex gap-3">
              {isAdmin && !isEditing && (
                <button
                  onClick={() => setDeleteConfirm((d) => !d)}
                  className="p-2.5 bg-white/5 hover:bg-red-900/40 text-gray-500 hover:text-red-400 border border-white/10 hover:border-red-500/40 rounded-xl transition-all"
                  title="Delete Worker"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <button className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-white border border-white/10 hover:border-white/20 rounded-xl font-bold uppercase tracking-wider text-sm transition-all" onClick={() => onNotify(worker)}>
                {t("panel.notify")}
              </button>
              <button className="flex-1 py-2.5 bg-red-700 hover:bg-red-600 text-white rounded-xl font-bold uppercase tracking-wider text-sm transition-all shadow-[0_0_15px_rgba(220,38,38,0.3)]" onClick={() => onRenew(worker)}>
                {t("panel.renewDoc")}
              </button>
            </div>
          </div>
        )}
      </div>

      {showPIP && worker && <PIPModal worker={worker} onClose={() => setShowPIP(false)} />}
      {showQR && worker && <QRModal worker={worker} onClose={() => setShowQR(false)} />}
    </>
  );
}
