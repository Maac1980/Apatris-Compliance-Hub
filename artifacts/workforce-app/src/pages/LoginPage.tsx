import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { mobileLogin } from "@/lib/api";
import {
  isBiometricAvailable, registerBiometric, authenticateBiometric,
  savePin, getSavedPin, hasSavedPin, hasBiometric, clearSavedPin,
} from "@/lib/biometric";
import { Role } from "@/types";
import { motion, AnimatePresence } from "framer-motion";
import {
  Crown, Scale, Wrench, ClipboardList, HardHat, ChevronRight,
  ArrowLeft, Eye, EyeOff, Lock, Fingerprint, Trash2, CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface RoleCard {
  role: Role; tier: number; title: string; subtitle: string;
  icon: React.ElementType;
  accent: string; badge: string; borderColor: string;
}

const ROLES: RoleCard[] = [
  { role: "Executive",    tier: 1, title: "Executive Board & Partners",  subtitle: "Full platform · Payroll · Financials",        icon: Crown,         accent: "text-indigo-400",  badge: "bg-indigo-600 text-white",  borderColor: "border-indigo-500/30" },
  { role: "LegalHead",    tier: 2, title: "Head of Legal & Compliance",  subtitle: "PIP dossiers · Directory · Alerts",           icon: Scale,         accent: "text-violet-400",  badge: "bg-violet-600 text-white",  borderColor: "border-violet-500/30" },
  { role: "TechOps",      tier: 3, title: "Key Account & Technical Ops", subtitle: "Add Professionals · UDT · Site Deployments",  icon: Wrench,        accent: "text-blue-400",    badge: "bg-blue-600 text-white",    borderColor: "border-blue-500/30" },
  { role: "Coordinator",  tier: 4, title: "Compliance Coordinator",      subtitle: "Professionals · Doc queue · Operations",      icon: ClipboardList, accent: "text-emerald-400", badge: "bg-emerald-600 text-white", borderColor: "border-emerald-500/30" },
  { role: "Professional", tier: 5, title: "Deployed Professional",       subtitle: "My profile · Submit hours · Documents",       icon: HardHat,       accent: "text-amber-400",   badge: "bg-amber-500 text-white",   borderColor: "border-amber-500/30" },
];

const T1_USERS = [
  { name: "Manish", key: "manish", initials: "MN", role: "Founder & CEO", accent: "text-indigo-300", border: "border-indigo-500/30 hover:border-indigo-400/60" },
  { name: "Akshay", key: "akshay", initials: "AK", role: "Partner",       accent: "text-violet-300", border: "border-violet-500/30 hover:border-violet-400/60" },
];

const listVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.055, delayChildren: 0.05 } },
};
const rowVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 28 } },
};

