import { useState, useEffect } from "react";
import {
  FileCheck, ChevronDown, ChevronUp, Plus, X, Send, Bell, Receipt,
  Sparkles, Loader2, AlertTriangle, CheckCircle, Clock, FileText,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const API = "/api";
function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

interface TRCDocument {
  name: string;
  required: boolean;
  uploaded: boolean;
}

interface TRCCase {
  id: string;
  workerName: string;
  nationality: string;
  employer: string;
  permitType: string;
  voivodeship: string;
  status: "Documents Gathering" | "Submitted" | "Under Review" | "Approved" | "Rejected";
  fee: number;
  paid: boolean;
  submittedDate: string | null;
  approvedDate: string | null;
  expiryDate: string | null;
  esspiActive: boolean;
  documents: TRCDocument[];
  notes: string[];
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  "Documents Gathering": "bg-yellow-900/50 text-yellow-400 border-yellow-500/30",
  "Submitted": "bg-blue-900/50 text-blue-400 border-blue-500/30",
  "Under Review": "bg-purple-900/50 text-purple-400 border-purple-500/30",
  "Approved": "bg-emerald-900/50 text-emerald-400 border-emerald-500/30",
  "Rejected": "bg-red-900/50 text-red-400 border-red-500/30",
};

const NATIONALITIES = ["Ukrainian", "Belarusian", "Georgian", "Indian", "Bangladeshi", "Nepalese", "Filipino", "Uzbek", "Other"];
const PERMIT_TYPES = ["First TRC", "TRC Renewal", "EU Long-Term Resident", "Blue Card", "Seasonal Work"];
const VOIVODESHIPS = ["Mazowieckie", "Malopolskie", "Slaskie", "Wielkopolskie", "Dolnoslaskie", "Lodzkie", "Pomorskie", "Lubelskie", "Podkarpackie", "Kujawsko-Pomorskie", "Zachodniopomorskie", "Warminsko-Mazurskie", "Swietokrzyskie", "Podlaskie", "Lubuskie", "Opolskie"];

export default function TRCService() {
  const { toast } = useToast();
  const [cases, setCases] = useState<TRCCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Create form state
  const [form, setForm] = useState({
    workerName: "", nationality: "Ukrainian", employer: "",
    permitType: "First TRC", voivodeship: "Mazowieckie", fee: 440,
  });

  const fetchCases = () => {
    setLoading(true);
    fetch(`${API}/trc/cases`, { headers: authHeaders() })
      .then(r => r.json())
      .then(data => setCases(data.cases ?? []))
      .catch(() => {
        setCases(demoData());
        toast({ title: "Info", description: "Loaded demo TRC data" });
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchCases(); }, []);

  const totalCases = cases.length;
  const byStatus = (s: string) => cases.filter(c => c.status === s).length;
  const totalRevenue = cases.reduce((s, c) => s + c.fee, 0);
  const missingDocs = cases.reduce((s, c) => s + c.documents.filter(d => d.required && !d.uploaded).length, 0);

  const handleCreate = async () => {
    if (!form.workerName || !form.employer) {
      toast({ title: "Error", description: "Worker name and employer are required", variant: "destructive" });
      return;
    }
    try {
      const res = await fetch(`${API}/trc/cases`, {
        method: "POST", headers: authHeaders(), body: JSON.stringify(form),
      });
      if (res.ok) {
        toast({ title: "Success", description: "TRC case created" });
        setShowCreate(false);
        setForm({ workerName: "", nationality: "Ukrainian", employer: "", permitType: "First TRC", voivodeship: "Mazowieckie", fee: 440 });
        fetchCases();
      } else throw new Error();
    } catch {
      toast({ title: "Error", description: "Failed to create case", variant: "destructive" });
    }
  };

  const handleAction = async (caseId: string, action: string) => {
    setActionLoading(`${caseId}-${action}`);
    try {
      const endpoint = action === "generate-checklist"
        ? `${API}/trc/cases/${caseId}/generate-checklist`
        : action === "send-checklist"
          ? `${API}/trc/cases/${caseId}/send-checklist`
          : action === "notify"
            ? `${API}/trc/cases/${caseId}/notify`
            : action === "invoice"
              ? `${API}/trc/cases/${caseId}/invoice`
              : `${API}/trc/cases/${caseId}`;

      const method = action === "update-status" ? "PATCH" : "POST";
      await fetch(endpoint, { method, headers: authHeaders() });
      toast({ title: "Success", description: `Action "${action}" completed` });
      fetchCases();
    } catch {
      toast({ title: "Error", description: `Failed: ${action}`, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleStatusChange = async (caseId: string, newStatus: string) => {
    try {
      await fetch(`${API}/trc/cases/${caseId}`, {
        method: "PATCH", headers: authHeaders(),
        body: JSON.stringify({ status: newStatus }),
      });
      toast({ title: "Updated", description: `Status changed to ${newStatus}` });
      fetchCases();
    } catch {
      toast({ title: "Error", description: "Failed to update status", variant: "destructive" });
    }
  };

  const docProgress = (docs: TRCDocument[]) => {
    const required = docs.filter(d => d.required).length;
    if (required === 0) return 100;
    const done = docs.filter(d => d.required && d.uploaded).length;
    return Math.round((done / required) * 100);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-red-500" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 min-h-screen overflow-y-auto pb-24 bg-background">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <FileCheck className="w-6 h-6 text-red-500" /> TRC Case Management
          </h1>
          <p className="text-sm text-slate-400 mt-1">Temporary Residence Card applications &mdash; Legal Head Dashboard</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold transition-colors"
        >
          <Plus className="w-4 h-4" /> New Case
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total Cases", value: totalCases, icon: FileText, color: "text-blue-400" },
          { label: "Approved", value: byStatus("Approved"), icon: CheckCircle, color: "text-emerald-400" },
          { label: "Revenue (PLN)", value: `${totalRevenue.toLocaleString()}`, icon: Receipt, color: "text-yellow-400" },
          { label: "Missing Docs", value: missingDocs, icon: AlertTriangle, color: "text-red-400" },
        ].map(card => (
          <div key={card.label} className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <card.icon className={`w-4 h-4 ${card.color}`} />
              <span className="text-xs text-slate-400 uppercase tracking-wide">{card.label}</span>
            </div>
            <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Status breakdown */}
      <div className="flex flex-wrap gap-2 mb-6">
        {["Documents Gathering", "Submitted", "Under Review", "Approved", "Rejected"].map(s => (
          <span key={s} className={`px-3 py-1 rounded-full text-xs font-mono border ${STATUS_COLORS[s]}`}>
            {s}: {byStatus(s)}
          </span>
        ))}
      </div>

      {/* Create Case Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">New TRC Case</h2>
              <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-wide">Worker Name *</label>
                <input
                  value={form.workerName} onChange={e => setForm({ ...form, workerName: e.target.value })}
                  className="w-full mt-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-wide">Nationality</label>
                <select
                  value={form.nationality} onChange={e => setForm({ ...form, nationality: e.target.value })}
                  className="w-full mt-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none"
                >
                  {NATIONALITIES.map(n => <option key={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-wide">Employer *</label>
                <input
                  value={form.employer} onChange={e => setForm({ ...form, employer: e.target.value })}
                  className="w-full mt-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 uppercase tracking-wide">Permit Type</label>
                  <select
                    value={form.permitType} onChange={e => setForm({ ...form, permitType: e.target.value })}
                    className="w-full mt-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none"
                  >
                    {PERMIT_TYPES.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 uppercase tracking-wide">Voivodeship</label>
                  <select
                    value={form.voivodeship} onChange={e => setForm({ ...form, voivodeship: e.target.value })}
                    className="w-full mt-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none"
                  >
                    {VOIVODESHIPS.map(v => <option key={v}>{v}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-wide">Fee (PLN)</label>
                <input
                  type="number" value={form.fee} onChange={e => setForm({ ...form, fee: Number(e.target.value) })}
                  className="w-full mt-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">Cancel</button>
              <button onClick={handleCreate} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold transition-colors">Create Case</button>
            </div>
          </div>
        </div>
      )}

      {/* Cases List */}
      <div className="space-y-3">
        {cases.length === 0 && (
          <div className="text-center py-12 text-slate-500">
            <FileCheck className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p>No TRC cases yet. Create your first case.</p>
          </div>
        )}
        {cases.map(c => {
          const isExpanded = expanded === c.id;
          const progress = docProgress(c.documents);
          return (
            <div key={c.id} className="bg-slate-800/60 border border-slate-700/50 rounded-xl overflow-hidden">
              {/* Card Header */}
              <div
                className="p-4 cursor-pointer hover:bg-slate-800/80 transition-colors"
                onClick={() => setExpanded(isExpanded ? null : c.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="text-white font-semibold">{c.workerName}</h3>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono uppercase border ${STATUS_COLORS[c.status]}`}>
                        {c.status}
                      </span>
                      {c.esspiActive && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono uppercase bg-cyan-900/50 text-cyan-400 border border-cyan-500/30">
                          ESSPASS
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-4 mt-2 text-xs text-slate-400">
                      <span>Nationality: <span className="text-slate-300">{c.nationality}</span></span>
                      <span>Employer: <span className="text-slate-300">{c.employer}</span></span>
                      <span>Type: <span className="text-slate-300">{c.permitType}</span></span>
                      <span>Fee: <span className="text-yellow-400">{c.fee} PLN</span></span>
                      <span>Paid: <span className={c.paid ? "text-emerald-400" : "text-red-400"}>{c.paid ? "Yes" : "No"}</span></span>
                    </div>
                    {/* Document progress */}
                    <div className="mt-2 flex items-center gap-3">
                      <div className="flex-1 max-w-xs h-2 bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${progress === 100 ? "bg-emerald-500" : progress > 50 ? "bg-yellow-500" : "bg-red-500"}`}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-400 font-mono">{progress}% docs</span>
                    </div>
                  </div>
                  <div className="ml-3 text-slate-500">
                    {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                  </div>
                </div>
              </div>

              {/* Expanded Section */}
              {isExpanded && (
                <div className="border-t border-slate-700/50 p-4 space-y-4">
                  {/* Document Checklist */}
                  <div>
                    <h4 className="text-sm font-semibold text-slate-300 mb-2">Document Checklist</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {c.documents.map((doc, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          {doc.uploaded ? (
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                          ) : doc.required ? (
                            <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                          ) : (
                            <Clock className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                          )}
                          <span className={doc.uploaded ? "text-slate-300" : doc.required ? "text-red-400" : "text-slate-500"}>
                            {doc.name}
                            {doc.required && !doc.uploaded && " *"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Notes */}
                  {c.notes.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-slate-300 mb-2">Notes</h4>
                      <div className="space-y-1">
                        {c.notes.map((note, i) => (
                          <p key={i} className="text-xs text-slate-400 bg-slate-900/50 rounded px-3 py-1.5">{note}</p>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Status Change */}
                  <div>
                    <h4 className="text-sm font-semibold text-slate-300 mb-2">Update Status</h4>
                    <div className="flex flex-wrap gap-2">
                      {["Documents Gathering", "Submitted", "Under Review", "Approved", "Rejected"].map(s => (
                        <button
                          key={s}
                          disabled={c.status === s}
                          onClick={() => handleStatusChange(c.id, s)}
                          className={`px-3 py-1 rounded-lg text-xs font-mono transition-colors border ${
                            c.status === s
                              ? "opacity-40 cursor-not-allowed border-slate-600 text-slate-500"
                              : `${STATUS_COLORS[s]} hover:opacity-80 cursor-pointer`
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-700/30">
                    {[
                      { action: "generate-checklist", label: "AI Checklist", icon: Sparkles, color: "text-purple-400 hover:bg-purple-900/30" },
                      { action: "send-checklist", label: "Send Checklist", icon: Send, color: "text-blue-400 hover:bg-blue-900/30" },
                      { action: "notify", label: "Notify", icon: Bell, color: "text-yellow-400 hover:bg-yellow-900/30" },
                      { action: "invoice", label: "Invoice", icon: Receipt, color: "text-emerald-400 hover:bg-emerald-900/30" },
                    ].map(btn => (
                      <button
                        key={btn.action}
                        onClick={() => handleAction(c.id, btn.action)}
                        disabled={actionLoading === `${c.id}-${btn.action}`}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border border-slate-700/50 ${btn.color}`}
                      >
                        {actionLoading === `${c.id}-${btn.action}` ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <btn.icon className="w-3.5 h-3.5" />
                        )}
                        {btn.label}
                      </button>
                    ))}
                  </div>

                  {/* Dates */}
                  <div className="flex flex-wrap gap-4 text-xs text-slate-500 pt-2">
                    <span>Created: {new Date(c.createdAt).toLocaleDateString()}</span>
                    {c.submittedDate && <span>Submitted: {new Date(c.submittedDate).toLocaleDateString()}</span>}
                    {c.approvedDate && <span>Approved: {new Date(c.approvedDate).toLocaleDateString()}</span>}
                    {c.expiryDate && <span>Expires: {new Date(c.expiryDate).toLocaleDateString()}</span>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* Demo data fallback */
function demoData(): TRCCase[] {
  return [
    {
      id: "trc-001", workerName: "Oleksandr Kovalenko", nationality: "Ukrainian", employer: "Apatris Sp. z o.o.",
      permitType: "First TRC", voivodeship: "Mazowieckie", status: "Under Review", fee: 440, paid: true,
      submittedDate: "2026-02-15", approvedDate: null, expiryDate: null, esspiActive: true,
      documents: [
        { name: "Passport copy", required: true, uploaded: true },
        { name: "Visa / stamp copy", required: true, uploaded: true },
        { name: "4 photos 35x45mm", required: true, uploaded: true },
        { name: "Proof of accommodation", required: true, uploaded: false },
        { name: "Work contract", required: true, uploaded: true },
        { name: "Health insurance", required: true, uploaded: true },
        { name: "Criminal record (origin)", required: false, uploaded: false },
        { name: "Application form (filled)", required: true, uploaded: true },
      ],
      notes: ["Application submitted to Mazowiecki Urzad Wojewodzki", "Stamp received 2026-02-15"],
      createdAt: "2026-01-20",
    },
    {
      id: "trc-002", workerName: "Rajesh Sharma", nationality: "Indian", employer: "Apatris Sp. z o.o.",
      permitType: "TRC Renewal", voivodeship: "Malopolskie", status: "Documents Gathering", fee: 440, paid: false,
      submittedDate: null, approvedDate: null, expiryDate: null, esspiActive: false,
      documents: [
        { name: "Passport copy", required: true, uploaded: true },
        { name: "Current TRC copy", required: true, uploaded: true },
        { name: "4 photos 35x45mm", required: true, uploaded: false },
        { name: "Proof of accommodation", required: true, uploaded: false },
        { name: "Work contract", required: true, uploaded: false },
        { name: "Health insurance", required: true, uploaded: false },
        { name: "PIT-37 / tax certificate", required: true, uploaded: false },
        { name: "Application form (filled)", required: true, uploaded: false },
      ],
      notes: ["Worker needs to gather remaining documents"],
      createdAt: "2026-03-10",
    },
    {
      id: "trc-003", workerName: "Giorgi Beridze", nationality: "Georgian", employer: "MetalWorks Sp. z o.o.",
      permitType: "First TRC", voivodeship: "Slaskie", status: "Approved", fee: 440, paid: true,
      submittedDate: "2026-01-10", approvedDate: "2026-03-20", expiryDate: "2029-03-20", esspiActive: true,
      documents: [
        { name: "Passport copy", required: true, uploaded: true },
        { name: "Visa / stamp copy", required: true, uploaded: true },
        { name: "4 photos 35x45mm", required: true, uploaded: true },
        { name: "Proof of accommodation", required: true, uploaded: true },
        { name: "Work contract", required: true, uploaded: true },
        { name: "Health insurance", required: true, uploaded: true },
        { name: "Application form (filled)", required: true, uploaded: true },
      ],
      notes: ["TRC card issued", "Valid until 2029-03-20"],
      createdAt: "2025-12-15",
    },
    {
      id: "trc-004", workerName: "Mohammad Rahman", nationality: "Bangladeshi", employer: "BuildPol S.A.",
      permitType: "First TRC", voivodeship: "Wielkopolskie", status: "Submitted", fee: 440, paid: true,
      submittedDate: "2026-03-01", approvedDate: null, expiryDate: null, esspiActive: false,
      documents: [
        { name: "Passport copy", required: true, uploaded: true },
        { name: "Visa / stamp copy", required: true, uploaded: true },
        { name: "4 photos 35x45mm", required: true, uploaded: true },
        { name: "Proof of accommodation", required: true, uploaded: true },
        { name: "Work contract", required: true, uploaded: true },
        { name: "Health insurance", required: true, uploaded: true },
        { name: "Application form (filled)", required: true, uploaded: true },
      ],
      notes: ["All documents submitted", "Waiting for hearing date"],
      createdAt: "2026-02-10",
    },
    {
      id: "trc-005", workerName: "Dmytro Bondarenko", nationality: "Ukrainian", employer: "Apatris Sp. z o.o.",
      permitType: "TRC Renewal", voivodeship: "Mazowieckie", status: "Rejected", fee: 440, paid: true,
      submittedDate: "2026-01-05", approvedDate: null, expiryDate: null, esspiActive: false,
      documents: [
        { name: "Passport copy", required: true, uploaded: true },
        { name: "Current TRC copy", required: true, uploaded: true },
        { name: "4 photos 35x45mm", required: true, uploaded: true },
        { name: "Proof of accommodation", required: true, uploaded: true },
        { name: "Work contract", required: true, uploaded: true },
        { name: "Health insurance", required: true, uploaded: true },
        { name: "Application form (filled)", required: true, uploaded: true },
      ],
      notes: ["Rejected: incomplete employment history", "Preparing appeal"],
      createdAt: "2025-12-01",
    },
  ];
}
