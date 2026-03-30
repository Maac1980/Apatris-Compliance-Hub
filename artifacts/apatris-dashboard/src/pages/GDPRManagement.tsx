import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Shield, Download, Plus, Loader2, CheckCircle2, Clock, XCircle, User,
} from "lucide-react";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}
const BASE = import.meta.env.BASE_URL;

interface ConsentRecord {
  id: string;
  workerName: string;
  workerId: string;
  consentDate: string;
  purpose: string;
  status: "active" | "withdrawn" | "expired";
}

interface DataRequest {
  id: string;
  workerName: string;
  requestType: "access" | "erasure" | "portability" | "rectification";
  requestDate: string;
  status: "pending" | "completed" | "rejected";
}

type Tab = "consents" | "requests" | "export";

export default function GDPRManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("consents");
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formPurpose, setFormPurpose] = useState("data_processing");
  const [exportWorkerId, setExportWorkerId] = useState("");

  const { data: consents = [], isLoading: loadingConsents } = useQuery<ConsentRecord[]>({
    queryKey: ["gdpr-consents"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/gdpr/consents`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to fetch consents");
      return res.json();
    },
  });

  const { data: requests = [], isLoading: loadingRequests } = useQuery<DataRequest[]>({
    queryKey: ["gdpr-requests"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/gdpr/requests`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to fetch requests");
      return res.json();
    },
  });

  const addConsent = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}api/gdpr/consents`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ workerName: formName, purpose: formPurpose }),
      });
      if (!res.ok) throw new Error("Failed to add consent");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gdpr-consents"] });
      toast({ title: "Consent Recorded", description: "GDPR consent has been saved." });
      setShowForm(false);
      setFormName("");
    },
    onError: () => toast({ title: "Error", description: "Failed to record consent", variant: "destructive" }),
  });

  const handleExport = async () => {
    if (!exportWorkerId.trim()) {
      toast({ title: "Error", description: "Please enter a worker ID", variant: "destructive" });
      return;
    }
    try {
      const res = await fetch(`${BASE}api/gdpr/export/${exportWorkerId}`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Export failed");
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `gdpr-export-${exportWorkerId}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Export Complete", description: "Worker data exported as JSON." });
    } catch {
      toast({ title: "Error", description: "Failed to export worker data", variant: "destructive" });
    }
  };

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      active: "bg-green-900/50 text-green-300 border border-green-600/50",
      withdrawn: "bg-red-900/50 text-red-300 border border-red-600/50",
      expired: "bg-yellow-900/50 text-yellow-300 border border-yellow-500/50",
      pending: "bg-yellow-900/50 text-yellow-300 border border-yellow-500/50",
      completed: "bg-green-900/50 text-green-300 border border-green-600/50",
      rejected: "bg-red-900/50 text-red-300 border border-red-600/50",
    };
    return map[status] ?? "bg-card text-muted-foreground border border-border";
  };

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "consents", label: "Consent Records", icon: <Shield className="w-4 h-4" /> },
    { key: "requests", label: "Data Requests", icon: <Clock className="w-4 h-4" /> },
    { key: "export", label: "Export", icon: <Download className="w-4 h-4" /> },
  ];

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Shield className="w-6 h-6 text-primary" /> GDPR Management
            </h1>
            <p className="text-muted-foreground text-sm mt-1">Data protection, consent tracking, and DSAR management</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-card border border-border rounded-lg p-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                tab === t.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-card"
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Consent Records */}
        {tab === "consents" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold text-foreground">Consent Records</h2>
              <button
                onClick={() => setShowForm(!showForm)}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition"
              >
                <Plus className="w-4 h-4" /> Record Consent
              </button>
            </div>

            {showForm && (
              <div className="bg-card border border-border rounded-lg p-4 space-y-3">
                <input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Worker name"
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm"
                />
                <select
                  value={formPurpose}
                  onChange={(e) => setFormPurpose(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm"
                >
                  <option value="data_processing">Data Processing</option>
                  <option value="marketing">Marketing Communications</option>
                  <option value="third_party">Third Party Sharing</option>
                  <option value="profiling">Profiling & Analytics</option>
                </select>
                <div className="flex gap-2">
                  <button
                    onClick={() => addConsent.mutate()}
                    disabled={addConsent.isPending || !formName.trim()}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-50"
                  >
                    {addConsent.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Consent"}
                  </button>
                  <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-card border border-border text-foreground rounded-lg text-sm">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {loadingConsents ? (
              <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : consents.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">No consent records found.</div>
            ) : (
              <div className="bg-card border border-border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-card">
                      <th className="text-left px-4 py-3 text-muted-foreground font-medium">Worker</th>
                      <th className="text-left px-4 py-3 text-muted-foreground font-medium">Purpose</th>
                      <th className="text-left px-4 py-3 text-muted-foreground font-medium">Date</th>
                      <th className="text-left px-4 py-3 text-muted-foreground font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {consents.map((c) => (
                      <tr key={c.id} className="border-b border-border hover:bg-card/50 transition">
                        <td className="px-4 py-3 text-foreground flex items-center gap-2">
                          <User className="w-4 h-4 text-muted-foreground" /> {c.workerName}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground capitalize">{c.purpose.replace(/_/g, " ")}</td>
                        <td className="px-4 py-3 text-muted-foreground">{new Date(c.consentDate).toLocaleDateString()}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-mono uppercase ${statusBadge(c.status)}`}>{c.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Data Requests */}
        {tab === "requests" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Data Subject Access Requests</h2>
            {loadingRequests ? (
              <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : requests.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">No data requests found.</div>
            ) : (
              <div className="space-y-3">
                {requests.map((r) => (
                  <div key={r.id} className="bg-card border border-border rounded-lg p-4 flex items-center justify-between">
                    <div>
                      <p className="text-foreground font-medium">{r.workerName}</p>
                      <p className="text-muted-foreground text-xs mt-1">
                        Type: <span className="capitalize">{r.requestType}</span> | Submitted: {new Date(r.requestDate).toLocaleDateString()}
                      </p>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-xs font-mono uppercase ${statusBadge(r.status)}`}>{r.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Export */}
        {tab === "export" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Export Worker Data (GDPR Art. 20)</h2>
            <div className="bg-card border border-border rounded-lg p-6 space-y-4 max-w-md">
              <p className="text-muted-foreground text-sm">
                Export all personal data for a specific worker in JSON format, compliant with the right to data portability.
              </p>
              <input
                value={exportWorkerId}
                onChange={(e) => setExportWorkerId(e.target.value)}
                placeholder="Enter worker ID"
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm"
              />
              <button
                onClick={handleExport}
                disabled={!exportWorkerId.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-50 hover:opacity-90 transition"
              >
                <Download className="w-4 h-4" /> Download JSON
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
