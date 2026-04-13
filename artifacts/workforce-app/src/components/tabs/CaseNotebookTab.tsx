/**
 * CaseNotebookTab — read-only case notebook timeline for the mobile app.
 * Shows recent entries across all cases. Coordinators + workers can see
 * status changes, document events, AI insights affecting their cases.
 */

import { useQuery } from "@tanstack/react-query";
import { FileText, ArrowRight, Brain, Bell, Clock, MessageSquare, Loader2, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_token") || localStorage.getItem("apatris_jwt") || "";
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

const API = import.meta.env.VITE_API_URL ?? "";

const ENTRY_STYLE: Record<string, { color: string; icon: React.ElementType }> = {
  status_change: { color: "text-blue-400", icon: ArrowRight },
  document:      { color: "text-emerald-400", icon: FileText },
  manual:        { color: "text-white/60", icon: MessageSquare },
  ai_insight:    { color: "text-violet-400", icon: Brain },
  alert:         { color: "text-red-400", icon: Bell },
  auto:          { color: "text-white/30", icon: Clock },
};

export function CaseNotebookTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["mobile-notebook"],
    queryFn: async () => {
      const res = await fetch(`${API}api/v1/vault/notebook?limit=30`, { headers: authHeaders() });
      if (!res.ok) return { entries: [] };
      return res.json();
    },
  });

  const entries = (data?.entries ?? []) as any[];

  return (
    <div className="p-4 min-h-full overflow-y-auto pb-24 bg-[#0c0c0e]">
      <div className="flex items-center gap-2 mb-4">
        <BookOpen className="w-5 h-5 text-[#C41E18]" />
        <h2 className="text-lg font-bold text-white">Case Notebook</h2>
        <span className="text-[9px] text-white/30 bg-white/[0.04] px-2 py-0.5 rounded-full">{entries.length} entries</span>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-[#C41E18]" />
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-12">
          <BookOpen className="w-10 h-10 mx-auto mb-3 text-white/10" />
          <p className="text-sm text-white/30">No case entries yet</p>
          <p className="text-[10px] text-white/15 mt-1">Case status changes and documents will appear here</p>
        </div>
      ) : (
        <div className="space-y-1">
          {entries.map((entry: any) => {
            const style = ENTRY_STYLE[entry.entry_type] ?? ENTRY_STYLE.auto;
            const Icon = style.icon;
            return (
              <div key={entry.id} className="flex items-start gap-3 p-3 rounded-xl active:bg-white/[0.03] transition-colors">
                <div className="w-8 h-8 rounded-full bg-white/[0.04] border border-white/[0.06] flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Icon className={cn("w-3.5 h-3.5", style.color)} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-bold text-white truncate">{entry.title}</p>
                  </div>
                  {entry.worker_name && (
                    <p className="text-[10px] text-white/30 mt-0.5">{entry.worker_name} · {entry.case_type}</p>
                  )}
                  <p className="text-[10px] text-white/40 mt-1 line-clamp-2 leading-relaxed">{entry.content}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-[9px] text-white/20">
                      {new Date(entry.created_at).toLocaleDateString("pl-PL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </span>
                    {entry.author && <span className="text-[9px] text-white/15">· {entry.author}</span>}
                    <span className={cn("text-[8px] px-1.5 py-0.5 rounded bg-white/[0.03]", style.color)}>{entry.entry_type}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
