import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Languages, Play } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

const API = import.meta.env.VITE_API_URL ?? "";

interface Lang { code: string; name: string; flag: string; }

export function TranslateTab() {
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [target, setTarget] = useState("pl");
  const [result, setResult] = useState("");

  const { data } = useQuery({
    queryKey: ["translate-languages"],
    queryFn: async () => {
      const res = await fetch(`${API}api/translate/languages`, { headers: authHeaders() });
      if (!res.ok) return { languages: [] };
      return res.json() as Promise<{ languages: Lang[] }>;
    },
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API}api/translate`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ text, targetLang: target }) });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: (d) => setResult(d.translated),
    onError: () => toast({ description: "Translation failed", variant: "destructive" }),
  });

  const languages = data?.languages ?? [];

  return (
    <div className="p-4 min-h-full overflow-y-auto pb-24 bg-[#0c0c0e]">
      <div className="flex items-center gap-2 mb-4">
        <Languages className="w-5 h-5 text-[#C41E18]" />
        <h2 className="text-lg font-bold text-white">Translate</h2>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {languages.map(l => (
          <button key={l.code} onClick={() => setTarget(l.code)}
            className={`px-2.5 py-1 rounded-full text-xs font-bold border transition-colors ${target === l.code ? "bg-[#C41E18] text-white border-[#C41E18]" : "text-white/40 border-white/10"}`}>
            {l.flag} {l.name}
          </button>
        ))}
      </div>

      <textarea value={text} onChange={e => setText(e.target.value)} rows={4} placeholder="Enter text..."
        className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.06] rounded-xl text-sm text-white placeholder:text-white/20 resize-none mb-2 focus:outline-none focus:ring-1 focus:ring-[#C41E18]" />

      <button onClick={() => mutation.mutate()} disabled={!text || mutation.isPending}
        className="w-full py-2.5 bg-[#C41E18] text-white rounded-xl text-sm font-bold active:scale-[0.98] disabled:opacity-40 mb-3">
        {mutation.isPending ? "Translating..." : "Translate"}
      </button>

      {result && (
        <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-xl p-3">
          <p className="text-[10px] text-emerald-400/60 uppercase font-bold mb-1">Translation</p>
          <p className="text-sm text-emerald-300">{result}</p>
        </div>
      )}
    </div>
  );
}
