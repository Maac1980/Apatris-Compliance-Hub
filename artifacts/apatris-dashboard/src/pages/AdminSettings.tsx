import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Shield, Save, ArrowLeft, User, Mail, Phone, CheckCircle2, AlertCircle, Loader2, Bell, ClipboardList, Clock } from "lucide-react";
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

type Tab = "profiles" | "notifications" | "audit";

export default function AdminSettings() {
  const { user, logout } = useAuth();
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

  useEffect(() => { loadAdmins(); }, []);

  useEffect(() => {
    if (activeTab === "notifications" && notifLog.length === 0) loadNotifLog();
    if (activeTab === "audit" && auditLog.length === 0) loadAuditLog();
  }, [activeTab]);

  async function loadAdmins() {
    setLoading(true);
    setFetchError("");
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/admins`);
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
      const res = await fetch(`${import.meta.env.BASE_URL}api/notifications/history`);
      const data = await res.json() as { entries: NotifEntry[] };
      setNotifLog(data.entries);
    } catch { setNotifLog([]); }
    finally { setNotifLoading(false); }
  }

  async function loadAuditLog() {
    setAuditLoading(true);
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/audit-log`);
      const data = await res.json() as { entries: AuditEntry[] };
      setAuditLog(data.entries);
    } catch { setAuditLog([]); }
    finally { setAuditLoading(false); }
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
        headers: { "Content-Type": "application/json" },
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
  ];

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col">
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

      <main className="flex-1 p-6 lg:p-10 max-w-5xl mx-auto w-full">
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
      </main>
    </div>
  );
}
