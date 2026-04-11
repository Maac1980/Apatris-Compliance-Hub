/**
 * Knowledge Base — Obsidian exports viewer.
 */

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { authHeaders, BASE } from "@/lib/api";
import { FileText, Loader2, Download, ChevronDown, ChevronUp } from "lucide-react";

export default function KnowledgeBase() {
  const { toast } = useToast();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [contentMap, setContentMap] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["obsidian-exports"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/v1/obsidian/exports`, { headers: authHeaders() });
      if (!res.ok) return { exports: [] };
      return res.json();
    },
  });

  const loadContent = async (id: string) => {
    if (contentMap[id]) { setExpandedId(expandedId === id ? null : id); return; }
    try {
      const res = await fetch(`${BASE}api/v1/obsidian/exports/${id}/content`, { headers: authHeaders() });
      if (res.ok) {
        const { content } = await res.json();
        setContentMap(prev => ({ ...prev, [id]: content }));
      }
    } catch {}
    setExpandedId(expandedId === id ? null : id);
  };

  const exports = data?.exports ?? [];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 overflow-y-auto pb-20">
      <div className="border-b border-slate-800 bg-slate-900/50 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-700/50 border border-slate-600 flex items-center justify-center"><FileText className="w-5 h-5 text-slate-300" /></div>
          <div><h1 className="text-xl font-bold text-white tracking-tight">Knowledge Base</h1><p className="text-xs text-slate-500 font-mono uppercase tracking-widest mt-1">Obsidian Exports · Regulatory Notes · Research</p></div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-3">
        {isLoading ? <div className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin text-slate-500 mx-auto" /></div>
        : exports.length === 0 ? <div className="text-center py-12 text-slate-600"><FileText className="w-10 h-10 mx-auto mb-2 opacity-30" /><p>No exports yet. Export approved regulatory updates or research memos.</p></div>
        : exports.map((e: any) => (
          <div key={e.id} className="rounded-xl border bg-slate-900 border-slate-800 p-4">
            <div className="flex items-center justify-between cursor-pointer" onClick={() => loadContent(e.id)}>
              <div>
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-400" />
                  <span className="text-sm font-semibold text-white">{e.title || e.file_path}</span>
                  <span className="text-[9px] bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded">{e.entity_type}</span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-500">
                  <span>{e.file_path}</span>
                  <span>By: {e.exported_by || "—"}</span>
                  <span>{new Date(e.created_at).toLocaleString("pl-PL")}</span>
                </div>
              </div>
              {expandedId === e.id ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
            </div>
            {expandedId === e.id && contentMap[e.id] && (
              <div className="mt-3 border-t border-slate-800 pt-3">
                <pre className="text-xs text-slate-300 whitespace-pre-wrap font-sans bg-slate-950/50 rounded-lg p-4 max-h-[500px] overflow-y-auto">{contentMap[e.id]}</pre>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
