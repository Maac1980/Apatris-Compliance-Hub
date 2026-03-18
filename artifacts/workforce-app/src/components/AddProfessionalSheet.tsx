import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, UserPlus, HardHat, MapPin, Briefcase, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface AddProfessionalSheetProps {
  isOpen: boolean;
  onClose: () => void;
  accentColor: string;
}

const TRADES = ["Welder", "Steel Fixer", "Pipe Fitter", "Scaffolder"];
const SITES  = ["Site A – Warsaw North", "Site B – Kraków East", "Site C – Gdańsk Port"];

export function AddProfessionalSheet({ isOpen, onClose, accentColor }: AddProfessionalSheetProps) {
  const [step, setStep] = useState<"form" | "success">("form");
  const [name, setName]   = useState("");
  const [trade, setTrade] = useState("");
  const [site, setSite]   = useState("");

  const isValid = name.trim().length >= 2 && trade !== "" && site !== "";

  const handleSubmit = () => {
    if (!isValid) return;
    setStep("success");
    setTimeout(() => {
      setStep("form");
      setName("");
      setTrade("");
      setSite("");
      onClose();
    }, 1800);
  };

  const handleClose = () => {
    setStep("form");
    setName("");
    setTrade("");
    setSite("");
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="absolute inset-0 z-50 bg-black/40 backdrop-blur-[2px]"
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="absolute bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl overflow-hidden"
          >
            {step === "success" ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center justify-center py-12 px-6 text-center"
              >
                <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                </div>
                <h3 className="text-base font-black text-foreground">Profile Created</h3>
                <p className="text-sm text-muted-foreground mt-1">{name} has been registered and added to the directory.</p>
              </motion.div>
            ) : (
              <>
                {/* Handle */}
                <div className="flex justify-center pt-3 pb-1">
                  <div className="w-10 h-1 rounded-full bg-gray-200" />
                </div>

                {/* Header */}
                <div className="px-5 py-3 flex items-center justify-between border-b border-gray-100">
                  <div className="flex items-center gap-2.5">
                    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", `${accentColor}/10`)}>
                      <UserPlus className={cn("w-4 h-4", accentColor.replace("bg-", "text-"))} />
                    </div>
                    <div>
                      <h2 className="font-bold text-sm text-foreground">Add New Professional</h2>
                      <p className="text-[10px] text-muted-foreground font-medium">Register & onboard to Deployed Directory</p>
                    </div>
                  </div>
                  <button
                    onClick={handleClose}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-gray-100 active:scale-95 transition-all"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Form */}
                <div className="px-5 py-5 space-y-4">
                  {/* Full name */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Full Name</label>
                    <div className="relative">
                      <HardHat className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <input
                        type="text"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="e.g. Jan Kowalski"
                        className="w-full h-11 pl-10 pr-4 bg-gray-50 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                      />
                    </div>
                  </div>

                  {/* Trade */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Trade / Specialisation</label>
                    <div className="relative">
                      <Briefcase className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                      <select
                        value={trade}
                        onChange={e => setTrade(e.target.value)}
                        className="w-full h-11 pl-10 pr-4 bg-gray-50 border border-border rounded-xl text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                      >
                        <option value="">Select trade…</option>
                        {TRADES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Site */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Deployment Site</label>
                    <div className="relative">
                      <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                      <select
                        value={site}
                        onChange={e => setSite(e.target.value)}
                        className="w-full h-11 pl-10 pr-4 bg-gray-50 border border-border rounded-xl text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                      >
                        <option value="">Select site…</option>
                        {SITES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>

                  <p className="text-[11px] text-muted-foreground">
                    After creation, the professional's compliance documents can be uploaded by Tech Ops or a Coordinator.
                  </p>

                  {/* Submit */}
                  <button
                    onClick={handleSubmit}
                    disabled={!isValid}
                    className={cn(
                      "w-full h-12 rounded-xl font-bold text-sm text-white transition-all duration-200 flex items-center justify-center gap-2",
                      isValid
                        ? "bg-blue-600 hover:bg-blue-700 active:scale-[0.98] shadow-md shadow-blue-200"
                        : "bg-gray-200 text-gray-400 cursor-not-allowed"
                    )}
                  >
                    <UserPlus className="w-4 h-4" />
                    Create Professional Profile
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
