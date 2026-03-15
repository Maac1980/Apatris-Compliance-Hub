import React, { useEffect, useRef, useState } from "react";
import { X, Mail, Phone, FileText, Download, Upload, CheckCircle2, Loader2, Pencil, Save, XCircle, MapPin, ChevronDown, Plus } from "lucide-react";
import { format, parseISO } from "date-fns";
import { useGetWorker, getGetWorkerQueryKey, getGetWorkersQueryKey } from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { StatusBadge } from "./ui/StatusBadge";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";

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
    const msg = encodeURIComponent(
      `Dzień dobry, tutaj biuro Apatris. Twoje dokumenty (${urgentDoc}) wygasają. Prosimy o pilny kontakt.`
    );
    return `https://wa.me/${num}?text=${msg}`;
  }
  return `https://wa.me/${num}`;
}

function getUrgentDoc(worker: any): string | null {
  const RED_MS = 30 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const checks: [string, string | undefined | null][] = [
    ["TRC", worker.trcExpiry],
    ["Passport", worker.passportExpiry],
  ];
  for (const [label, expiry] of checks) {
    if (expiry && new Date(expiry).getTime() - now <= RED_MS) return label;
  }
  return null;
}

const SPEC_OPTIONS = ["TIG", "MIG", "MAG", "MMA", "ARC / Electrode", "FCAW", "FABRICATOR"];

