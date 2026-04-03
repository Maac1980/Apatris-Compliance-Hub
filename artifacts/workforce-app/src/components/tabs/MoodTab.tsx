import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { SmilePlus, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

const API = import.meta.env.VITE_API_URL ?? "";

const MOODS = [
  { score: 1, emoji: "😢", label: "Very Unhappy", color: "border-red-500 bg-red-500/20 text-red-400" },
  { score: 2, emoji: "😔", label: "Unhappy", color: "border-orange-500 bg-orange-500/20 text-orange-400" },
  { score: 3, emoji: "😐", label: "Neutral", color: "border-amber-500 bg-amber-500/20 text-amber-400" },
  { score: 4, emoji: "🙂", label: "Happy", color: "border-emerald-500 bg-emerald-500/20 text-emerald-400" },
  { score: 5, emoji: "😃", label: "Very Happy", color: "border-emerald-400 bg-emerald-400/20 text-emerald-300" },
];

interface MoodEntry { id: string; score: number; comment: string | null; week_number: number; year: number; submitted_at: string; }

export function MoodTab() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);

  // Check if already submitted this week
  const { data: historyData } = useQuery({
    queryKey: ["mood-history"],
    queryFn: async () => {
      // Use a generic endpoint — will be filtered server-side
      const res = await fetch(`${API}api/mood/dashboard`, { headers: authHeaders() });
      if (!res.ok) return null;
      return res.json();
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (score: number) => {
      const res = await fetch(`${API}api/mood`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({
          workerId: "self",
          workerName: user?.name || "Worker",
          score,
          comment: comment || null,
          site: null,
        }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Failed"); }
      return res.json();
    },
    onSuccess: () => {
      setSubmitted(true);
      toast({ description: "Mood submitted! Thank you." });
      queryClient.invalidateQueries({ queryKey: ["mood-history"] });
    },
    onError: (err) => {
      toast({ description: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    },
  });

  return (
    <div className="p-4 min-h-full overflow-y-auto pb-24 bg-[#0c0c0e]">
      <div className="flex items-center gap-2 mb-6">
        <SmilePlus className="w-5 h-5 text-[#C41E18]" />
        <h2 className="text-lg font-bold text-white">How are you feeling?</h2>
      </div>

      {submitted ? (
        <div className="flex flex-col items-center justify-center py-16">
          <CheckCircle2 className="w-16 h-16 text-emerald-400 mb-4" />
          <p className="text-xl font-bold text-white mb-1">Thank you!</p>
          <p className="text-sm text-white/40">Your mood has been recorded for this week.</p>
          <p className="text-4xl mt-4">{MOODS.find(m => m.score === selected)?.emoji}</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-white/50 mb-6 text-center">How are you feeling at work this week? Tap to select.</p>

          {/* Mood emoji buttons */}
          <div className="grid grid-cols-5 gap-2 mb-6">
            {MOODS.map(m => (
              <button
                key={m.score}
                onClick={() => setSelected(m.score)}
                className={cn(
                  "flex flex-col items-center gap-1.5 p-3 rounded-2xl border-2 transition-all active:scale-95",
                  selected === m.score ? m.color : "border-white/[0.06] bg-white/[0.02]"
                )}
              >
                <span className="text-3xl">{m.emoji}</span>
                <span className={cn("text-[9px] font-bold uppercase tracking-wider",
                  selected === m.score ? "" : "text-white/30"
                )}>{m.score}</span>
              </button>
            ))}
          </div>

          {selected && (
            <p className="text-center text-sm font-bold text-white mb-4">
              {MOODS.find(m => m.score === selected)?.emoji} {MOODS.find(m => m.score === selected)?.label}
            </p>
          )}

          {/* Optional comment */}
          <textarea
            placeholder="Any comments? (optional)"
            value={comment}
            onChange={e => setComment(e.target.value)}
            rows={3}
            className="w-full px-4 py-3 bg-white/[0.03] border border-white/[0.08] rounded-2xl text-sm text-white placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-[#C41E18] resize-none mb-4"
          />

          {/* Submit */}
          <button
            onClick={() => selected && submitMutation.mutate(selected)}
            disabled={!selected || submitMutation.isPending}
            className="w-full py-3 bg-[#C41E18] text-white rounded-2xl text-sm font-bold active:scale-[0.98] transition-transform disabled:opacity-40"
          >
            {submitMutation.isPending ? (
              <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full mx-auto" />
            ) : (
              "Submit Mood"
            )}
          </button>
        </>
      )}
    </div>
  );
}
