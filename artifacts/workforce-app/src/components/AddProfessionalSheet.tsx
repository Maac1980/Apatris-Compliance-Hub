import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, UserPlus, HardHat, MapPin, Briefcase, CheckCircle2, Phone, Mail, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { createWorkerInAirtable } from "@/lib/api";

interface AddProfessionalSheetProps {
  isOpen: boolean;
  onClose: () => void;
  accentColor: string;
}

const TRADES = [
  "Welder", "Steel Fixer", "Pipe Fitter", "Scaffolder",
  "Electrician", "Plumber", "Crane Operator", "Rigger",
  "Painter", "Insulator", "Mechanic", "Other",
];

export function AddProfessionalSheet({ isOpen, onClose, accentColor }: AddProfessionalSheetProps) {
  const { user } = useAuth();
  const jwt = user?.jwt ?? "";

  const [step, setStep]   = useState<"form" | "loading" | "success" | "error">("form");
  const [name, setName]   = useState("");
  const [trade, setTrade] = useState("");
  const [site, setSite]   = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [createdName, setCreatedName] = useState("");

  const isValid = name.trim().length >= 2 && trade !== "";

  const reset = () => {
    setStep("form");
    setName(""); setTrade(""); setSite(""); setPhone(""); setEmail(""); setErrorMsg("");
  };

  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    setStep("loading");
    try {
      const result = await createWorkerInAirtable(jwt, {
        name: name.trim(),
        specialization: trade,
        assignedSite: site || undefined,
        phone: phone || undefined,
        email: email || undefined,
      });
      setCreatedName(result.name);
      setStep("success");
      setTimeout(() => { reset(); onClose(); }, 2200);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to create profile.");
      setStep("error");
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={step === "loading" ? undefined : handleClose}
            className="absolute inset-0 z-50 bg-black/40 backdrop-blur-[2px]"
          />

          <motion.div
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="absolute bottom-0 left-0 right-0 z-50 bg-[#141416] rounded-t-3xl shadow-2xl overflow-hidden"
            style={{ maxHeight: "90vh" }}
          >
            <AnimatePresence mode="wait">
              {/* Success state */}
              {(step === "success") && (
                <motion.div key="success"
                  initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center justify-center py-12 px-6 text-center"
                >
                  <div className="w-16 h-16 bg-emerald-500/15 rounded-full flex items-center justify-center mb-4">
                    <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                  </div>
                  <h3 className="text-base font-black font-heading text-foreground">Profile Created in Airtable</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {createdName} has been registered and added to the deployed workforce directory.
                  </p>
                </motion.div>
              )}

              {/* Error state */}
              {(step === "error") && (
                <motion.div key="error"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="flex flex-col items-center justify-center py-12 px-6 text-center"
                >
                  <div className="w-16 h-16 bg-red-500/15 rounded-full flex items-center justify-center mb-4">
                    <X className="w-8 h-8 text-red-600" />
                  </div>
                  <h3 className="text-base font-black font-heading text-foreground">Creation Failed</h3>
                  <p className="text-sm text-muted-foreground mt-1">{errorMsg}</p>
                  <button onClick={reset} className="mt-4 px-5 py-2 rounded-xl bg-white text-[#0c0c0e] text-sm font-bold">
                    Try Again
                  </button>
                </motion.div>
              )}

              {/* Form state (also used during loading overlay) */}
              {(step === "form" || step === "loading") && (
                <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  {/* Handle */}
                  <div className="flex justify-center pt-3 pb-1">
                    <div className="w-10 h-1 rounded-full bg-white/10" />
                  </div>

                  {/* Header */}
                  <div className="px-5 py-3 flex items-center justify-between border-b border-white/[0.06]">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                        <UserPlus className="w-4 h-4 text-emerald-600" />
                      </div>
                      <div>
                        <h2 className="font-bold font-heading text-sm text-foreground">Add New Professional</h2>
                        <p className="text-[10px] text-muted-foreground font-medium">Register &amp; onboard to Airtable directory</p>
                      </div>
                    </div>
                    <button onClick={handleClose} disabled={step === "loading"}
                      className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-white/[0.06] transition-all disabled:opacity-40">
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Scrollable form body */}
                  <div className="overflow-y-auto" style={{ maxHeight: "calc(90vh - 100px)" }}>
                    <form onSubmit={handleSubmit} className="px-5 py-5 space-y-4">
                      {/* Full name */}
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                          Full Name <span className="text-red-400">*</span>
                        </label>
                        <div className="relative">
                          <HardHat className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <input type="text" value={name} onChange={e => setName(e.target.value)}
                            placeholder="e.g. Jan Kowalski" disabled={step === "loading"}
                            className="w-full h-11 pl-10 pr-4 bg-white/[0.04] border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all disabled:opacity-60" />
                        </div>
                      </div>

                      {/* Trade */}
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                          Trade / Specialisation <span className="text-red-400">*</span>
                        </label>
                        <div className="relative">
                          <Briefcase className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                          <select value={trade} onChange={e => setTrade(e.target.value)} disabled={step === "loading"}
                            className="w-full h-11 pl-10 pr-4 bg-white/[0.04] border border-border rounded-xl text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all disabled:opacity-60">
                            <option value="">Select trade…</option>
                            {TRADES.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                      </div>

                      {/* Site */}
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                          Deployment Site <span className="text-white/30 font-normal text-[10px] normal-case tracking-normal">(optional)</span>
                        </label>
                        <div className="relative">
                          <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <input type="text" value={site} onChange={e => setSite(e.target.value)}
                            placeholder="e.g. Warsaw North" disabled={step === "loading"}
                            className="w-full h-11 pl-10 pr-4 bg-white/[0.04] border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all disabled:opacity-60" />
                        </div>
                      </div>

                      {/* Phone */}
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                          Phone <span className="text-white/30 font-normal text-[10px] normal-case tracking-normal">(optional)</span>
                        </label>
                        <div className="relative">
                          <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                            placeholder="+48 600 000 000" disabled={step === "loading"}
                            className="w-full h-11 pl-10 pr-4 bg-white/[0.04] border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all disabled:opacity-60" />
                        </div>
                      </div>

                      {/* Email */}
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                          Email <span className="text-white/30 font-normal text-[10px] normal-case tracking-normal">(optional)</span>
                        </label>
                        <div className="relative">
                          <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                            placeholder="jan.kowalski@email.com" disabled={step === "loading"}
                            className="w-full h-11 pl-10 pr-4 bg-white/[0.04] border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all disabled:opacity-60" />
                        </div>
                      </div>

                      <p className="text-[11px] text-muted-foreground">
                        This creates a new record in Airtable. Compliance documents can be added by Tech Ops or a Coordinator afterwards.
                      </p>

                      {/* Submit */}
                      <button type="submit" disabled={!isValid || step === "loading"}
                        className={cn(
                          "w-full h-12 rounded-xl font-bold text-sm text-white transition-all duration-200 flex items-center justify-center gap-2 mb-2",
                          isValid && step !== "loading"
                            ? "bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] shadow-md shadow-emerald-900/30"
                            : "bg-white/[0.06] text-white/30 cursor-not-allowed"
                        )}>
                        {step === "loading" ? (
                          <><Loader2 className="w-4 h-4 animate-spin" />Creating in Airtable…</>
                        ) : (
                          <><UserPlus className="w-4 h-4" />Create Professional Profile</>
                        )}
                      </button>
                    </form>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
