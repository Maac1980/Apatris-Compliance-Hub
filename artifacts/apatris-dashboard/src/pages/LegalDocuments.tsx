/**
 * Legal Documents — attorney document generation with auto-suggest.
 * Wave 1: TRC Application, Power of Attorney, Cover Letter.
 */

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { authHeaders, BASE, extractList } from "@/lib/api";
import { sanitizeHtml } from "@/lib/sanitize";
import {
  FileSignature, Plus, Loader2, CheckCircle2, AlertTriangle, Eye, Printer,
  ThumbsUp, ChevronRight, X, Sparkles, FileText, Shield,
} from "lucide-react";

const TEMPLATE_LABELS: Record<string, { label: string; icon: typeof FileText; color: string }> = {
  TRC_APPLICATION:   { label: "TRC Application", icon: FileSignature, color: "text-blue-400" },
  POWER_OF_ATTORNEY: { label: "Power of Attorney", icon: Shield, color: "text-violet-400" },
  COVER_LETTER:      { label: "Cover Letter", icon: FileText, color: "text-emerald-400" },
  WORK_PERMIT_A:     { label: "Work Permit Type A", icon: FileSignature, color: "text-amber-400" },
  APPEAL:            { label: "Appeal", icon: AlertTriangle, color: "text-red-400" },
  COMPLAINT:         { label: "Complaint", icon: AlertTriangle, color: "text-orange-400" },
  FILE_INSPECTION:   { label: "File Inspection", icon: Eye, color: "text-cyan-400" },
};

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-slate-700/50 text-slate-300",
  review: "bg-amber-500/10 text-amber-400",
  approved: "bg-emerald-500/10 text-emerald-400",
  sent: "bg-blue-500/10 text-blue-400",
  archived: "bg-slate-800 text-slate-500",
};

