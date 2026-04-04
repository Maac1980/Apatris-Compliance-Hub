import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { BookOpen, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

const API = import.meta.env.VITE_API_URL ?? "";

export function LegalKBTab() {
  const { toast } = useToast();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<{ answer: string; sources: any[] } | null>(null);

  const askMutation = useMutation({
    mutationFn: async (q: string) => { const r = await fetch(`${API}api/legal-kb/query`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ question: q }) }); if (!r.ok) throw new Error("Failed"); return r.json(); },
    onSuccess: (d) => setAnswer(d),
    onError: () => toast({ description: "Failed", variant: "destructive" }),
  });

  return (
    <div className="p-4 min-h-full overflow-y-auto pb-24 bg-[#0c0c0e]">
      <div className="flex items-center gap-2 mb-4"><BookOpen className="w-5 h-5 text-[#C41E18]" /><h2 className="text-lg font-bold text-white">Legal Q&A</h2></div>

      <textarea value={question} onChange={e => setQuestion(e.target.value)} rows={3}
        placeholder="Ask about TRC, work permits, ZUS, tax..."
        className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.06] rounded-xl text-sm text-white placeholder:text-white/20 resize-none mb-2 focus:outline-none focus:ring-1 focus:ring-[#C41E18]" />

      <button onClick={() => askMutation.mutate(question)} disabled={!question.trim() || askMutation.isPending}
        className="w-full py-2.5 bg-[#C41E18] text-white rounded-xl text-sm font-bold active:scale-[0.98] disabled:opacity-40 mb-4">
        {askMutation.isPending ? "Searching verified sources..." : "Ask"}
      </button>

      {answer && (
        <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-2xl p-4">
          <p className="text-xs text-white whitespace-pre-wrap mb-3">{answer.answer}</p>
          {answer.sources?.length > 0 && (
            <div className="border-t border-white/[0.06] pt-2">
              <p className="text-[9px] text-white/30 uppercase tracking-wider mb-1">Sources</p>
              {answer.sources.map((s: any, i: number) => (
                <p key={i} className="text-[9px] text-white/40">• {s.title} ({s.source})</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
