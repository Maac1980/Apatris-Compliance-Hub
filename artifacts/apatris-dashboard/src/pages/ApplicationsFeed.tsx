import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  UserPlus, Loader2, Mail, Phone, Globe, Calendar, ArrowRight, Eye,
} from "lucide-react";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}
const BASE = import.meta.env.BASE_URL;

interface Application {
  id: string;
  name: string;
  email: string;
  phone: string;
  nationality: string;
  jobApplied: string;
  appliedDate: string;
  status: "new" | "reviewed" | "contacted" | "screening";
}

export default function ApplicationsFeed() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"all" | "new" | "reviewed" | "contacted">("all");

  const { data: applications = [], isLoading } = useQuery<Application[]>({
    queryKey: ["applications"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/applications`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to fetch applications");
      return res.json();
    },
  });

  const moveToScreening = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${BASE}api/applications/${id}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ status: "screening" }),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      toast({ title: "Moved to Screening", description: "Application moved to screening pipeline." });
    },
    onError: () => toast({ title: "Error", description: "Failed to update application", variant: "destructive" }),
  });

  const filtered = filter === "all" ? applications : applications.filter((a) => a.status === filter);
  const todayCount = applications.filter((a) => {
    const d = new Date(a.appliedDate);
    const today = new Date();
    return d.toDateString() === today.toDateString();
  }).length;

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      new: "bg-blue-900/50 text-blue-300 border border-blue-600/50",
      reviewed: "bg-yellow-900/50 text-yellow-300 border border-yellow-500/50",
      contacted: "bg-green-900/50 text-green-300 border border-green-600/50",
      screening: "bg-purple-900/50 text-purple-300 border border-purple-600/50",
    };
    return map[status] ?? "bg-card text-muted-foreground border border-border";
  };

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <UserPlus className="w-6 h-6 text-primary" /> Applications Feed
            </h1>
            <p className="text-muted-foreground text-sm mt-1">New worker applications from the /apply form</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="px-3 py-1.5 rounded-lg text-sm font-medium bg-card border border-border text-foreground">
              Total: <span className="font-bold">{applications.length}</span>
            </span>
            <span className="px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-900/50 text-blue-300 border border-blue-600/50">
              Today: <span className="font-bold">{todayCount}</span>
            </span>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          {(["all", "new", "reviewed", "contacted"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors capitalize ${
                filter === f
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-border hover:text-foreground"
              }`}
            >
              {f} {f !== "all" && `(${applications.filter((a) => a.status === f).length})`}
            </button>
          ))}
        </div>

        {/* Applications List */}
        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">No applications found.</div>
        ) : (
          <div className="space-y-3">
            {filtered.map((app) => (
              <div key={app.id} className="bg-card border border-border rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <h3 className="text-foreground font-semibold">{app.name}</h3>
                      <span className={`px-2 py-0.5 rounded text-xs font-mono uppercase ${statusBadge(app.status)}`}>{app.status}</span>
                    </div>
                    <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {app.email}</span>
                      <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {app.phone}</span>
                      <span className="flex items-center gap-1"><Globe className="w-3 h-3" /> {app.nationality}</span>
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {new Date(app.appliedDate).toLocaleDateString()}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Applied for: <span className="text-foreground font-medium">{app.jobApplied}</span>
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {app.status !== "screening" && (
                      <button
                        onClick={() => moveToScreening.mutate(app.id)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:opacity-90 transition"
                      >
                        <ArrowRight className="w-3 h-3" /> Move to Screening
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
