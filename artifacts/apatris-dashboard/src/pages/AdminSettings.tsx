import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}
import { Shield, Save, ArrowLeft, User, Mail, Phone, CheckCircle2, AlertCircle, Loader2, Bell, ClipboardList, Clock, Users, Trash2, Plus, Building2, Lock, Wifi, WifiOff, KeyRound, Eye, EyeOff, RefreshCcw } from "lucide-react";
import { format, parseISO } from "date-fns";

interface Admin {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  role: string;
}

interface AdminFormState {
  email: string;
  phone: string;
  saving: boolean;
  saved: boolean;
  error: string;
}

interface NotifEntry {
  id: string;
  timestamp: string;
  workerName: string;
  documentType: string;
  expiryDate: string;
  daysUntilExpiry: number;
  status: string;
  recipients: string[];
  sent: boolean;
  error?: string;
}

interface AuditEntry {
  id: string;
  timestamp: string;
  actor: string;
  actorEmail: string;
  action: string;
  workerId: string;
  workerName: string;
  note?: string;
}

interface SiteCoordinator {
  id: string;
  name: string;
  email: string;
  assignedSite: string;
}

type Tab = "profiles" | "notifications" | "audit" | "site-coordinators";

export default function AdminSettings() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<Tab>("profiles");

  const [admins, setAdmins] = useState<Admin[]>([]);
  const [formStates, setFormStates] = useState<Record<string, AdminFormState>>({});
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");

  const [notifLog, setNotifLog] = useState<NotifEntry[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);

  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  // Site Coordinators
  const [coordinators, setCoordinators] = useState<SiteCoordinator[]>([]);
  const [coordLoading, setCoordLoading] = useState(false);
  const [coordError, setCoordError] = useState("");
  const [addCoordForm, setAddCoordForm] = useState({ name: "", email: "", assignedSite: "", password: "" });
  const [addCoordSaving, setAddCoordSaving] = useState(false);
  const [addCoordError, setAddCoordError] = useState("");
  const [addCoordSuccess, setAddCoordSuccess] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Per-coordinator password change: { [id]: { open, newPass, showPass, saving, saved, error } }
  const [coordPassState, setCoordPassState] = useState<Record<string, { open: boolean; newPass: string; showPass: boolean; saving: boolean; saved: boolean; error: string }>>({});

  // System status (SMTP + admin passwords)
  const [sysStatus, setSysStatus] = useState<{
    smtp: { configured: boolean; fields: Record<string, string> };
    adminPasswords: { manish: boolean; akshay: boolean; allSet: boolean };
  } | null>(null);

  useEffect(() => { loadAdmins(); loadSysStatus(); }, []);

  useEffect(() => {
    if (activeTab === "notifications") loadNotifLog();
    if (activeTab === "audit") loadAuditLog();
    if (activeTab === "site-coordinators" && coordinators.length === 0) loadCoordinators();
  }, [activeTab]);

  async function loadAdmins() {
    setLoading(true);
    setFetchError("");
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/admins`, { headers: authHeaders() });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as { admins: Admin[] };
      setAdmins(data.admins);
      const states: Record<string, AdminFormState> = {};
      for (const a of data.admins) {
        states[a.id] = { email: a.email, phone: a.phone, saving: false, saved: false, error: "" };
      }
      setFormStates(states);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Failed to load admin profiles");
    } finally {
      setLoading(false);
    }
  }

  async function loadNotifLog() {
    setNotifLoading(true);
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/notifications/history`, { headers: authHeaders() });
      if (!res.ok) { setNotifLog([]); return; }
      const data = await res.json();
      setNotifLog(Array.isArray(data.entries) ? data.entries : []);
    } catch (err) { console.error("[AdminSettings] Failed to load notification log:", err); setNotifLog([]); }
    finally { setNotifLoading(false); }
  }

  async function loadAuditLog() {
    setAuditLoading(true);
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/audit-log`, { headers: authHeaders() });
      if (!res.ok) { setAuditLog([]); return; }
      const data = await res.json();
      setAuditLog(Array.isArray(data.entries) ? data.entries : []);
    } catch (err) { console.error("[AdminSettings] Failed to load audit log:", err); setAuditLog([]); }
    finally { setAuditLoading(false); }
  }

  async function loadSysStatus() {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/settings/status`, { headers: authHeaders() });
      if (res.ok) setSysStatus(await res.json());
    } catch (err) { console.error("[AdminSettings] Failed to load system status:", err); }
  }

  async function loadCoordinators() {
    setCoordLoading(true);
    setCoordError("");
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/site-coordinators`, { headers: authHeaders() });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as { coordinators: SiteCoordinator[] };
      setCoordinators(data.coordinators);
    } catch (err) {
      setCoordError(err instanceof Error ? err.message : "Failed to load coordinators");
    } finally {
      setCoordLoading(false);
    }
  }

  function toggleCoordPass(id: string) {
    setCoordPassState((prev) => ({
      ...prev,
      [id]: prev[id]?.open
        ? { open: false, newPass: "", showPass: false, saving: false, saved: false, error: "" }
        : { open: true, newPass: "", showPass: false, saving: false, saved: false, error: "" },
    }));
  }

  async function saveCoordPassword(id: string) {
    const s = coordPassState[id];
    if (!s?.newPass?.trim()) {
      setCoordPassState((prev) => ({ ...prev, [id]: { ...prev[id], error: "Password cannot be empty." } }));
      return;
    }
    setCoordPassState((prev) => ({ ...prev, [id]: { ...prev[id], saving: true, error: "" } }));
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/site-coordinators/${id}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ password: s.newPass }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(d.error || "Save failed");
      }
      setCoordPassState((prev) => ({ ...prev, [id]: { open: true, newPass: "", showPass: false, saving: false, saved: true, error: "" } }));
      setTimeout(() => setCoordPassState((prev) => ({ ...prev, [id]: { ...prev[id], saved: false, open: false } })), 2500);
    } catch (err) {
      setCoordPassState((prev) => ({ ...prev, [id]: { ...prev[id], saving: false, error: err instanceof Error ? err.message : "Save failed" } }));
    }
  }

  async function addCoordinator() {
    if (!addCoordForm.name.trim() || !addCoordForm.email.trim() || !addCoordForm.assignedSite.trim() || !addCoordForm.password.trim()) {
      setAddCoordError("All fields are required.");
      return;
    }
    setAddCoordSaving(true);
    setAddCoordError("");
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/site-coordinators`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(addCoordForm),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(d.error || "Failed to add coordinator");
      }
      setAddCoordForm({ name: "", email: "", assignedSite: "", password: "" });
      setAddCoordSuccess(true);
      setTimeout(() => setAddCoordSuccess(false), 3000);
      await loadCoordinators();
    } catch (err) {
      setAddCoordError(err instanceof Error ? err.message : "Failed to add coordinator");
    } finally {
      setAddCoordSaving(false);
    }
  }

  async function deleteCoordinator(id: string) {
    if (!confirm("Remove this site coordinator? They will no longer be able to log in.")) return;
    setDeletingId(id);
    try {
      await fetch(`${import.meta.env.BASE_URL}api/site-coordinators/${id}`, { method: "DELETE", headers: authHeaders() });
      await loadCoordinators();
    } catch (err) {
      console.error("[AdminSettings] Failed to delete coordinator:", err);
      toast({ title: "Error", description: "Failed to delete coordinator. Please try again.", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  }

  function updateField(id: string, field: "email" | "phone", value: string) {
    setFormStates((prev) => ({
      ...prev,
      [id]: { ...prev[id], [field]: value, saved: false, error: "" },
    }));
  }

  async function saveAdmin(admin: Admin) {
    const state = formStates[admin.id];
    if (!state) return;
    setFormStates((prev) => ({ ...prev, [admin.id]: { ...prev[admin.id], saving: true, saved: false, error: "" } }));
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/admins/${admin.id}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ email: state.email, phone: state.phone }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(d.error || "Save failed");
      }
      setFormStates((prev) => ({ ...prev, [admin.id]: { ...prev[admin.id], saving: false, saved: true } }));
      setTimeout(() => {
        setFormStates((prev) => ({ ...prev, [admin.id]: { ...prev[admin.id], saved: false } }));
      }, 3000);
    } catch (err) {
      setFormStates((prev) => ({
        ...prev,
        [admin.id]: { ...prev[admin.id], saving: false, error: err instanceof Error ? err.message : "Save failed" },
      }));
    }
  }

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "profiles", label: "Admin Profiles", icon: User },
    { id: "notifications", label: "Notification History", icon: Bell },
    { id: "audit", label: "Audit Log", icon: ClipboardList },
    { id: "site-coordinators", label: "Site Coordinators", icon: Users },
  ];

  return (
    <div className="app-shell-page h-screen bg-slate-900 text-white flex flex-col overflow-hidden">
      <header
        className="h-16 border-b border-slate-700 bg-slate-900/95 backdrop-blur-xl sticky top-0 z-30 px-6 flex items-center justify-between"
        style={{ boxShadow: "0 1px 0 rgba(196,30,24,0.08), 0 4px 20px rgba(0,0,0,0.3)" }}
      >
        <div className="flex items-center gap-4">
          <button
            onClick={() => setLocation("/")}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm font-mono"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </button>
          <div className="w-px h-6 bg-white/10" />
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-red-500" />
            <h1 className="text-base font-bold tracking-widest uppercase text-white">Admin Settings</h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right hidden md:block">
            <p className="text-sm font-bold text-white leading-tight">{user?.name}</p>
            <p className="text-xs text-red-500 font-mono">{user?.role}</p>
          </div>
          <button onClick={logout} className="p-2 text-gray-400 hover:text-white transition-colors" title="Log out">
            <ArrowLeft className="w-5 h-5 rotate-180" />
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6 lg:p-10 max-w-5xl mx-auto w-full">
        {/* Tabs */}
        <div className="flex gap-1 mb-8 bg-slate-800/50 p-1 rounded-xl border border-slate-700 w-fit">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                activeTab === id
                  ? "bg-red-600 text-white shadow-lg"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {/* Admin Profiles Tab */}
        {activeTab === "profiles" && (
          <>
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-white tracking-tight">Administrator Profiles</h2>
              <p className="text-gray-400 text-sm mt-1">Update contact details for each administrator. Changes are saved permanently to the database.</p>
            </div>

            {/* System Status Panel */}
            {sysStatus && (
              <div className="mb-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* SMTP Status */}
                <div className={`rounded-xl border p-5 flex items-start gap-4 ${sysStatus.smtp.configured ? "border-green-500/30 bg-green-900/10" : "border-red-500/30 bg-red-900/10"}`}>
                  <div className={`mt-0.5 flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${sysStatus.smtp.configured ? "bg-green-600/20 text-green-400" : "bg-red-600/20 text-red-400"}`}>
                    {sysStatus.smtp.configured ? <Wifi className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-bold ${sysStatus.smtp.configured ? "text-green-400" : "text-red-400"}`}>
                      Email (SMTP) — {sysStatus.smtp.configured ? "Configured" : "Not Configured"}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5 mb-2">Alert emails require SMTP credentials.</p>
                    <div className="space-y-1">
                      {Object.entries(sysStatus.smtp.fields).map(([key, val]) => (
                        <div key={key} className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${val === "set" ? "bg-green-500" : "bg-red-500"}`} />
                          <span className="text-[10px] font-mono text-gray-400">{key}</span>
                          <span className={`text-[10px] font-bold ml-auto ${val === "set" ? "text-green-400" : "text-red-400"}`}>{val === "set" ? "✓ set" : "missing"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Admin Password Status */}
                <div className={`rounded-xl border p-5 flex items-start gap-4 ${sysStatus.adminPasswords.allSet ? "border-green-500/30 bg-green-900/10" : "border-yellow-500/30 bg-yellow-900/10"}`}>
                  <div className={`mt-0.5 flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${sysStatus.adminPasswords.allSet ? "bg-green-600/20 text-green-400" : "bg-yellow-600/20 text-yellow-400"}`}>
                    <KeyRound className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-bold ${sysStatus.adminPasswords.allSet ? "text-green-400" : "text-yellow-400"}`}>
                      Admin Passwords — {sysStatus.adminPasswords.allSet ? "All Set" : "Incomplete"}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5 mb-2">Passwords are stored as environment secrets.</p>
                    <div className="space-y-1">
                      {[["APATRIS_PASS_MANISH", sysStatus.adminPasswords.manish], ["APATRIS_PASS_AKSHAY", sysStatus.adminPasswords.akshay]].map(([key, set]) => (
                        <div key={String(key)} className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${set ? "bg-green-500" : "bg-yellow-500"}`} />
                          <span className="text-[10px] font-mono text-gray-400">{String(key)}</span>
                          <span className={`text-[10px] font-bold ml-auto ${set ? "text-green-400" : "text-yellow-400"}`}>{set ? "✓ set" : "not set"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {loading && (
              <div className="flex items-center justify-center py-24 gap-3 text-gray-400">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="font-mono text-sm">Loading administrator profiles...</span>
              </div>
            )}
            {!loading && fetchError && (
              <div className="p-4 rounded-xl bg-red-900/30 border border-red-500/40 text-red-400 text-sm flex items-center gap-3">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                {fetchError}
              </div>
            )}
            {!loading && !fetchError && (
              <div className="space-y-6">
                {admins.map((admin) => {
                  const state = formStates[admin.id];
                  if (!state) return null;
                  const initials = admin.fullName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
                  return (
                    <div key={admin.id} className="bg-slate-800/60 border border-slate-700 rounded-2xl p-6 lg:p-8" style={{ boxShadow: "0 4px 24px rgba(0,0,0,0.2)" }}>
                      <div className="flex items-center gap-4 mb-6">
                        <div className="w-14 h-14 rounded-full bg-red-600/20 border-2 border-red-600/50 flex items-center justify-center flex-shrink-0">
                          <span className="text-lg font-bold text-red-400 font-mono">{initials}</span>
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-white">{admin.fullName}</h3>
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-red-900/40 border border-red-600/40 text-red-400 text-xs font-mono font-bold uppercase tracking-wider mt-1">
                            <Shield className="w-3 h-3" />{admin.role}
                          </span>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div className="space-y-2">
                          <label className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-widest">
                            <Mail className="w-3.5 h-3.5" /> Email Address
                          </label>
                          <input type="email" value={state.email} onChange={(e) => updateField(admin.id, "email", e.target.value)} placeholder="email@example.com"
                            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 text-white text-sm font-mono focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500/40 transition-all placeholder:text-gray-600" />
                        </div>
                        <div className="space-y-2">
                          <label className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-widest">
                            <Phone className="w-3.5 h-3.5" /> Phone Number
                          </label>
                          <input type="tel" value={state.phone} onChange={(e) => updateField(admin.id, "phone", e.target.value)} placeholder="+48 000 000 000"
                            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 text-white text-sm font-mono focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500/40 transition-all placeholder:text-gray-600" />
                        </div>
                      </div>
                      {state.error && (
                        <div className="mt-4 flex items-center gap-2 text-red-400 text-sm">
                          <AlertCircle className="w-4 h-4 flex-shrink-0" />{state.error}
                        </div>
                      )}
                      {state.saved && (
                        <div className="mt-4 flex items-center gap-2 text-green-400 text-sm">
                          <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> Changes saved successfully.
                        </div>
                      )}
                      <div className="mt-6 flex justify-end">
                        <button onClick={() => saveAdmin(admin)} disabled={state.saving}
                          className="flex items-center gap-2 px-6 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-red-900/50 disabled:cursor-not-allowed text-white font-bold text-sm uppercase tracking-widest rounded-lg transition-all shadow-lg shadow-red-900/30">
                          {state.saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : <><Save className="w-4 h-4" /> Save Changes</>}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Notification History Tab */}
        {activeTab === "notifications" && (
          <>
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-white tracking-tight">Notification History</h2>
                <p className="text-gray-400 text-sm mt-1">Record of every compliance alert email sent by the system.</p>
              </div>
              <button onClick={loadNotifLog} className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-gray-400 hover:text-white border border-slate-600 hover:border-slate-400 rounded-lg transition-colors">
                <Loader2 className={`w-3.5 h-3.5 ${notifLoading ? "animate-spin" : ""}`} /> Refresh
              </button>
            </div>
            {notifLoading ? (
              <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
            ) : notifLog.length === 0 ? (
              <div className="text-center py-16 text-gray-500">
                <Bell className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No notifications sent yet. Alerts fire when documents reach RED or EXPIRED status.</p>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-700 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-800 text-gray-400 text-xs font-bold uppercase tracking-widest">
                    <tr>
                      <th className="px-4 py-3 text-left">Time</th>
                      <th className="px-4 py-3 text-left">Worker</th>
                      <th className="px-4 py-3 text-left">Document</th>
                      <th className="px-4 py-3 text-left">Expiry</th>
                      <th className="px-4 py-3 text-left">Status</th>
                      <th className="px-4 py-3 text-left">Sent</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700">
                    {notifLog.map((e) => (
                      <tr key={e.id} className="hover:bg-slate-800/50 transition-colors">
                        <td className="px-4 py-3 text-gray-400 font-mono text-xs whitespace-nowrap">
                          <div className="flex items-center gap-1"><Clock className="w-3 h-3" />{format(parseISO(e.timestamp), "MMM d, HH:mm")}</div>
                        </td>
                        <td className="px-4 py-3 text-white font-medium">{e.workerName}</td>
                        <td className="px-4 py-3 text-gray-300">{e.documentType}</td>
                        <td className="px-4 py-3 text-red-400 font-mono text-xs">{e.expiryDate ? format(parseISO(e.expiryDate), "MMM d, yyyy") : "—"}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${e.status === "EXPIRED" ? "bg-red-900/50 text-red-300" : "bg-orange-900/50 text-orange-300"}`}>
                            {e.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {e.sent ? (
                            <span className="flex items-center gap-1 text-green-400 text-xs"><CheckCircle2 className="w-3.5 h-3.5" /> Sent</span>
                          ) : (
                            <span className="flex items-center gap-1 text-red-400 text-xs"><AlertCircle className="w-3.5 h-3.5" /> Failed</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* Audit Log Tab */}
        {activeTab === "audit" && (
          <>
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-white tracking-tight">Activity Audit Log</h2>
                <p className="text-gray-400 text-sm mt-1">Track all worker record changes — who did what and when.</p>
              </div>
              <button onClick={loadAuditLog} className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-gray-400 hover:text-white border border-slate-600 hover:border-slate-400 rounded-lg transition-colors">
                <Loader2 className={`w-3.5 h-3.5 ${auditLoading ? "animate-spin" : ""}`} /> Refresh
              </button>
            </div>
            {auditLoading ? (
              <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
            ) : auditLog.length === 0 ? (
              <div className="text-center py-16 text-gray-500">
                <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No activity recorded yet. Changes to worker records will appear here.</p>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-700 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-800 text-gray-400 text-xs font-bold uppercase tracking-widest">
                    <tr>
                      <th className="px-4 py-3 text-left">Time</th>
                      <th className="px-4 py-3 text-left">Actor</th>
                      <th className="px-4 py-3 text-left">Action</th>
                      <th className="px-4 py-3 text-left">Worker</th>
                      <th className="px-4 py-3 text-left">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700">
                    {auditLog.map((e) => (
                      <tr key={e.id} className="hover:bg-slate-800/50 transition-colors">
                        <td className="px-4 py-3 text-gray-400 font-mono text-xs whitespace-nowrap">
                          <div className="flex items-center gap-1"><Clock className="w-3 h-3" />{format(parseISO(e.timestamp), "MMM d, HH:mm")}</div>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-white font-medium text-xs">{e.actor}</p>
                          <p className="text-gray-500 text-[10px]">{e.actorEmail}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-900/40 text-blue-300">
                            {e.action.replace("_", " ")}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-white">{e.workerName}</td>
                        <td className="px-4 py-3 text-gray-400 text-xs truncate max-w-[200px]">{e.note || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
        {/* Site Coordinators Tab */}
        {activeTab === "site-coordinators" && (
          <>
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-white tracking-tight">Site Coordinators</h2>
              <p className="text-gray-400 text-sm mt-1">Manage site-level coordinator accounts. Each coordinator can log in and view workers assigned to their site only.</p>
            </div>

            {/* Add coordinator form */}
            <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-6 mb-8">
              <h3 className="text-sm font-bold uppercase tracking-widest text-gray-300 mb-4 flex items-center gap-2"><Plus className="w-4 h-4 text-red-400" /> Add New Coordinator</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Full Name</label>
                  <input
                    type="text"
                    placeholder="Jan Kowalski"
                    value={addCoordForm.name}
                    onChange={(e) => setAddCoordForm((p) => ({ ...p, name: e.target.value }))}
                    className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-red-500/60 placeholder:text-gray-600"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                    <input
                      type="email"
                      placeholder="coordinator@example.com"
                      value={addCoordForm.email}
                      onChange={(e) => setAddCoordForm((p) => ({ ...p, email: e.target.value }))}
                      className="w-full pl-9 bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-red-500/60 placeholder:text-gray-600"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Assigned Site</label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="e.g. Site A / Client Name"
                      value={addCoordForm.assignedSite}
                      onChange={(e) => setAddCoordForm((p) => ({ ...p, assignedSite: e.target.value }))}
                      className="w-full pl-9 bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-red-500/60 placeholder:text-gray-600"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                    <input
                      type="password"
                      placeholder="Set login password"
                      value={addCoordForm.password}
                      onChange={(e) => setAddCoordForm((p) => ({ ...p, password: e.target.value }))}
                      className="w-full pl-9 bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-red-500/60 placeholder:text-gray-600"
                    />
                  </div>
                </div>
              </div>
              {addCoordError && (
                <p className="text-red-400 text-xs mt-3 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5" />{addCoordError}</p>
              )}
              {addCoordSuccess && (
                <p className="text-green-400 text-xs mt-3 flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" />Coordinator added successfully.</p>
              )}
              <button
                onClick={addCoordinator}
                disabled={addCoordSaving}
                className="mt-4 flex items-center gap-2 px-5 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-bold uppercase tracking-wide transition-colors border border-red-400"
              >
                {addCoordSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Add Coordinator
              </button>
            </div>

            {/* Coordinator list */}
            {coordLoading ? (
              <div className="flex items-center gap-3 text-gray-400 py-8">
                <Loader2 className="w-5 h-5 animate-spin" /><span className="font-mono text-sm">Loading coordinators...</span>
              </div>
            ) : coordError ? (
              <div className="p-4 rounded-xl bg-red-900/30 border border-red-500/40 text-red-400 text-sm flex items-center gap-3">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />{coordError}
              </div>
            ) : coordinators.length === 0 ? (
              <div className="text-center py-12 text-gray-500 font-mono text-sm">No site coordinators configured yet.</div>
            ) : (
              <div className="rounded-xl border border-slate-700 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-800 border-b border-slate-700">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-widest text-gray-400">Name</th>
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-widest text-gray-400">Email</th>
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-widest text-gray-400">Assigned Site</th>
                      <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-widest text-gray-400">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700">
                    {coordinators.map((c) => {
                      const ps = coordPassState[c.id];
                      return (
                        <React.Fragment key={c.id}>
                          <tr className="hover:bg-slate-800/50 transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-red-600/20 border border-red-500/30 flex items-center justify-center text-red-400 text-xs font-bold">
                                  {c.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()}
                                </div>
                                <span className="text-white font-medium">{c.name}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-gray-300 font-mono text-xs">{c.email}</td>
                            <td className="px-4 py-3">
                              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-600/20 border border-red-500/30 text-red-300">{c.assignedSite}</span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => toggleCoordPass(c.id)}
                                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold uppercase tracking-wide transition-colors ${ps?.open ? "bg-slate-600 border-slate-400 text-white" : "bg-slate-700/50 border-slate-600 text-gray-300 hover:bg-slate-700 hover:text-white"}`}
                                >
                                  <Lock className="w-3.5 h-3.5" />
                                  Password
                                </button>
                                <button
                                  onClick={() => deleteCoordinator(c.id)}
                                  disabled={deletingId === c.id}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-900/30 hover:bg-red-900/60 border border-red-500/30 text-red-400 hover:text-red-300 text-xs font-bold uppercase tracking-wide transition-colors disabled:opacity-50"
                                >
                                  {deletingId === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                  Remove
                                </button>
                              </div>
                            </td>
                          </tr>
                          {ps?.open && (
                            <tr className="bg-slate-800/80 border-t border-slate-600">
                              <td colSpan={4} className="px-4 py-4">
                                <div className="flex items-center gap-3 flex-wrap">
                                  <span className="text-xs font-bold text-gray-400 uppercase tracking-widest shrink-0">New Password for {c.name}</span>
                                  <div className="relative flex-1 min-w-[180px]">
                                    <input
                                      type={ps.showPass ? "text" : "password"}
                                      placeholder="Enter new password"
                                      value={ps.newPass}
                                      onChange={(e) => setCoordPassState((prev) => ({ ...prev, [c.id]: { ...prev[c.id], newPass: e.target.value, error: "" } }))}
                                      className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 pr-9 text-sm font-mono focus:outline-none focus:border-red-500/60 placeholder:text-gray-600"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => setCoordPassState((prev) => ({ ...prev, [c.id]: { ...prev[c.id], showPass: !prev[c.id].showPass } }))}
                                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
                                    >
                                      {ps.showPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                    </button>
                                  </div>
                                  <button
                                    onClick={() => saveCoordPassword(c.id)}
                                    disabled={ps.saving || ps.saved}
                                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white text-xs font-bold uppercase tracking-wide transition-colors border border-red-400 shrink-0"
                                  >
                                    {ps.saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : ps.saved ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                                    {ps.saved ? "Saved!" : "Save"}
                                  </button>
                                  {ps.error && <span className="text-red-400 text-xs flex items-center gap-1"><AlertCircle className="w-3 h-3" />{ps.error}</span>}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
