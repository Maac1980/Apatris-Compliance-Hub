import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Shield, Save, ArrowLeft, User, Mail, Phone, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

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

export default function AdminSettings() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();

  const [admins, setAdmins] = useState<Admin[]>([]);
  const [formStates, setFormStates] = useState<Record<string, AdminFormState>>({});
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");

  useEffect(() => {
    loadAdmins();
  }, []);

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

  function updateField(id: string, field: "email" | "phone", value: string) {
    setFormStates((prev) => ({
      ...prev,
      [id]: { ...prev[id], [field]: value, saved: false, error: "" },
    }));
  }

  async function saveAdmin(admin: Admin) {
    const state = formStates[admin.id];
    if (!state) return;

    setFormStates((prev) => ({
      ...prev,
      [admin.id]: { ...prev[admin.id], saving: true, saved: false, error: "" },
    }));

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
      setFormStates((prev) => ({
        ...prev,
        [admin.id]: { ...prev[admin.id], saving: false, saved: true },
      }));
      setTimeout(() => {
        setFormStates((prev) => ({
          ...prev,
          [admin.id]: { ...prev[admin.id], saved: false },
        }));
      }, 3000);
    } catch (err) {
      setFormStates((prev) => ({
        ...prev,
        [admin.id]: {
          ...prev[admin.id],
          saving: false,
          error: err instanceof Error ? err.message : "Save failed",
        },
      }));
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col">

      {/* Header */}
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
            <h1 className="text-base font-bold tracking-widest uppercase text-white">
              Admin Settings
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right hidden md:block">
            <p className="text-sm font-bold text-white leading-tight">{user?.name}</p>
            <p className="text-xs text-red-500 font-mono">{user?.role}</p>
          </div>
          <button
            onClick={logout}
            className="p-2 text-gray-400 hover:text-white transition-colors"
            title="Log out"
          >
            <ArrowLeft className="w-5 h-5 rotate-180" />
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 p-6 lg:p-10 max-w-4xl mx-auto w-full">

        <div className="mb-8">
          <h2 className="text-2xl font-bold text-white tracking-tight">Administrator Profiles</h2>
          <p className="text-gray-400 text-sm mt-1">
            Update contact details for each administrator. Changes are saved permanently to the database.
          </p>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-24 gap-3 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="font-mono text-sm">Loading administrator profiles...</span>
          </div>
        )}

        {/* Fetch error */}
        {!loading && fetchError && (
          <div className="p-4 rounded-xl bg-red-900/30 border border-red-500/40 text-red-400 text-sm flex items-center gap-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            {fetchError}
          </div>
        )}

        {/* Admin cards */}
        {!loading && !fetchError && (
          <div className="space-y-6">
            {admins.map((admin) => {
              const state = formStates[admin.id];
              if (!state) return null;

              const initials = admin.fullName
                .split(" ")
                .map((n) => n[0])
                .join("")
                .toUpperCase()
                .slice(0, 2);

              return (
                <div
                  key={admin.id}
                  className="bg-slate-800/60 border border-slate-700 rounded-2xl p-6 lg:p-8"
                  style={{ boxShadow: "0 4px 24px rgba(0,0,0,0.2)" }}
                >
                  {/* Card header */}
                  <div className="flex items-center gap-4 mb-6">
                    <div
                      className="w-14 h-14 rounded-full bg-red-600/20 border-2 border-red-600/50 flex items-center justify-center flex-shrink-0"
                    >
                      <span className="text-lg font-bold text-red-400 font-mono">{initials}</span>
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white">{admin.fullName}</h3>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-red-900/40 border border-red-600/40 text-red-400 text-xs font-mono font-bold uppercase tracking-wider mt-1">
                        <Shield className="w-3 h-3" />
                        {admin.role}
                      </span>
                    </div>
                  </div>

                  {/* Form fields */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {/* Email */}
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-widest">
                        <Mail className="w-3.5 h-3.5" />
                        Email Address
                      </label>
                      <input
                        type="email"
                        value={state.email}
                        onChange={(e) => updateField(admin.id, "email", e.target.value)}
                        placeholder="email@example.com"
                        className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 text-white text-sm font-mono focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500/40 transition-all placeholder:text-gray-600"
                      />
                    </div>

                    {/* Phone */}
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-widest">
                        <Phone className="w-3.5 h-3.5" />
                        Phone Number
                      </label>
                      <input
                        type="tel"
                        value={state.phone}
                        onChange={(e) => updateField(admin.id, "phone", e.target.value)}
                        placeholder="+48 000 000 000"
                        className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 text-white text-sm font-mono focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500/40 transition-all placeholder:text-gray-600"
                      />
                    </div>
                  </div>

                  {/* Feedback messages */}
                  {state.error && (
                    <div className="mt-4 flex items-center gap-2 text-red-400 text-sm">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      {state.error}
                    </div>
                  )}
                  {state.saved && (
                    <div className="mt-4 flex items-center gap-2 text-green-400 text-sm">
                      <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                      Changes saved successfully.
                    </div>
                  )}

                  {/* Save button */}
                  <div className="mt-6 flex justify-end">
                    <button
                      onClick={() => saveAdmin(admin)}
                      disabled={state.saving}
                      className="flex items-center gap-2 px-6 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-red-900/50 disabled:cursor-not-allowed text-white font-bold text-sm uppercase tracking-widest rounded-lg transition-all shadow-lg shadow-red-900/30 hover:shadow-red-900/50"
                    >
                      {state.saving ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4" />
                          Save Changes
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