export function LoginPage() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const [, setLocation] = useLocation();

  const [selectedRole, setSelectedRole] = useState<RoleCard | null>(null);
  const [selectedUser, setSelectedUser]  = useState<typeof T1_USERS[number] | null>(null);
  const [password, setPassword]          = useState("");
  const [showPassword, setShowPassword]  = useState(false);
  const [loading, setLoading]            = useState(false);
  const [bioLoading, setBioLoading]      = useState(false);
  const [error, setError]                = useState<string | null>(null);
  const [rememberDevice, setRememberDevice] = useState(false);
  const [bioAvailable, setBioAvailable]  = useState(false);
  const [bioRegistered, setBioRegistered] = useState(false);
  const [pinSaved, setPinSaved]          = useState(false);
  const [bioSuccess, setBioSuccess]      = useState(false);

  useEffect(() => { isBiometricAvailable().then(setBioAvailable); }, []);

  const updateSavedState = useCallback((tier: number, userKey?: string) => {
    setPinSaved(hasSavedPin(tier, userKey));
    setBioRegistered(hasBiometric(tier, userKey));
  }, []);

  useEffect(() => {
    if (!selectedRole) return;
    const uKey = selectedRole.tier === 1 ? selectedUser?.key : undefined;
    if (selectedRole.tier !== 1 || selectedUser) updateSavedState(selectedRole.tier, uKey);
  }, [selectedRole, selectedUser, updateSavedState]);

  const resetStep = () => {
    setPassword(""); setError(null); setBioSuccess(false);
    setPinSaved(false); setBioRegistered(false);
  };

  const handleRoleSelect = (card: RoleCard) => { setSelectedRole(card); setSelectedUser(null); resetStep(); };
  const handleUserSelect = (u: typeof T1_USERS[number]) => {
    setSelectedUser(u); setPassword(""); setError(null); setBioSuccess(false);
    updateSavedState(1, u.key);
  };
  const handleBack = () => {
    if (selectedUser) { setSelectedUser(null); resetStep(); }
    else { setSelectedRole(null); resetStep(); }
  };

  const doLogin = async (pass: string) => {
    if (!selectedRole) return;
    setLoading(true); setError(null);
    try {
      const nameParam = selectedRole.tier === 1 && selectedUser ? selectedUser.key : undefined;
      const result = await mobileLogin(selectedRole.tier, pass, nameParam);
      login(selectedRole.role, result.name, result.jwt);
      if (rememberDevice) {
        const uKey = selectedRole.tier === 1 ? selectedUser?.key : undefined;
        savePin(selectedRole.tier, pass, uKey);
        if (bioAvailable) await registerBiometric(selectedRole.tier, uKey);
      }
      setLocation("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    } finally { setLoading(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    await doLogin(password.trim());
  };

  const handleBiometric = async () => {
    if (!selectedRole) return;
    const uKey = selectedRole.tier === 1 ? selectedUser?.key : undefined;
    setBioLoading(true); setError(null);
    try {
      const passed = await authenticateBiometric(selectedRole.tier, uKey);
      if (!passed) { setError("Biometric failed. Enter your PIN manually."); return; }
      const savedPass = getSavedPin(selectedRole.tier, uKey);
      if (!savedPass) { setError("Saved credentials not found."); return; }
      setBioSuccess(true);
      await new Promise(r => setTimeout(r, 500));
      const nameParam = selectedRole.tier === 1 && selectedUser ? selectedUser.key : undefined;
      const result = await mobileLogin(selectedRole.tier, savedPass, nameParam);
      login(selectedRole.role, result.name, result.jwt);
      setLocation("/dashboard");
    } catch { setError("Biometric failed. Enter your PIN manually."); }
    finally { setBioLoading(false); }
  };

  const handleForgetDevice = () => {
    if (!selectedRole) return;
    clearSavedPin(selectedRole.tier, selectedRole.tier === 1 ? selectedUser?.key : undefined);
    setPinSaved(false); setBioRegistered(false); setPassword("");
  };

  const step: "roles" | "name-picker" | "password" =
    !selectedRole ? "roles" : selectedRole.tier === 1 && !selectedUser ? "name-picker" : "password";

  const canShowBiometric = bioRegistered && pinSaved && bioAvailable;

  return (
    <div className="min-h-full flex flex-col" style={{ background: "#0c0c0e" }}>
      {/* Subtle top glow */}
      <div className="absolute inset-x-0 top-0 h-64 pointer-events-none"
        style={{ background: "radial-gradient(ellipse 80% 40% at 50% 0%, rgba(153,27,27,0.18) 0%, transparent 100%)" }} />

      <div className="relative z-10 flex flex-col flex-1 px-5 py-10 max-w-sm mx-auto w-full">

        {/* ── Logo & Header ───────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="flex flex-col items-center text-center mb-10"
        >
          {/* Badge */}
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#2a2a2a] to-[#111] border border-white/10 flex items-center justify-center mb-5 shadow-xl">
            <span className="text-red-600 font-black text-4xl leading-none" style={{ fontFamily: "Impact, sans-serif" }}>A</span>
          </div>

          <h1 className="text-[32px] font-black text-white tracking-[0.18em] leading-none mb-2">
            APATRIS
          </h1>
          <p className="text-[11px] text-red-500 font-semibold tracking-[0.22em] uppercase mb-1">
            {t("login.specialistWelding")}
          </p>
          <p className="text-[10px] text-white/20 font-mono tracking-wider">
            {t("login.workforceTerminal")}
          </p>
        </motion.div>

        {/* ── Auth card ───────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="flex-1 bg-[#141416] border border-white/[0.07] rounded-3xl overflow-hidden shadow-2xl"
        >
          {/* Red top line */}
          <div className="h-[2px] bg-gradient-to-r from-transparent via-red-600 to-transparent" />

          <div className="p-5">
            {/* Step label */}
            <p className="text-[10px] font-semibold text-white/25 tracking-[0.2em] uppercase mb-4">
              {step === "roles" ? t("login.selectDesignation") : step === "name-picker" ? t("login.selectProfile") : t("login.authenticate")}
            </p>

            <AnimatePresence mode="wait">

              {/* ── STEP 1: Role list ────────────────────────────────────── */}
              {step === "roles" && (
                <motion.div
                  key="roles"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.15 }}
                >
                  <motion.div variants={listVariants} initial="hidden" animate="show" className="space-y-2.5">
                    {ROLES.map((cfg) => {
                      const Icon = cfg.icon;
                      const hasSaved = hasSavedPin(cfg.tier) ||
                        (cfg.tier === 1 && T1_USERS.some(u => hasSavedPin(1, u.key)));
                      return (
                        <motion.button
                          key={cfg.role}
                          variants={rowVariants}
                          whileTap={{ scale: 0.975 }}
                          onClick={() => handleRoleSelect(cfg)}
                          className="w-full flex items-center gap-3.5 p-4 rounded-2xl bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.07] hover:border-white/10 active:bg-white/[0.09] transition-all duration-150 text-left"
                        >
                          <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-white/5", cfg.accent)}>
                            <Icon className="w-[18px] h-[18px]" strokeWidth={1.8} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-[13px] font-bold text-white leading-tight truncate">{t(`roles.${cfg.role}`)}</span>
                              <span className={cn("text-[8px] font-black px-1.5 py-0.5 rounded-md shrink-0 tracking-widest", cfg.badge)}>
                                T{cfg.tier}
                              </span>
                            </div>
                            <p className="text-[11px] text-white/35 truncate">{t(`roleSubtitles.${cfg.role}`)}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {hasSaved && <Fingerprint className="w-3.5 h-3.5 text-emerald-500" />}
                            <ChevronRight className="w-4 h-4 text-white/20" />
                          </div>
                        </motion.button>
                      );
                    })}
                  </motion.div>
                </motion.div>
              )}

              {/* ── STEP 2: T1 Name picker ───────────────────────────────── */}
              {step === "name-picker" && selectedRole && (
                <motion.div
                  key="name-picker"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.15 }}
                >
                  <button onClick={handleBack} className="flex items-center gap-1.5 text-white/30 hover:text-white/60 transition-colors mb-5 text-xs">
                    <ArrowLeft className="w-3.5 h-3.5" /> {t("login.changeRole")}
                  </button>

                  {/* Selected role chip */}
                  <div className={cn("flex items-center gap-3 p-3.5 rounded-2xl bg-white/[0.03] border mb-5", selectedRole.borderColor)}>
                    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-white/5", selectedRole.accent)}>
                      <selectedRole.icon className="w-4 h-4" strokeWidth={1.8} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[12px] font-bold text-white/80 truncate block">{selectedRole.title}</span>
                    </div>
                    <span className={cn("text-[8px] font-black px-1.5 py-0.5 rounded-md tracking-widest shrink-0", selectedRole.badge)}>
                      T1
                    </span>
                  </div>

                  <div className="space-y-3">
                    {T1_USERS.map((u) => {
                      const bio = hasBiometric(1, u.key);
                      const saved = hasSavedPin(1, u.key);
                      return (
                        <motion.button
                          key={u.key}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => handleUserSelect(u)}
                          className={cn(
                            "w-full flex items-center gap-4 p-4 rounded-2xl bg-white/[0.04] border transition-all duration-150 text-left",
                            u.border
                          )}
                        >
                          <div className="w-11 h-11 rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center shrink-0">
                            <span className={cn("text-sm font-black", u.accent)}>{u.initials}</span>
                          </div>
                          <div className="flex-1">
                            <div className="text-sm font-bold text-white">{u.name}</div>
                            <div className="text-[11px] text-white/35 mt-0.5">{u.role} · Executive Board</div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {bio && bioAvailable && <Fingerprint className="w-3.5 h-3.5 text-emerald-500" />}
                            {saved && !bio && <Lock className="w-3.5 h-3.5 text-white/30" />}
                            <ChevronRight className="w-4 h-4 text-white/20" />
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>
                </motion.div>
              )}

              {/* ── STEP 3: PIN / Password ───────────────────────────────── */}
              {step === "password" && selectedRole && (
                <motion.div
                  key="password"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.15 }}
                >
                  <button onClick={handleBack} className="flex items-center gap-1.5 text-white/30 hover:text-white/60 transition-colors mb-5 text-xs">
                    <ArrowLeft className="w-3.5 h-3.5" />
                    {selectedRole.tier === 1 ? t("login.changeProfile") : t("login.changeRole")}
                  </button>

                  {/* Identity chip */}
                  <div className={cn("flex items-center gap-3 p-3.5 rounded-2xl bg-white/[0.03] border mb-5", selectedRole.borderColor)}>
                    {selectedUser ? (
                      <div className="w-9 h-9 rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center shrink-0">
                        <span className={cn("text-xs font-black", selectedRole.accent)}>{selectedUser.initials}</span>
                      </div>
                    ) : (
                      <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-white/5", selectedRole.accent)}>
                        <selectedRole.icon className="w-4 h-4" strokeWidth={1.8} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-bold text-white/90 truncate">
                        {selectedUser ? selectedUser.name : selectedRole.title}
                      </div>
                      {selectedUser && (
                        <div className="text-[11px] text-white/30 mt-0.5">{selectedUser.role} · Executive Board</div>
                      )}
                    </div>
                    <span className={cn("text-[8px] font-black px-1.5 py-0.5 rounded-md tracking-widest shrink-0", selectedRole.badge)}>
                      T{selectedRole.tier}
                    </span>
                  </div>

                  {/* Biometric button */}
                  <AnimatePresence>
                    {canShowBiometric && (
                      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mb-4">
                        <button
                          type="button"
                          onClick={handleBiometric}
                          disabled={bioLoading}
                          className={cn(
                            "w-full flex flex-col items-center gap-2 py-6 rounded-2xl border transition-all duration-200",
                            bioSuccess
                              ? "bg-emerald-500/10 border-emerald-500/30"
                              : "bg-white/[0.04] border-white/[0.07] hover:bg-white/[0.07] hover:border-white/10 active:scale-[0.98]"
                          )}
                        >
                          {bioSuccess ? (
                            <><CheckCircle2 className="w-8 h-8 text-emerald-400" /><span className="text-xs font-bold text-emerald-400 tracking-wider">{t("login.verified")}</span></>
                          ) : bioLoading ? (
                            <><div className="w-7 h-7 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" /><span className="text-xs text-white/30">{t("login.scanning")}</span></>
                          ) : (
                            <>
                              <Fingerprint className="w-9 h-9 text-white/50" strokeWidth={1.4} />
                              <span className="text-sm font-semibold text-white/70">{t("login.signInBiometrics")}</span>
                              <span className="text-[10px] text-white/25">{t("login.touchFaceId")}</span>
                            </>
                          )}
                        </button>
                        <div className="flex items-center gap-3 my-4">
                          <div className="h-px flex-1 bg-white/[0.06]" />
                          <span className="text-[10px] text-white/20 tracking-wider">{t("login.orEnterPin")}</span>
                          <div className="h-px flex-1 bg-white/[0.06]" />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* PIN form */}
                  <form onSubmit={handleSubmit} className="space-y-3">
                    <div>
                      <label className="text-[10px] font-semibold text-white/30 tracking-[0.15em] uppercase block mb-2">
                        {selectedRole.tier === 1 ? t("login.accessPassword") : t("login.tierPin")}
                      </label>
                      <div className="relative">
                        <input
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => { setPassword(e.target.value); setError(null); }}
                          placeholder={selectedRole.tier === 1 ? t("login.enterPassword") : t("login.enterTierPin")}
                          autoFocus={!canShowBiometric}
                          className={cn(
                            "w-full bg-white/[0.05] border rounded-2xl px-4 py-3.5 pr-12",
                            "text-white text-sm placeholder:text-white/20",
                            "outline-none focus:ring-1 transition-all",
                            error
                              ? "border-red-500/50 focus:ring-red-500/20"
                              : "border-white/[0.08] focus:border-white/20 focus:ring-white/10"
                          )}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(v => !v)}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/50 transition-colors"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <AnimatePresence>
                        {error && (
                          <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                            className="text-red-400 text-xs mt-2"
                          >
                            {error}
                          </motion.p>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Remember device */}
                    {!pinSaved && (
                      <button
                        type="button"
                        onClick={() => setRememberDevice(v => !v)}
                        className={cn(
                          "w-full flex items-center gap-3 p-3.5 rounded-2xl border transition-all text-left",
                          rememberDevice
                            ? "bg-emerald-500/[0.08] border-emerald-500/20"
                            : "bg-white/[0.03] border-white/[0.06] hover:border-white/10"
                        )}
                      >
                        <div className={cn(
                          "w-4.5 w-[18px] h-[18px] rounded-md border-2 flex items-center justify-center shrink-0 transition-all",
                          rememberDevice ? "bg-emerald-500 border-emerald-500" : "border-white/20"
                        )}>
                          {rememberDevice && <CheckCircle2 className="w-3 h-3 text-white" />}
                        </div>
                        <div className="flex-1">
                          <div className="text-[12px] font-semibold text-white/60">{t("login.rememberDevice")}</div>
                          <div className="text-[10px] text-white/25 mt-0.5">
                            {bioAvailable ? t("login.enableBiometric") : t("login.saveCredentials")}
                          </div>
                        </div>
                        {bioAvailable && rememberDevice && <Fingerprint className="w-4 h-4 text-emerald-400 shrink-0" />}
                      </button>
                    )}

                    {/* Forget device */}
                    {pinSaved && (
                      <button
                        type="button"
                        onClick={handleForgetDevice}
                        className="w-full flex items-center gap-2.5 p-3 rounded-xl border border-white/[0.04] hover:border-red-500/20 hover:bg-red-500/[0.05] transition-all text-left"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-white/25" />
                        <span className="text-[11px] text-white/25">{t("login.forgetDevice")}</span>
                      </button>
                    )}

                    <motion.button
                      type="submit"
                      disabled={!password.trim() || loading}
                      whileTap={{ scale: 0.98 }}
                      className={cn(
                        "w-full py-4 rounded-2xl text-sm font-bold tracking-wide transition-all duration-200",
                        !password.trim() || loading
                          ? "bg-white/[0.05] text-white/20 cursor-not-allowed"
                          : "bg-red-600 hover:bg-red-500 active:bg-red-700 text-white shadow-[0_4px_16px_rgba(220,38,38,0.3)]"
                      )}
                    >
                      {loading ? (
                        <span className="flex items-center justify-center gap-2">
                          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          {t("login.verifying")}
                        </span>
                      ) : t("login.authenticateBtn")}
                    </motion.button>
                  </form>

                  <p className="text-center text-[10px] text-white/15 mt-5">
                    {t("login.contactAdmin")}
                  </p>
                </motion.div>
              )}

            </AnimatePresence>
          </div>
        </motion.div>

        {/* Footer */}
        <p className="text-center text-[9px] text-white/10 mt-6 tracking-widest uppercase">
          Apatris Sp. z o.o. · NIP 5252828706
        </p>
      </div>
    </div>
  );
}
