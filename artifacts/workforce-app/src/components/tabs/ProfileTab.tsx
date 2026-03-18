import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, KeyRound, ShieldCheck, ShieldX, LogOut, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { changeMobilePin } from "@/lib/api";
import { TIER_CONFIGS, Role } from "@/types";
import { cn } from "@/lib/utils";

const ROLE_BADGE_COLORS: Record<Role, string> = {
  Executive:    "bg-indigo-100 text-indigo-700 border-indigo-200",
  LegalHead:    "bg-violet-100 text-violet-700 border-violet-200",
  TechOps:      "bg-blue-100 text-blue-700 border-blue-200",
  Coordinator:  "bg-emerald-100 text-emerald-700 border-emerald-200",
  Professional: "bg-amber-100 text-amber-700 border-amber-200",
};

const AVATAR_COLORS: Record<Role, string> = {
  Executive:    "bg-indigo-100 text-indigo-600 border-indigo-200",
  LegalHead:    "bg-violet-100 text-violet-600 border-violet-200",
  TechOps:      "bg-blue-100 text-blue-600 border-blue-200",
  Coordinator:  "bg-emerald-100 text-emerald-600 border-emerald-200",
  Professional: "bg-amber-100 text-amber-600 border-amber-200",
};

function PinField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">
        {label}
      </label>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? "••••••••"}
          className="w-full h-10 bg-gray-50 border border-border rounded-xl px-3.5 pr-10 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/20 transition-shadow"
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

interface ProfileTabProps {
  onLogout: () => void;
}