export default function LegalDocuments() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedWorker, setSelectedWorker] = useState("");
  const [selectedDoc, setSelectedDoc] = useState<any>(null);

  // Workers list
  const { data: workersData, isError: workersError, refetch: refetchWorkers } = useQuery({
    queryKey: ["workers-for-docs"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/workers`, { headers: authHeaders() });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error || "Failed to load workers"); }
      const list = extractList<any>(await res.json(), "workers").slice(0, 300);
      return list.map((w: any) => ({ id: w.id, full_name: w.full_name ?? w.name ?? w.id }));
    },
  });

  // Suggestions for selected worker
  const { data: suggestionsData } = useQuery({
    queryKey: ["doc-suggestions", selectedWorker],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/v1/legal/documents/suggest/${selectedWorker}`, { headers: authHeaders() });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error || "Failed to load suggestions"); }
      const json = await res.json();
      return json.suggestions ?? [];
    },
    enabled: !!selectedWorker,
  });

  // Documents for selected worker
  const { data: docsData, isLoading: docsLoading, isError: docsError, refetch: refetchDocs } = useQuery({
    queryKey: ["worker-legal-docs", selectedWorker],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/v1/legal/documents/worker/${selectedWorker}`, { headers: authHeaders() });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error || "Failed to load documents"); }
      const json = await res.json();
      return json.documents ?? [];
    },
    enabled: !!selectedWorker,
  });

  const generateMutation = useMutation({
    mutationFn: async (templateType: string) => {
      const res = await fetch(`${BASE}api/v1/legal/documents/generate`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ workerId: selectedWorker, templateType }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error ?? "Failed"); }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["worker-legal-docs", selectedWorker] });
      setSelectedDoc(data.document);
      toast({ description: "Document generated" });
    },
    onError: (err) => toast({ description: (err as Error).message, variant: "destructive" }),
  });

  const approveMutation = useMutation({
    mutationFn: async (docId: string) => {
      const res = await fetch(`${BASE}api/v1/legal/documents/${docId}/approve`, { method: "POST", headers: authHeaders() });
      if (!res.ok) throw new Error("Approval failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["worker-legal-docs", selectedWorker] });
      toast({ description: "Document approved" });
    },
  });

  const workers = workersData ?? [];
  const suggestions = suggestionsData ?? [];
  const docs = docsData ?? [];

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <FileSignature className="w-7 h-7 text-[#C41E18]" />
          <h1 className="text-3xl font-bold text-white">Legal Documents</h1>
        </div>
        <p className="text-gray-400">Generate attorney documents from templates — auto-prefilled with worker data</p>
      </div>

      {/* Worker selector */}
      <div className="mb-6">
        <select value={selectedWorker} onChange={e => { setSelectedWorker(e.target.value); setSelectedDoc(null); }}
          className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-sm text-white min-w-[300px]">
          <option value="">Select worker...</option>
          {workers.map((w: any) => <option key={w.id} value={w.id}>{w.full_name ?? w.id}</option>)}
        </select>
      </div>

      {selectedWorker && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Suggestions + Generate */}
          <div className="space-y-4">
            {/* Auto-suggestions */}
            {suggestions.length > 0 && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">Suggested Documents</span>
                </div>
                <div className="space-y-2">
                  {suggestions.map((s: any, i: number) => {
                    const tpl = TEMPLATE_LABELS[s.templateType] ?? { label: s.templateType, icon: FileText, color: "text-slate-400" };
                    const Icon = tpl.icon;
                    return (
                      <div key={i} className="bg-card border border-border rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <Icon className={`w-3.5 h-3.5 ${tpl.color}`} />
                          <span className="text-xs font-bold text-white">{tpl.label}</span>
                          <span className={`ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded ${
                            s.priority === "high" ? "bg-red-500/10 text-red-400" : "bg-slate-700 text-slate-400"
                          }`}>{s.priority}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mb-2">{s.reason}</p>
                        <button onClick={() => generateMutation.mutate(s.templateType)}
                          disabled={generateMutation.isPending}
                          className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded bg-primary/20 text-primary text-xs font-bold hover:bg-primary/30 disabled:opacity-50">
                          {generateMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                          Generate
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Manual generate */}
            <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">All Templates</h3>
              <div className="space-y-1.5">
                {Object.entries(TEMPLATE_LABELS).map(([type, cfg]) => {
                  const Icon = cfg.icon;
                  return (
                    <button key={type} onClick={() => generateMutation.mutate(type)}
                      disabled={generateMutation.isPending}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-card border border-border hover:border-primary/30 text-left transition-colors disabled:opacity-50">
                      <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
                      <span className="text-xs text-white font-medium">{cfg.label}</span>
                      <ChevronRight className="w-3 h-3 text-slate-600 ml-auto" />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right: Generated documents */}
          <div className="lg:col-span-2 space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Generated Documents</h3>

            {docsLoading ? (
              <div className="flex justify-center py-10"><div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" /></div>
            ) : docs.length === 0 ? (
              <div className="text-center py-10 text-slate-500">
                <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No documents generated yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {docs.map((doc: any) => {
                  const tpl = TEMPLATE_LABELS[doc.template_type] ?? { label: doc.template_type, icon: FileText, color: "text-slate-400" };
                  const Icon = tpl.icon;
                  return (
                    <div key={doc.id} onClick={() => setSelectedDoc(doc)}
                      className="bg-card border border-border rounded-xl p-3 hover:border-primary/30 cursor-pointer transition-colors">
                      <div className="flex items-center gap-3">
                        <Icon className={`w-4 h-4 ${tpl.color}`} />
                        <div className="flex-1">
                          <p className="text-sm font-bold text-white">{doc.title}</p>
                          <p className="text-[10px] text-muted-foreground font-mono">{new Date(doc.created_at).toLocaleString("en-GB")}</p>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${STATUS_STYLE[doc.status] ?? STATUS_STYLE.draft}`}>{doc.status}</span>
                        {doc.status === "draft" && (
                          <button onClick={(e) => { e.stopPropagation(); approveMutation.mutate(doc.id); }}
                            className="p-1 text-emerald-400 hover:text-emerald-300"><ThumbsUp className="w-3.5 h-3.5" /></button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Document preview panel */}
      {selectedDoc && (
        <div className="fixed inset-0 z-[250] flex justify-end" onClick={() => setSelectedDoc(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative w-full max-w-3xl bg-slate-900 border-l border-slate-700 h-full overflow-y-auto shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-slate-900 border-b border-slate-700 px-6 py-4 flex items-center justify-between z-10">
              <div>
                <h2 className="text-lg font-bold text-white">{selectedDoc.title}</h2>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${STATUS_STYLE[selectedDoc.status] ?? STATUS_STYLE.draft}`}>{selectedDoc.status}</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => window.open(`${BASE}api/v1/legal/documents/${selectedDoc.id}/html`, "_blank")}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 text-white rounded-lg text-xs font-bold hover:bg-slate-600">
                  <Printer className="w-3 h-3" /> Print
                </button>
                {selectedDoc.status === "draft" && (
                  <button onClick={() => { approveMutation.mutate(selectedDoc.id); setSelectedDoc({ ...selectedDoc, status: "approved" }); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-bold">
                    <ThumbsUp className="w-3 h-3" /> Approve
                  </button>
                )}
                <button onClick={() => setSelectedDoc(null)} className="p-2 hover:bg-slate-800 rounded-lg"><X className="w-5 h-5 text-slate-400" /></button>
              </div>
            </div>
            <div className="p-6">
              {selectedDoc.rendered_html ? (
                <div className="bg-white rounded-lg p-8 shadow-lg" dangerouslySetInnerHTML={{ __html: sanitizeHtml(selectedDoc.rendered_html) }} />
              ) : (
                <pre className="text-xs text-slate-300 whitespace-pre-wrap">{JSON.stringify(selectedDoc.content_json, null, 2)}</pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