// ─── Site Combobox ────────────────────────────────────────────────────────────
// Searchable free-text input with dropdown suggestions.
// Any value typed is valid — it will be saved as-is to Airtable.
function SiteCombobox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Fetch live site list from API
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

  // Sync incoming value when parent resets
  useEffect(() => { setQuery(value); }, [value]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = liveSites.filter((s) =>
    s.toLowerCase().includes(query.toLowerCase())
  );
  const isNew = query.trim() !== "" && !liveSites.some((s) => s.toLowerCase() === query.toLowerCase());

  const select = (s: string) => {
    setQuery(s);
    onChange(s);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className="relative w-full">
      <div className="relative">
        <input
          type="text"
          value={query}
          placeholder="Type or search site…"
          onFocus={() => setOpen(true)}
          onChange={(e) => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); }}
          className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg pl-3 pr-9 py-2 text-sm font-mono focus:outline-none focus:border-red-500/60 placeholder:text-gray-600 transition-colors"
        />
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); setOpen((o) => !o); }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
        >
          <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg bg-slate-800 border border-red-500/20 shadow-2xl overflow-hidden">
          {/* Custom entry hint */}
          {isNew && (
            <button
              type="button"
              onMouseDown={() => select(query.trim())}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-mono text-red-400 hover:bg-red-500/10 border-b border-slate-700 transition-colors"
            >
              <Plus className="w-3.5 h-3.5 flex-shrink-0" />
              <span>Add "<strong>{query.trim()}</strong>" as new site</span>
            </button>
          )}
          {filtered.length === 0 && !isNew && (
            <div className="px-3 py-3 text-xs text-gray-500 font-mono">No sites found — type to create one</div>
          )}
          {filtered.map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={() => select(s)}
              className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm font-mono text-left hover:bg-white/5 transition-colors ${
                s === value ? "text-red-400 bg-red-500/10" : "text-gray-300"
              }`}
            >
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

interface WorkerProfilePanelProps {
  workerId: string | null;
  initialEditMode?: boolean;
  onClose: () => void;
  onRenew: (worker: any) => void;
  onNotify: (worker: any) => void;
}

function DocRow({ label, date }: { label: string; date?: string | null }) {
  if (!date)
    return (
      <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800 border border-slate-700">
        <span className="text-sm font-medium text-gray-300">{label}</span>
        <span className="text-sm font-mono text-gray-500">N/A</span>
      </div>
    );

  const d = parseISO(date);
  const isExpired = d < new Date();
  const isWarning = !isExpired && d < new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

  return (
    <div
      className={`flex items-center justify-between p-3 rounded-lg bg-slate-800 border ${
        isExpired ? "border-red-500/40" : isWarning ? "border-yellow-500/40" : "border-slate-700"
      }`}
    >
      <span className="text-sm font-medium text-gray-300">{label}</span>
      <span className={`text-sm font-mono font-semibold ${isExpired ? "text-red-400" : isWarning ? "text-yellow-400" : "text-green-400"}`}>
        {format(d, "MMM d, yyyy")}
      </span>
    </div>
  );
}

function AttachmentCard({ title, filename, url }: { title: string; filename: string; url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="relative p-4 rounded-xl bg-slate-800 border border-slate-700 hover:bg-slate-700 hover:border-red-500/30 transition-all cursor-pointer group flex flex-col items-center justify-center text-center gap-2"
    >
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

function UploadButton({
  workerId,
  docType,
  label,
  accent = "red",
}: {
  workerId: string;
  docType: "passport" | "contract" | "trc" | "bhp";
  label: string;
  accent?: "red" | "green" | "orange" | "violet";
}) {
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const accentClasses = {
    red: "border-red-500/70 hover:bg-red-500/10 hover:text-white",
    green: "border-green-500/70 hover:bg-green-500/10 hover:text-green-300",
    orange: "border-orange-500/70 hover:bg-orange-500/10 hover:text-orange-300",
    violet: "border-violet-500/70 hover:bg-violet-500/10 hover:text-violet-300",
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setDone(false);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("docType", docType);
      const res = await fetch(`${import.meta.env.BASE_URL}api/workers/${workerId}/upload`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(err.error ?? "Upload failed");
      }
      const data = await res.json();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetWorkerQueryKey(workerId) }),
        queryClient.invalidateQueries({ queryKey: getGetWorkersQueryKey() }),
      ]);
      setDone(true);

      const filled = data.autoFilled as Record<string, string> | undefined;
      const filledLines: string[] = [];
      if (filled?.name) filledLines.push(`Name: ${filled.name}`);
      if (filled?.passportExpiry) filledLines.push(`Passport expires: ${filled.passportExpiry}`);
      if (filled?.trcExpiry) filledLines.push(`TRC expires: ${filled.trcExpiry}`);
      if (filled?.bhpExpiry) filledLines.push(`BHP expires: ${filled.bhpExpiry}`);
      if (filled?.specialization) filledLines.push(`Spec: ${filled.specialization}`);
      if (filled?.contractEndDate) filledLines.push(`Contract end: ${filled.contractEndDate}`);

      const description = filledLines.length > 0
        ? `AI auto-filled: ${filledLines.join(" · ")}`
        : `${label} saved successfully.`;

      toast({ title: data.scanned ? "✓ Document Scanned & Saved" : "✓ Document Uploaded", description });
      setTimeout(() => setDone(false), 4000);
    } catch (err) {
      toast({ title: "Upload Failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <label className={`w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl border-2 border-dashed cursor-pointer transition-all select-none font-semibold text-sm ${
      done
        ? "bg-green-500/15 border-green-500/60 text-green-400"
        : uploading
          ? "bg-slate-700 border-slate-500 text-gray-400 cursor-not-allowed"
          : `bg-slate-800 ${accentClasses[accent]} text-gray-300`
    }`}>
      <input ref={inputRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={handleFile} disabled={uploading} />
      {uploading ? <Loader2 className="w-5 h-5 animate-spin flex-shrink-0" /> : done ? <CheckCircle2 className="w-5 h-5 flex-shrink-0" /> : <Upload className="w-5 h-5 flex-shrink-0" />}
      <span>{uploading ? `Uploading ${label}…` : done ? `${label} Saved!` : `Upload ${label}`}</span>
    </label>
  );
}

export function WorkerProfilePanel({
  workerId,
  initialEditMode = false,
  onClose,
  onRenew,
  onNotify,
}: WorkerProfilePanelProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === "Admin";
  const { data: worker, isLoading } = useGetWorker(workerId || "", {
    query: { enabled: !!workerId },
  });

  const [isEditing, setIsEditing] = useState(false);
  const [editSpec, setEditSpec] = useState("");
  const [editSite, setEditSite] = useState("");
  const [editTrcExpiry, setEditTrcExpiry] = useState("");
  const [editBhpExpiry, setEditBhpExpiry] = useState("");
  const [editPassportExpiry, setEditPassportExpiry] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editHourlyRate, setEditHourlyRate] = useState("");
  const [editMonthlyHours, setEditMonthlyHours] = useState("");
  const [saving, setSaving] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (workerId) setIsEditing(initialEditMode);
  }, [workerId, initialEditMode]);

  useEffect(() => {
    if (worker && isEditing) {
      setEditSpec((worker as any).specialization || "");
      setEditSite((worker as any).assignedSite || "");
      setEditTrcExpiry((worker as any).trcExpiry || "");
      setEditBhpExpiry((worker as any).bhpExpiry || (worker as any).bhpStatus || "");
      setEditPassportExpiry((worker as any).passportExpiry || "");
      setEditEmail((worker as any).email || "");
      setEditPhone((worker as any).phone || "");
      setEditHourlyRate((worker as any).hourlyRate != null ? String((worker as any).hourlyRate) : "");
      setEditMonthlyHours((worker as any).monthlyHours != null ? String((worker as any).monthlyHours) : "");
    }
  }, [worker, isEditing]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isEditing) setIsEditing(false);
        else onClose();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, isEditing]);

  const handleSave = async () => {
    if (!workerId) return;
    setSaving(true);
    try {
      const body: Record<string, string> = {};
      if (editSpec) body.specialization = editSpec;
      if (editSite) body.assignedSite = editSite;
      if (editTrcExpiry) body.trcExpiry = editTrcExpiry;
      if (editBhpExpiry) body.bhpExpiry = editBhpExpiry;
      if (editPassportExpiry) body.passportExpiry = editPassportExpiry;
      if (editEmail) body.email = editEmail;
      if (editPhone) body.phone = editPhone;
      body.hourlyRate = editHourlyRate;
      body.monthlyHours = editMonthlyHours;

      const res = await fetch(`${import.meta.env.BASE_URL}api/workers/${workerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Save failed" }));
        throw new Error(err.error ?? "Save failed");
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetWorkerQueryKey(workerId) }),
        queryClient.invalidateQueries({ queryKey: getGetWorkersQueryKey() }),
        queryClient.invalidateQueries({ queryKey: ["workers-sites"] }),
      ]);
      toast({
        title: "✓ Welder Records Updated",
        description: "Changes saved. Compliance status recalculated.",
        className: "border-red-500/50 bg-slate-900 text-white [&>div]:text-red-400",
      });
      setIsEditing(false);
    } catch (err) {
      toast({ title: "Save Failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const isOpen = !!workerId;

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity duration-300 ${
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      />
      <div
        ref={panelRef}
        className={`fixed right-0 top-0 bottom-0 w-full max-w-md bg-slate-900 border-l border-white/10 shadow-2xl z-50 overflow-y-auto transform transition-transform duration-300 ease-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {isLoading || !worker ? (
          <div className="flex h-full items-center justify-center">
            <div className="w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="p-6 border-b border-white/10 relative overflow-hidden bg-slate-800/50">
              <div className="absolute top-0 right-0 p-4 flex items-center gap-2">
                {!isEditing && (
                  <button
                    onClick={() => { setIsEditing(true); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-700 hover:bg-red-600 border border-red-500 rounded-lg transition-colors text-xs font-bold text-white uppercase tracking-wider"
                    title="Edit worker"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Edit
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
                    <span className="px-2 py-0.5 rounded text-xs font-mono bg-white/10 text-gray-300 border border-white/10">
                      {(worker as any).specialization || 'No Spec'}
                    </span>
                    {(worker as any).assignedSite && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-600/20 border border-red-500/30 text-red-300 flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {(worker as any).assignedSite}
                      </span>
                    )}
                    <StatusBadge status={(worker as any).complianceStatus} />
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-6 flex-1">

              {/* EDIT MODE PANEL */}
              {isEditing && (
                <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/30 space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-widest text-red-400 flex items-center gap-2">
                      <Pencil className="w-3.5 h-3.5" />
                      Edit Welder Details
                    </p>
                    <span className="text-sm font-bold text-white truncate max-w-[55%] text-right">
                      {(worker as any).name}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {/* Spec */}
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Welding Spec</label>
                      <select
                        value={editSpec}
                        onChange={(e) => setEditSpec(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-red-500/60"
                      >
                        <option value="">— Select Spec —</option>
                        {SPEC_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>

                    {/* Assigned Site — free-text combobox */}
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">
                        Client / Project Site
                      </label>
                      <SiteCombobox value={editSite} onChange={setEditSite} />
                      <p className="text-[10px] text-gray-600 mt-1 font-mono">Type any name to add a new client or project</p>
                    </div>

                    {/* TRC Expiry */}
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">TRC Expiry</label>
                      <input
                        type="date"
                        value={editTrcExpiry}
                        onChange={(e) => setEditTrcExpiry(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-red-500/60"
                      />
                    </div>

                    {/* BHP Expiry */}
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">BHP Expiry</label>
                      <input
                        type="date"
                        value={editBhpExpiry}
                        onChange={(e) => setEditBhpExpiry(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-red-500/60"
                      />
                    </div>

                    {/* Passport Expiry */}
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Passport Expiry</label>
                      <input
                        type="date"
                        value={editPassportExpiry}
                        onChange={(e) => setEditPassportExpiry(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-red-500/60"
                      />
                    </div>

                    {/* Email */}
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Email</label>
                      <input
                        type="email"
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                        placeholder="email@example.com"
                        className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-red-500/60 placeholder:text-gray-600"
                      />
                    </div>

                    {/* Phone */}
                    <div className="col-span-2">
                      <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Phone</label>
                      <input
                        type="tel"
                        value={editPhone}
                        onChange={(e) => setEditPhone(e.target.value)}
                        placeholder="+48 000 000 000"
                        className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-red-500/60 placeholder:text-gray-600"
                      />
                    </div>

                    {/* Hourly Rate — Admin only */}
                    {isAdmin && (
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">{t("panel.hourlyRate")}</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={editHourlyRate}
                          onChange={(e) => setEditHourlyRate(e.target.value)}
                          placeholder="0.00"
                          className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-red-500/60 placeholder:text-gray-600"
                        />
                      </div>
                    )}

                    {/* Monthly Hours — Admin only */}
                    {isAdmin && (
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">{t("panel.monthlyHours")}</label>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={editMonthlyHours}
                          onChange={(e) => setEditMonthlyHours(e.target.value)}
                          placeholder="0"
                          className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-red-500/60 placeholder:text-gray-600"
                        />
                      </div>
                    )}
                  </div>

                  {/* Calculated Payout — Admin only */}
                  {isAdmin && editHourlyRate && editMonthlyHours && (
                    <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-800 border border-slate-600">
                      <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400">{t("panel.estPayout")}</span>
                      <span className="text-sm font-mono font-bold text-green-400">
                        {(parseFloat(editHourlyRate) * parseFloat(editMonthlyHours)).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} PLN
                      </span>
                    </div>
                  )}

                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => setIsEditing(false)}
                      disabled={saving}
                      className="flex-1 py-2 border border-white/15 bg-white/5 hover:bg-white/10 text-gray-300 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      Cancel
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="flex-1 py-2 bg-red-700 hover:bg-red-600 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-[0_0_15px_rgba(196,30,24,0.35)]"
                    >
                      {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      {saving ? "Saving…" : "Save Changes"}
                    </button>
                  </div>
                </div>
              )}

              {/* Contact */}
              <div className="grid grid-cols-1 gap-3 p-4 rounded-xl bg-slate-800 border border-slate-700">
                <div className="flex items-center gap-3 text-sm">
                  <Mail className="w-4 h-4 text-red-400 flex-shrink-0" />
                  <span className="text-gray-300 font-mono">{(worker as any).email || t("panel.noEmail")}</span>
                </div>
                <div className="flex items-center gap-2 text-sm flex-wrap">
                  <Phone className="w-4 h-4 text-red-400 flex-shrink-0" />
                  <span className="text-gray-300 font-mono flex-1">{(worker as any).phone || t("panel.noPhone")}</span>
                  {(worker as any).phone && (
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <a
                        href={`tel:${(worker as any).phone}`}
                        title={t("comm.call")}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-green-600/20 hover:bg-green-600/40 border border-green-500/30 text-green-400 text-xs font-bold transition-colors"
                      >📞 {t("comm.call")}</a>
                      <a
                        href={`sms:${(worker as any).phone}`}
                        title={t("comm.sms")}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/30 text-blue-400 text-xs font-bold transition-colors"
                      >✉️ {t("comm.sms")}</a>
                      {(() => {
                        const urgentDoc = getUrgentDoc(worker);
                        const waUrl = buildWaUrl((worker as any).phone, urgentDoc);
                        if (urgentDoc) {
                          return (
                            <a
                              href={waUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={t("comm.urgentTitle")}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-red-600 hover:bg-red-500 border border-red-400 text-white text-xs font-bold transition-colors animate-pulse"
                            >⚠️ {t("comm.urgentAlert")}</a>
                          );
                        }
                        return (
                          <a
                            href={waUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={t("comm.whatsapp")}
                            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-500/30 text-emerald-400 text-xs font-bold transition-colors"
                          >💬 {t("comm.whatsapp")}</a>
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

              {/* Compliance Timeline */}
              <div>
                <h3 className="text-xs font-bold tracking-widest text-gray-400 uppercase mb-3">
                  {t("panel.complianceTimeline")}
                </h3>
                <div className="space-y-2">
                  <DocRow label="TRC Certificate Expiry" date={(worker as any).trcExpiry} />
                  <DocRow label="BHP Certificate Expiry" date={(worker as any).bhpExpiry} />
                  <DocRow label="Passport Expiry" date={(worker as any).passportExpiry} />
                  <DocRow label={t("panel.workPermitExpiry")} date={(worker as any).workPermitExpiry} />
                  <DocRow label={t("panel.contractEndDate")} date={(worker as any).contractEndDate} />
                  {/* Monthly Hours + Payout — Admin only */}
                  {isAdmin && (
                    <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800 border border-slate-700">
                      <span className="text-sm font-medium text-gray-300">{t("panel.monthlyHoursLabel")}</span>
                      <span className="text-sm font-mono text-blue-400 font-semibold">
                        {(worker as any).monthlyHours != null
                          ? `${(worker as any).monthlyHours} hrs`
                          : <span className="text-gray-500">N/A</span>}
                      </span>
                    </div>
                  )}
                  {isAdmin && (worker as any).hourlyRate != null && (worker as any).monthlyHours != null && (
                    <div className="flex items-center justify-between p-3 rounded-lg bg-green-500/5 border border-green-500/20">
                      <span className="text-sm font-medium text-gray-300">{t("panel.estPayoutLabel")}</span>
                      <span className="text-sm font-mono text-green-400 font-bold">
                        {((worker as any).hourlyRate * (worker as any).monthlyHours).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} PLN
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Document Vault */}
              <div>
                <h3 className="text-xs font-bold tracking-widest text-gray-400 uppercase mb-3">
                  {t("panel.documentVault")}
                </h3>

                {/* Existing docs */}
                {((worker as any).passportAttachments?.length > 0 || (worker as any).trcAttachments?.length > 0 || (worker as any).bhpAttachments?.length > 0 || (worker as any).contractAttachments?.length > 0) && (
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    {(worker as any).passportAttachments?.map((att: any) => (
                      <AttachmentCard key={att.id} title="Passport" filename={att.filename} url={att.url} />
                    ))}
                    {(worker as any).trcAttachments?.map((att: any) => (
                      <AttachmentCard key={att.id} title="TRC Certificate" filename={att.filename} url={att.url} />
                    ))}
                    {(worker as any).bhpAttachments?.map((att: any) => (
                      <AttachmentCard key={att.id} title="BHP Certificate" filename={att.filename} url={att.url} />
                    ))}
                    {(worker as any).contractAttachments?.map((att: any) => (
                      <AttachmentCard key={att.id} title={t("panel.contract")} filename={att.filename} url={att.url} />
                    ))}
                  </div>
                )}

                {/* Upload buttons */}
                <div className="space-y-2.5">
                  <p className="text-xs text-gray-500 font-mono uppercase tracking-widest">Upload Document</p>
                  <UploadButton workerId={(worker as any).id} docType="passport" label="Passport" accent="red" />
                  <UploadButton workerId={(worker as any).id} docType="trc" label="TRC Certificate" accent="green" />
                  <UploadButton workerId={(worker as any).id} docType="bhp" label="BHP Certificate" accent="orange" />
                  <UploadButton workerId={(worker as any).id} docType="contract" label="Contract" accent="violet" />
                  <p className="text-xs text-gray-600 text-center">
                    PDF, JPG, PNG or WebP · AI scans welding docs automatically
                  </p>
                </div>
              </div>
            </div>

            {/* Footer actions */}
            <div className="p-5 border-t border-white/10 bg-slate-800/50 flex gap-3">
              <button
                className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-white border border-white/10 hover:border-white/20 rounded-xl font-bold uppercase tracking-wider text-sm transition-all"
                onClick={() => onNotify(worker)}
              >
                {t("panel.notify")}
              </button>
              <button
                className="flex-1 py-2.5 bg-red-700 hover:bg-red-600 text-white rounded-xl font-bold uppercase tracking-wider text-sm transition-all shadow-[0_0_15px_rgba(220,38,38,0.3)]"
                onClick={() => onRenew(worker)}
              >
                {t("panel.renewDoc")}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