export function ProfileTab({ onLogout }: ProfileTabProps) {
  const { role, user } = useAuth();
  if (!role) return null;

  const tierConfig = TIER_CONFIGS[role];
  const badgeColor = ROLE_BADGE_COLORS[role];
  const avatarColor = AVATAR_COLORS[role];

  const displayName = user?.name ?? tierConfig.shortLabel;
  const initials = displayName.slice(0, 2).toUpperCase();

  // ── Change PIN state ───────────────────────────────────────────────────
  const [pinOpen, setPinOpen] = useState(false);
  const [currentPin, setCurrentPin]   = useState("");
  const [newPin, setNewPin]           = useState("");
  const [confirmPin, setConfirmPin]   = useState("");
  const [pinLoading, setPinLoading]   = useState(false);
  const [pinError, setPinError]       = useState<string | null>(null);
  const [pinSuccess, setPinSuccess]   = useState(false);

  const resetForm = () => {
    setCurrentPin("");
    setNewPin("");
    setConfirmPin("");
    setPinError(null);
    setPinSuccess(false);
  };

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.jwt) { setPinError("Session expired. Please log in again."); return; }
    if (newPin !== confirmPin) { setPinError("New PIN and confirmation do not match."); return; }
    if (newPin.length < 4) { setPinError("New PIN must be at least 4 characters."); return; }

    setPinLoading(true);
    setPinError(null);
    try {
      await changeMobilePin(user.jwt, currentPin, newPin, confirmPin);
      setPinSuccess(true);
      setTimeout(() => {
        setPinOpen(false);
        resetForm();
      }, 2000);
    } catch (err: unknown) {
      setPinError(err instanceof Error ? err.message : "Failed to change PIN.");
    } finally {
      setPinLoading(false);
    }
  };

  const ACCESS_ROWS = [
    { label: "Financial Access",       granted: tierConfig.canViewFinancials },
    { label: "Professional Directory", granted: tierConfig.canViewGlobalDirectory },
    { label: "Document Approval",      granted: tierConfig.canApproveDocuments },
    { label: "Operational Modules",    granted: tierConfig.canAccessOperationalModules },
    { label: "Legal Dossiers",         granted: tierConfig.canViewLegalDossiers },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="px-4 py-5 space-y-4 pb-24"
    >
      {/* ── Identity card ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border shadow-sm p-5 flex items-center gap-4">
        <div className={cn(
          "w-14 h-14 rounded-full border-2 flex items-center justify-center shrink-0 font-black text-lg",
          avatarColor
        )}>
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-base font-bold text-foreground leading-tight">{displayName}</div>
          <div className={cn(
            "inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border mt-1.5 whitespace-nowrap",
            badgeColor
          )}>
            Tier {tierConfig.tier} · {tierConfig.shortLabel}
          </div>
          <div className="text-xs text-muted-foreground mt-1.5 leading-tight">{tierConfig.subtitle}</div>
        </div>
      </div>

      {/* ── Access rights ────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border shadow-sm divide-y divide-gray-50 overflow-hidden">
        <div className="px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Access Rights</p>
        </div>
        {ACCESS_ROWS.map(({ label, granted }) => (
          <div key={label} className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {granted
                ? <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                : <ShieldX className="w-4 h-4 text-red-400 shrink-0" />
              }
              <span className="text-sm font-semibold text-foreground">{label}</span>
            </div>
            <span className={cn(
              "text-[10px] font-bold px-2.5 py-1 rounded-full border whitespace-nowrap",
              granted
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-red-50 text-red-700 border-red-200"
            )}>
              {granted ? "Granted" : "Restricted"}
            </span>
          </div>
        ))}
      </div>

      {/* ── Change PIN ───────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
        <button
          onClick={() => { setPinOpen((v) => !v); resetForm(); }}
          className="w-full flex items-center justify-between px-4 py-4 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <KeyRound className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">Change PIN / Password</span>
          </div>
          <span className={cn(
            "text-[10px] font-bold px-2.5 py-1 rounded-full border transition-colors",
            pinOpen
              ? "bg-gray-100 text-gray-600 border-gray-200"
              : "bg-blue-50 text-blue-700 border-blue-200"
          )}>
            {pinOpen ? "Cancel" : "Update"}
          </span>
        </button>

        <AnimatePresence>
          {pinOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="overflow-hidden"
            >
              <form onSubmit={handlePinSubmit} className="px-4 pb-5 space-y-3 border-t border-gray-50 pt-4">

                <AnimatePresence mode="wait">
                  {pinSuccess ? (
                    <motion.div
                      key="success"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="flex flex-col items-center py-4 gap-2"
                    >
                      <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                      <p className="text-sm font-bold text-emerald-700">PIN updated successfully!</p>
                      <p className="text-xs text-muted-foreground">Use your new PIN next time you log in.</p>
                    </motion.div>
                  ) : (
                    <motion.div key="form" className="space-y-3">
                      <PinField
                        label="Current PIN"
                        value={currentPin}
                        onChange={setCurrentPin}
                        placeholder="Enter current PIN"
                      />
                      <PinField
                        label="New PIN"
                        value={newPin}
                        onChange={setNewPin}
                        placeholder="Enter new PIN (min 4 chars)"
                      />
                      <PinField
                        label="Confirm New PIN"
                        value={confirmPin}
                        onChange={setConfirmPin}
                        placeholder="Repeat new PIN"
                      />

                      <AnimatePresence>
                        {pinError && (
                          <motion.p
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className="text-red-500 text-xs font-medium"
                          >
                            {pinError}
                          </motion.p>
                        )}
                      </AnimatePresence>

                      <button
                        type="submit"
                        disabled={pinLoading || !currentPin || !newPin || !confirmPin}
                        className={cn(
                          "w-full h-10 rounded-xl text-sm font-bold transition-all",
                          pinLoading || !currentPin || !newPin || !confirmPin
                            ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                            : "bg-gray-900 text-white hover:bg-gray-800 active:scale-[0.98]"
                        )}
                      >
                        {pinLoading ? (
                          <span className="flex items-center justify-center gap-2">
                            <span className="w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                            Updating...
                          </span>
                        ) : "Update PIN"}
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Log out ──────────────────────────────────────────────────────── */}
      <button
        onClick={onLogout}
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl border border-red-200 bg-red-50 text-red-600 text-sm font-bold hover:bg-red-100 transition-colors active:scale-[0.98]"
      >
        <LogOut className="w-4 h-4" />
        Log Out
      </button>
    </motion.div>
  );
}
