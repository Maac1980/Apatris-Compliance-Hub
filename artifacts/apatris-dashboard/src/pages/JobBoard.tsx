import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Briefcase, Plus, Loader2, Eye, EyeOff, X, Users, MapPin,
} from "lucide-react";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}
const BASE = import.meta.env.BASE_URL;

interface Job {
  id: string;
  title: string;
  location: string;
  salaryMin: number;
  salaryMax: number;
  currency: string;
  status: "published" | "draft" | "closed";
  applicationCount: number;
  createdAt: string;
  description?: string;
}

const emptyForm = { title: "", location: "", salaryMin: 0, salaryMax: 0, currency: "PLN", description: "" };

export default function JobBoard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const { data: jobs = [], isLoading } = useQuery<Job[]>({
    queryKey: ["jobs"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/jobs/all`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to fetch jobs");
      return res.json();
    },
  });

  const createJob = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}api/jobs`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Failed to create job");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      toast({ title: "Job Created", description: "New job posting saved as draft." });
      setShowForm(false);
      setForm(emptyForm);
    },
    onError: () => toast({ title: "Error", description: "Failed to create job", variant: "destructive" }),
  });

  const togglePublish = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const newStatus = status === "published" ? "draft" : "published";
      const res = await fetch(`${BASE}api/jobs/${id}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      toast({ title: "Updated", description: "Job status updated." });
    },
    onError: () => toast({ title: "Error", description: "Failed to update job", variant: "destructive" }),
  });

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      published: "bg-green-900/50 text-green-300 border border-green-600/50",
      draft: "bg-yellow-900/50 text-yellow-300 border border-yellow-500/50",
      closed: "bg-red-900/50 text-red-300 border border-red-600/50",
    };
    return map[status] ?? "bg-card text-muted-foreground border border-border";
  };

  const publishedCount = jobs.filter((j) => j.status === "published").length;
  const totalApps = jobs.reduce((s, j) => s + (j.applicationCount || 0), 0);

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Briefcase className="w-6 h-6 text-primary" /> Job Board
            </h1>
            <p className="text-muted-foreground text-sm mt-1">Manage job postings and track applications</p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition"
          >
            <Plus className="w-4 h-4" /> New Job
          </button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Jobs</p>
            <p className="text-2xl font-bold text-foreground mt-1">{jobs.length}</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Published</p>
            <p className="text-2xl font-bold text-green-400 mt-1">{publishedCount}</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Applications</p>
            <p className="text-2xl font-bold text-foreground mt-1">{totalApps}</p>
          </div>
        </div>

        {/* Form */}
        {showForm && (
          <div className="bg-card border border-border rounded-lg p-5 space-y-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-foreground font-semibold">New Job Posting</h3>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Job title" className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm" />
            <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Location (e.g. Warsaw, Poland)" className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm" />
            <div className="grid grid-cols-2 gap-3">
              <input value={form.salaryMin || ""} onChange={(e) => setForm({ ...form, salaryMin: Number(e.target.value) || 0 })} placeholder="Min salary" type="number" className="px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm" />
              <input value={form.salaryMax || ""} onChange={(e) => setForm({ ...form, salaryMax: Number(e.target.value) || 0 })} placeholder="Max salary" type="number" className="px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm" />
            </div>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Job description..." rows={3} className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm resize-none" />
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => createJob.mutate()}
                disabled={createJob.isPending || !form.title.trim()}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {createJob.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create Job"}
              </button>
              <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-card border border-border text-foreground rounded-lg text-sm">Cancel</button>
            </div>
          </div>
        )}

        {/* Jobs List */}
        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">No job postings yet. Create your first one.</div>
        ) : (
          <div className="space-y-3">
            {jobs.map((job) => (
              <div key={job.id} className="bg-card border border-border rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <h3 className="text-foreground font-semibold">{job.title}</h3>
                      <span className={`px-2 py-0.5 rounded text-xs font-mono uppercase ${statusBadge(job.status)}`}>{job.status}</span>
                    </div>
                    <div className="flex flex-wrap gap-4 mt-2 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {job.location}</span>
                      <span>{job.salaryMin.toLocaleString()} - {job.salaryMax.toLocaleString()} {job.currency}</span>
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {job.applicationCount || 0} applications</span>
                    </div>
                  </div>
                  <button
                    onClick={() => togglePublish.mutate({ id: job.id, status: job.status })}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      job.status === "published"
                        ? "bg-yellow-900/30 text-yellow-300 hover:bg-yellow-900/50"
                        : "bg-green-900/30 text-green-300 hover:bg-green-900/50"
                    }`}
                  >
                    {job.status === "published" ? <><EyeOff className="w-3 h-3" /> Unpublish</> : <><Eye className="w-3 h-3" /> Publish</>}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
