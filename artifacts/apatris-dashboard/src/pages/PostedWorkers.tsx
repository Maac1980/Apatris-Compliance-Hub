import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Globe, Plus, Loader2, FileCheck, CalendarDays, AlertTriangle, User,
} from "lucide-react";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}
const BASE = import.meta.env.BASE_URL;

interface Posting {
  id: string;
  workerName: string;
  workerId: string;
  hostCountry: string;
  startDate: string;
  endDate: string;
  status: "active" | "upcoming" | "completed" | "expired";
}

interface A1Certificate {
  id: string;
  workerName: string;
  certificateNumber: string;
  issuedDate: string;
  expiryDate: string;
  hostCountry: string;
  status: "valid" | "expiring" | "expired";
}

type Tab = "postings" | "a1";

export default function PostedWorkers() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("postings");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ workerName: "", hostCountry: "DE", startDate: "", endDate: "" });

  const { data: postings = [], isLoading: loadingPostings } = useQuery<Posting[]>({
    queryKey: ["postings"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/postings`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to fetch postings");
      return res.json();
    },
  });

  const { data: certificates = [], isLoading: loadingCerts } = useQuery<A1Certificate[]>({
    queryKey: ["a1-certificates"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/a1-certificates`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to fetch certificates");
      return res.json();
    },
  });

  const createPosting = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}api/postings`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Failed to create posting");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["postings"] });
      toast({ title: "Posting Created", description: "New posting assignment recorded." });
      setShowForm(false);
      setForm({ workerName: "", hostCountry: "DE", startDate: "", endDate: "" });
    },
    onError: () => toast({ title: "Error", description: "Failed to create posting", variant: "destructive" }),
  });

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      active: "bg-green-900/50 text-green-300 border border-green-600/50",
      upcoming: "bg-blue-900/50 text-blue-300 border border-blue-600/50",
      completed: "bg-slate-800 text-slate-400 border border-slate-600/50",
      expired: "bg-red-900/50 text-red-300 border border-red-600/50",
      valid: "bg-green-900/50 text-green-300 border border-green-600/50",
      expiring: "bg-yellow-900/50 text-yellow-300 border border-yellow-500/50",
    };
    return map[status] ?? "bg-card text-muted-foreground border border-border";
  };

  const countries: Record<string, string> = { DE: "Germany", CZ: "Czech Republic", NL: "Netherlands", BE: "Belgium", FR: "France", AT: "Austria" };

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Globe className="w-6 h-6 text-primary" /> Posted Workers & A1 Certificates
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Track worker postings abroad and A1 certificate validity</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-card border border-border rounded-lg p-1">
          <button
            onClick={() => setTab("postings")}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === "postings" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Globe className="w-4 h-4" /> Posting Assignments
          </button>
          <button
            onClick={() => setTab("a1")}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === "a1" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <FileCheck className="w-4 h-4" /> A1 Certificates
          </button>
        </div>

        {tab === "postings" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold text-foreground">Posting Assignments</h2>
              <button
                onClick={() => setShowForm(!showForm)}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition"
              >
                <Plus className="w-4 h-4" /> New Posting
              </button>
            </div>

            {showForm && (
              <div className="bg-card border border-border rounded-lg p-4 space-y-3">
                <input
                  value={form.workerName}
                  onChange={(e) => setForm({ ...form, workerName: e.target.value })}
                  placeholder="Worker name"
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm"
                />
                <select
                  value={form.hostCountry}
                  onChange={(e) => setForm({ ...form, hostCountry: e.target.value })}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm"
                >
                  {Object.entries(countries).map(([code, name]) => (
                    <option key={code} value={code}>{name}</option>
                  ))}
                </select>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground">Start Date</label>
                    <input
                      type="date"
                      value={form.startDate}
                      onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">End Date</label>
                    <input
                      type="date"
                      value={form.endDate}
                      onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => createPosting.mutate()}
                    disabled={createPosting.isPending || !form.workerName.trim()}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-50"
                  >
                    {createPosting.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create Posting"}
                  </button>
                  <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-card border border-border text-foreground rounded-lg text-sm">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {loadingPostings ? (
              <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : postings.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">No posting assignments found.</div>
            ) : (
              <div className="bg-card border border-border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left px-4 py-3 text-muted-foreground font-medium">Worker</th>
                      <th className="text-left px-4 py-3 text-muted-foreground font-medium">Host Country</th>
                      <th className="text-left px-4 py-3 text-muted-foreground font-medium">Start</th>
                      <th className="text-left px-4 py-3 text-muted-foreground font-medium">End</th>
                      <th className="text-left px-4 py-3 text-muted-foreground font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {postings.map((p) => (
                      <tr key={p.id} className="border-b border-border hover:bg-card/50 transition">
                        <td className="px-4 py-3 text-foreground flex items-center gap-2"><User className="w-4 h-4 text-muted-foreground" /> {p.workerName}</td>
                        <td className="px-4 py-3 text-muted-foreground">{countries[p.hostCountry] ?? p.hostCountry}</td>
                        <td className="px-4 py-3 text-muted-foreground">{new Date(p.startDate).toLocaleDateString()}</td>
                        <td className="px-4 py-3 text-muted-foreground">{new Date(p.endDate).toLocaleDateString()}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-mono uppercase ${statusBadge(p.status)}`}>{p.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === "a1" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">A1 Certificates</h2>
            {loadingCerts ? (
              <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : certificates.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">No A1 certificates found.</div>
            ) : (
              <div className="space-y-3">
                {certificates.map((c) => (
                  <div key={c.id} className="bg-card border border-border rounded-lg p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <FileCheck className="w-5 h-5 text-muted-foreground" />
                      <div>
                        <p className="text-foreground font-medium">{c.workerName}</p>
                        <p className="text-muted-foreground text-xs mt-1">
                          {c.certificateNumber} | {countries[c.hostCountry] ?? c.hostCountry} | Expires: {new Date(c.expiryDate).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {c.status === "expiring" && <AlertTriangle className="w-4 h-4 text-yellow-400" />}
                      <span className={`px-2 py-0.5 rounded text-xs font-mono uppercase ${statusBadge(c.status)}`}>{c.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
