import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, CheckCircle2, XCircle, FileText, MapPin, Clock, AlertTriangle,
  ShieldX, FileQuestion, Upload, User, DollarSign, Pencil, Save,
  Phone, Mail, CreditCard, Building2, ChevronRight,
} from "lucide-react";
import { Worker, WorkerDocument, DocumentStatus, WorkerStatus, HoursEntry, AdvanceEntry } from "@/data/mockWorkers";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { Role } from "@/types";

type ProfileTab = "profile" | "documents" | "hours" | "finance";

interface WorkerDetailProps {
  worker: Worker;
  onClose: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function getStatusColors(status: WorkerStatus) {
  switch (status) {
    case "Compliant":     return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "Expiring Soon": return "bg-amber-50 text-amber-700 border-amber-200";
    case "Missing Docs":
    case "Non-Compliant": return "bg-red-50 text-red-700 border-red-200";
  }
}
function getDocStatusStyle(status: DocumentStatus) {
  switch (status) {
    case "Approved":     return { pill: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> };
    case "Under Review": return { pill: "bg-amber-50 text-amber-700 border-amber-200",       icon: <FileQuestion className="w-4 h-4 text-amber-500 shrink-0" /> };
    case "Missing":      return { pill: "bg-gray-100 text-gray-500 border-gray-200",         icon: <FileText className="w-4 h-4 text-gray-400 shrink-0" /> };
    case "Rejected":     return { pill: "bg-red-50 text-red-700 border-red-200",             icon: <XCircle className="w-4 h-4 text-red-500 shrink-0" /> };
    case "Expired":      return { pill: "bg-red-50 text-red-700 border-red-200",             icon: <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" /> };
    default:             return { pill: "bg-gray-100 text-gray-500 border-gray-200",         icon: <FileText className="w-4 h-4 text-gray-400 shrink-0" /> };
  }
}
const UPLOADER_STYLE: Record<string, string> = {
  "Tech Ops":    "bg-blue-50 text-blue-700 border-blue-200",
  "Coordinator": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Professional":"bg-amber-50 text-amber-700 border-amber-200",
};
function Field({ label, value, editing, inputValue, onInput }: { label: string; value: string; editing: boolean; inputValue?: string; onInput?: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</label>
      {editing && onInput !== undefined ? (
        <input
          type="text"
          value={inputValue ?? value}
          onChange={e => onInput(e.target.value)}
          className="w-full h-9 px-3 bg-gray-50 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
        />
      ) : (
        <p className="text-sm font-semibold text-foreground">{value || "—"}</p>
      )}
    </div>
  );
}
function SelectField({ label, value, options, editing, onChange }: { label: string; value: string; options: string[]; editing: boolean; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</label>
      {editing ? (
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full h-9 px-3 bg-gray-50 border border-border rounded-lg text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
        >
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <p className="text-sm font-semibold text-foreground">{value || "—"}</p>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export function WorkerDetail({ worker, onClose }: WorkerDetailProps) {
  const { role } = useAuth();
  const [activeTab, setActiveTab] = useState<ProfileTab>("profile");
  const [documents, setDocuments] = useState<WorkerDocument[]>(worker.documents);
  const [hours]    = useState<HoursEntry[]>(worker.hoursLog);
  const [finance]  = useState<AdvanceEntry[]>(worker.financeLog);
  const [editing, setEditing]     = useState(false);
  const [editData, setEditData]   = useState({ ...worker });

  const canEdit      = role === "Executive" || role === "LegalHead";
  const canApprove   = role === "Executive" || role === "LegalHead" || role === "TechOps" || role === "Coordinator";
  const showFinancial = role === "Executive";      // IBAN, hourly rate
  const showZUS      = role === "Executive";        // ZUS + salary detail (T2 cannot see)

  const initials = worker.name.split(" ").map(n => n[0]).join("");
  const avatarColor = {
    "Compliant":     "bg-emerald-100 text-emerald-700",
    "Expiring Soon": "bg-amber-100 text-amber-700",
    "Missing Docs":  "bg-red-100 text-red-700",
    "Non-Compliant": "bg-red-100 text-red-700",
  }[worker.status];

  const pendingDocs = documents.filter(d => d.status === "Under Review").length;
  const totalHours  = hours.reduce((s, h) => s + h.hours, 0);

  const TABS: { id: ProfileTab; label: string; icon: React.ElementType; badge?: number }[] = [
    { id: "profile",   label: "Profile",   icon: User },
    { id: "documents", label: "Docs",      icon: FileText, badge: pendingDocs || undefined },
    { id: "hours",     label: "Hours",     icon: Clock },
    { id: "finance",   label: "Finance",   icon: DollarSign },
  ];

  const handleApprove = (docId: string, docType: string) => {
    setDocuments(prev => prev.map(d => d.id === docId ? { ...d, status: "Approved" as DocumentStatus } : d));
    toast({ title: "Document Approved", description: `${docType} for ${worker.name} approved.` });
  };
  const handleReject = (docId: string, docType: string) => {
    setDocuments(prev => prev.map(d => d.id === docId ? { ...d, status: "Rejected" as DocumentStatus } : d));
    toast({ title: "Re-upload Requested", description: `${docType} rejected. Professional notified.`, variant: "destructive" });
  };
  const handleUpload = (docId: string, docType: string) => {
    setDocuments(prev => prev.map(d => d.id === docId ? { ...d, status: "Under Review" as DocumentStatus, uploadedAt: new Date().toISOString().slice(0, 10), fileName: `${worker.name.split(" ")[1]?.toLowerCase() ?? "worker"}_${docType.replace(/\s+/g, "_").toLowerCase()}_new.pdf`, uploadedBy: (role === "TechOps" ? "Tech Ops" : role === "Coordinator" ? "Coordinator" : "Tech Ops") as any } : d));
    toast({ title: "Document Uploaded", description: `${docType} submitted for review.` });
  };
  const handleSave = () => {
    setEditing(false);
    toast({ title: "Profile Updated", description: `${editData.name}'s profile saved successfully.` });
  };

  const accentByRole: Record<Role, string> = {
    Executive:    "bg-indigo-600",
    LegalHead:    "bg-violet-600",
    TechOps:      "bg-blue-600",
    Coordinator:  "bg-emerald-600",
    Professional: "bg-amber-600",
  };
  const activeTabColor = role ? accentByRole[role as Role] : "bg-indigo-600";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ type: "spring", damping: 28, stiffness: 300 }}
      className="absolute inset-0 z-50 flex flex-col bg-gray-50"
    >
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-border shadow-sm px-4 pt-3 pb-0 shrink-0 sticky top-0 z-20">
        {/* Top row */}
        <div className="flex items-center gap-3 mb-3">
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-gray-100 active:scale-95 transition-all shrink-0">
            <X className="w-5 h-5" strokeWidth={2} />
          </button>
          <div className={cn("w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0", avatarColor)}>
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-base text-foreground leading-tight truncate">{worker.name}</h1>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>{worker.trade}</span>
              <span>·</span>
              <MapPin className="w-3 h-3 shrink-0" />
              <span className="truncate">{worker.workplace}</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-bold border whitespace-nowrap", getStatusColors(worker.status))}>
              {worker.status}
            </span>
            {canEdit && (
              <button
                onClick={() => editing ? handleSave() : setEditing(true)}
                className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center transition-all active:scale-90",
                  editing ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                )}
              >
                {editing ? <Save className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex overflow-x-auto no-scrollbar">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 transition-all relative shrink-0",
                  isActive
                    ? "border-current text-indigo-600"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
                style={isActive ? { color: undefined, borderColor: undefined } : undefined}
              >
                <span className={cn(
                  "flex items-center gap-1.5",
                  isActive ? (role === "Executive" ? "text-indigo-600" : role === "LegalHead" ? "text-violet-600" : role === "TechOps" ? "text-blue-600" : role === "Coordinator" ? "text-emerald-600" : "text-amber-600") : ""
                )}>
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                  {tab.badge ? (
                    <span className="ml-0.5 w-4 h-4 rounded-full bg-amber-500 text-white text-[9px] font-black flex items-center justify-center">
                      {tab.badge}
                    </span>
                  ) : null}
                </span>
                {isActive && (
                  <span className={cn("absolute bottom-0 left-0 right-0 h-0.5 rounded-full", activeTabColor)} />
                )}
              </button>
            );
          })}
        </div>
      </header>

      {/* ── Tab Content ───────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto no-scrollbar">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.14 }}
            className="pb-8"
          >

            {/* ── PROFILE TAB ─────────────────────────────────────────────── */}
            {activeTab === "profile" && (
              <div className="px-4 pt-4 space-y-4">
                {editing && (
                  <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 flex items-center gap-2">
                    <Pencil className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <p className="text-[11px] text-blue-700 font-semibold">Editing mode — tap Save when done</p>
                  </div>
                )}

                {/* Personal Info */}
                <SectionCard title="Personal Information" icon={User}>
                  <div className="grid grid-cols-1 gap-3">
                    <Field label="Full Name"  value={editData.name}  editing={editing} inputValue={editData.name}  onInput={v => setEditData(p => ({ ...p, name: v }))} />
                    <Field label="Email"      value={editData.email} editing={editing} inputValue={editData.email} onInput={v => setEditData(p => ({ ...p, email: v }))} />
                    <Field label="Phone"      value={editData.phone} editing={editing} inputValue={editData.phone} onInput={v => setEditData(p => ({ ...p, phone: v }))} />
                    <Field label="PESEL"      value={editData.pesel} editing={canEdit && editing} inputValue={editData.pesel} onInput={v => setEditData(p => ({ ...p, pesel: v }))} />
                    <SelectField label="Visa / Permit Type" value={editData.visaType} editing={canEdit && editing}
                      options={["Karta Pobytu - Czasowy","Karta Pobytu - Stały","Karta Pobytu - UE LT","Wiza D","Wiza C","EU Citizen","Other"]}
                      onChange={v => setEditData(p => ({ ...p, visaType: v as any }))} />
                  </div>
                </SectionCard>

                {/* Employment */}
                <SectionCard title="Employment" icon={Building2}>
                  <div className="grid grid-cols-1 gap-3">
                    <SelectField label="Specialization" value={editData.specialization} editing={editing}
                      options={["TIG","MIG","MAG","MMA","ARC / Electrode","FCAW","FABRICATOR"]}
                      onChange={v => setEditData(p => ({ ...p, specialization: v as any }))} />
                    <SelectField label="Trade" value={editData.trade} editing={editing}
                      options={["Welder","Steel Fixer","Pipe Fitter","Scaffolder"]}
                      onChange={v => setEditData(p => ({ ...p, trade: v as any }))} />
                    <Field label="Deployment Site" value={editData.workplace} editing={editing} inputValue={editData.workplace} onInput={v => setEditData(p => ({ ...p, workplace: v }))} />
                    <Field label="Contract End Date" value={editData.contractEndDate || ""} editing={editing} inputValue={editData.contractEndDate} onInput={v => setEditData(p => ({ ...p, contractEndDate: v }))} />
                  </div>
                </SectionCard>

                {/* ZUS & Financial — T1 only */}
                {showZUS && (
                  <SectionCard title="ZUS & Financial" icon={CreditCard}>
                    <div className="grid grid-cols-1 gap-3">
                      <SelectField label="ZUS Status" value={editData.zusStatus} editing={editing}
                        options={["Registered","Unregistered","Unknown"]}
                        onChange={v => setEditData(p => ({ ...p, zusStatus: v as any }))} />
                      <Field label="IBAN" value={editData.iban} editing={editing} inputValue={editData.iban} onInput={v => setEditData(p => ({ ...p, iban: v }))} />
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Hourly Rate (PLN)</label>
                        {editing ? (
                          <input type="number" value={editData.hourlyRate}
                            onChange={e => setEditData(p => ({ ...p, hourlyRate: Number(e.target.value) }))}
                            className="w-full h-9 px-3 bg-gray-50 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all" />
                        ) : (
                          <p className="text-sm font-semibold text-foreground">{editData.hourlyRate} PLN/hr</p>
                        )}
                      </div>
                    </div>
                  </SectionCard>
                )}

                {/* Contact actions */}
                <SectionCard title="Quick Contact" icon={Phone}>
                  <div className="flex gap-2">
                    <a href={`tel:${worker.phone}`} className="flex-1 flex items-center justify-center gap-2 h-10 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold transition-all active:scale-95">
                      <Phone className="w-3.5 h-3.5" /> Call
                    </a>
                    <a href={`mailto:${worker.email}`} className="flex-1 flex items-center justify-center gap-2 h-10 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold transition-all active:scale-95">
                      <Mail className="w-3.5 h-3.5" /> Email
                    </a>
                  </div>
                </SectionCard>
              </div>
            )}

            {/* ── DOCUMENTS TAB ───────────────────────────────────────────── */}
            {activeTab === "documents" && (
              <div className="px-4 pt-4 space-y-3">
                {/* Shared notice */}
                <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full bg-blue-200 flex items-center justify-center shrink-0">
                    <span className="text-[7px] font-black text-blue-700">T</span>
                  </div>
                  <p className="text-[11px] text-blue-700 font-medium leading-tight">
                    Tech Ops &amp; Coordinators share document visibility. Tap Upload to resubmit.
                  </p>
                </div>

                <AnimatePresence>
                  {documents.map(doc => {
                    const style = getDocStatusStyle(doc.status);
                    const isUnderReview = doc.status === "Under Review";
                    const isMissing = doc.status === "Missing" || doc.status === "Rejected" || doc.status === "Expired";
                    const uploaderStyle = doc.uploadedBy ? UPLOADER_STYLE[doc.uploadedBy] : null;

                    return (
                      <motion.div
                        key={doc.id}
                        layout
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        className="bg-white rounded-2xl border shadow-sm overflow-hidden"
                      >
                        <div className="p-3.5">
                          <div className="flex items-start gap-3">
                            {style.icon}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <span className="font-semibold text-sm text-foreground leading-tight">{doc.type}</span>
                                <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-bold border whitespace-nowrap shrink-0", style.pill)}>
                                  {doc.status}
                                </span>
                              </div>

                              {doc.fileName && (
                                <div className="flex items-center gap-1 mt-0.5">
                                  <FileText className="w-3 h-3 text-muted-foreground shrink-0" />
                                  <span className="text-[11px] text-muted-foreground font-medium truncate">{doc.fileName}</span>
                                </div>
                              )}
                              {doc.uploadedAt && (
                                <div className="flex items-center gap-1 mt-0.5">
                                  <Clock className="w-3 h-3 text-muted-foreground shrink-0" />
                                  <span className="text-[11px] text-muted-foreground">
                                    Uploaded {doc.uploadedAt}
                                    {doc.expiresAt && ` · Expires ${doc.expiresAt}`}
                                  </span>
                                </div>
                              )}
                              {doc.uploadedBy && uploaderStyle && (
                                <div className="mt-1">
                                  <span className={cn("inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full border", uploaderStyle)}>
                                    ↑ {doc.uploadedBy}
                                  </span>
                                </div>
                              )}
                              {doc.status === "Missing" && (
                                <p className="text-[11px] text-muted-foreground mt-0.5">No file submitted yet.</p>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Upload button — for missing/rejected/expired */}
                        {isMissing && canApprove && (
                          <div className="border-t border-border">
                            <button
                              onClick={() => handleUpload(doc.id, doc.type)}
                              className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-bold text-blue-700 hover:bg-blue-50 active:bg-blue-100 transition-colors"
                            >
                              <Upload className="w-4 h-4" />
                              Upload {doc.type}
                            </button>
                          </div>
                        )}

                        {/* Approve / Reject — for under review */}
                        {isUnderReview && canApprove && (
                          <div className="flex border-t border-border">
                            <button
                              onClick={() => handleApprove(doc.id, doc.type)}
                              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold text-emerald-700 hover:bg-emerald-50 active:bg-emerald-100 transition-colors"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              Approve
                            </button>
                            <div className="w-px bg-border" />
                            <button
                              onClick={() => handleReject(doc.id, doc.type)}
                              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold text-red-600 hover:bg-red-50 active:bg-red-100 transition-colors"
                            >
                              <XCircle className="w-4 h-4" />
                              Reject
                            </button>
                          </div>
                        )}
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}

            {/* ── HOURS TAB ───────────────────────────────────────────────── */}
            {activeTab === "hours" && (
              <div className="px-4 pt-4 space-y-4">
                {/* Summary card */}
                <div className="bg-white rounded-2xl border shadow-sm p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">March 2026</span>
                    <span className="text-[10px] font-black bg-amber-500 text-white px-2 py-0.5 rounded-full">OPEN</span>
                  </div>
                  <div className="text-3xl font-black text-blue-600 leading-none">{totalHours} hrs</div>
                  <div className="text-xs text-muted-foreground font-medium mt-1">Logged this month</div>
                  <div className="h-1.5 w-full bg-gray-100 rounded-full mt-3 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min((totalHours / 200) * 100, 100)}%` }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                      className="h-full bg-blue-500 rounded-full"
                    />
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1">{totalHours} / 200 expected hours</div>
                </div>

                {/* Weekly breakdown */}
                <SectionCard title="Weekly Breakdown" icon={Clock}>
                  <div className="divide-y divide-gray-50">
                    {hours.map((row, i) => (
                      <div key={i} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                        <div>
                          <p className="text-sm font-semibold text-foreground">{row.week}</p>
                          <p className="text-xs text-muted-foreground">{row.hours} hours</p>
                        </div>
                        <span className={cn(
                          "text-[10px] font-bold px-2.5 py-1 rounded-full border whitespace-nowrap",
                          row.status === "Approved" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : row.status === "Rejected" ? "bg-red-50 text-red-700 border-red-200"
                          : "bg-amber-50 text-amber-700 border-amber-200"
                        )}>
                          {row.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </SectionCard>

                {/* T1-only: approve hours */}
                {role === "Executive" && (
                  <button
                    onClick={() => toast({ title: "Hours Approved", description: `All pending hours for ${worker.name} approved.` })}
                    className="w-full h-11 rounded-xl bg-indigo-600 text-white text-sm font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-all shadow-md shadow-indigo-200"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Approve All Pending Hours
                  </button>
                )}
              </div>
            )}

            {/* ── FINANCE TAB ─────────────────────────────────────────────── */}
            {activeTab === "finance" && (
              <div className="px-4 pt-4 space-y-4">
                {/* ZUS / Salary summary — T1 only */}
                {showFinancial && (
                  <SectionCard title="Salary Overview" icon={DollarSign}>
                    <div className="space-y-2">
                      <FinRow label="Hourly Rate"   value={`${worker.hourlyRate} PLN/hr`} accent="blue" />
                      <FinRow label="March Hours"   value={`${totalHours} hrs`} />
                      <FinRow label="Gross (est.)"  value={`${totalHours * worker.hourlyRate} PLN`} accent="green" />
                      <FinRow label="IBAN"          value={worker.iban || "Not set"} accent={worker.iban ? "blue" : "red"} />
                      <FinRow label="ZUS Status"    value={worker.zusStatus} accent={worker.zusStatus === "Registered" ? "green" : "red"} />
                    </div>
                  </SectionCard>
                )}

                {/* Advance / Penalty log — all T1–T4 */}
                <SectionCard title="Advance & Penalty Log" icon={CreditCard}>
                  {finance.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No records yet.</p>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      {finance.map(entry => (
                        <div key={entry.id} className="flex items-start justify-between py-3 first:pt-0 last:pb-0 gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className={cn(
                                "text-[10px] font-black px-2 py-0.5 rounded-full border whitespace-nowrap",
                                entry.type === "Advance"   ? "bg-blue-50 text-blue-700 border-blue-200"
                                : entry.type === "Penalty" ? "bg-red-50 text-red-700 border-red-200"
                                :                            "bg-amber-50 text-amber-700 border-amber-200"
                              )}>
                                {entry.type}
                              </span>
                              <span className="text-[10px] text-muted-foreground">{entry.date}</span>
                            </div>
                            <p className="text-xs text-muted-foreground truncate">{entry.note}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className={cn(
                              "text-sm font-bold",
                              entry.amount > 0 ? "text-blue-600" : "text-red-600"
                            )}>
                              {entry.amount > 0 ? "+" : ""}{entry.amount} PLN
                            </p>
                            <span className={cn(
                              "text-[10px] font-bold",
                              entry.status === "Settled" ? "text-emerald-600" : "text-amber-600"
                            )}>
                              {entry.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </SectionCard>

                {/* Summary */}
                <div className="bg-white rounded-2xl border shadow-sm p-4">
                  <div className="space-y-2">
                    <FinRow label="Total Advances"
                      value={`+${finance.filter(f => f.type === "Advance").reduce((s, f) => s + f.amount, 0)} PLN`}
                      accent="blue" />
                    <FinRow label="Total Penalties / Deductions"
                      value={`${finance.filter(f => f.amount < 0).reduce((s, f) => s + f.amount, 0)} PLN`}
                      accent="red" />
                    <div className="h-px bg-gray-100 my-1" />
                    <FinRow label="Net Balance"
                      value={`${finance.reduce((s, f) => s + f.amount, 0)} PLN`}
                      accent={finance.reduce((s, f) => s + f.amount, 0) >= 0 ? "green" : "red"} />
                  </div>
                </div>

                {/* T1-only: Add entry */}
                {role === "Executive" && (
                  <button
                    onClick={() => toast({ title: "Coming Soon", description: "Add advance/penalty entry form — coming in next update." })}
                    className="w-full h-11 rounded-xl border-2 border-dashed border-indigo-200 text-indigo-600 text-sm font-bold flex items-center justify-center gap-2 hover:bg-indigo-50 active:scale-[0.98] transition-all"
                  >
                    + Add Entry
                  </button>
                )}
              </div>
            )}

          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────────
function SectionCard({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 bg-gray-50/80 border-b border-border flex items-center gap-2">
        <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{title}</span>
      </div>
      <div className="p-4">
        {children}
      </div>
    </div>
  );
}

function FinRow({ label, value, accent }: { label: string; value: string; accent?: "green" | "red" | "blue" }) {
  const colors = { green: "text-emerald-600", red: "text-red-600", blue: "text-blue-600" };
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground font-medium">{label}</span>
      <span className={cn("text-xs font-bold", accent ? colors[accent] : "text-foreground")}>{value}</span>
    </div>
  );
}
