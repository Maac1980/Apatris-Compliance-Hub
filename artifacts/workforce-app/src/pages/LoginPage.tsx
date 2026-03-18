import { useState, useEffect, useCallback } from "react";
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
  ShieldAlert, MapPin, Layers, Cpu, Hammer,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Data ────────────────────────────────────────────────────────────────────────

interface RoleCard {
  role: Role; tier: number; title: string; subtitle: string;
  icon: React.ElementType; accentL: string; accentR: string;
  badge: string; borderColor: string;
}

const ROLES: RoleCard[] = [
  { role: "Executive",   tier: 1, title: "Executive Board & Partners",   subtitle: "Full platform · Payroll · Financials",       icon: Crown,        accentL: "border-indigo-600", accentR: "text-indigo-400", badge: "bg-indigo-700 text-white",  borderColor: "border-indigo-600/40" },
  { role: "LegalHead",   tier: 2, title: "Head of Legal & Compliance",   subtitle: "PIP dossiers · Directory · Alerts",          icon: Scale,        accentL: "border-violet-600", accentR: "text-violet-400", badge: "bg-violet-700 text-white",  borderColor: "border-violet-600/40" },
  { role: "TechOps",     tier: 3, title: "Key Account & Technical Ops",  subtitle: "Add Professionals · UDT · Site Deployments", icon: Wrench,       accentL: "border-blue-600",   accentR: "text-blue-400",   badge: "bg-blue-700 text-white",    borderColor: "border-blue-600/40" },
  { role: "Coordinator", tier: 4, title: "Compliance Coordinator",       subtitle: "Professionals · Doc queue · Operations",     icon: ClipboardList, accentL: "border-emerald-600", accentR: "text-emerald-400", badge: "bg-emerald-700 text-white", borderColor: "border-emerald-600/40" },
  { role: "Professional",tier: 5, title: "Deployed Professional",        subtitle: "My profile · Submit hours · Documents",      icon: HardHat,      accentL: "border-amber-500",  accentR: "text-amber-400",  badge: "bg-amber-600 text-white",   borderColor: "border-amber-500/40" },
];

const T1_USERS = [
  { name: "Manish", key: "manish", initials: "MN", role: "Founder & CEO", color: "border-indigo-600/50 hover:border-indigo-400 text-indigo-300" },
  { name: "Akshay", key: "akshay", initials: "AK", role: "Partner",       color: "border-violet-600/50 hover:border-violet-400 text-violet-300" },
];

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 280, damping: 26 } },
};

// ── Rivet decoration ─────────────────────────────────────────────────────────
function Rivet({ className }: { className?: string }) {
  return (
    <div className={cn("w-2.5 h-2.5 rounded-full bg-stone-500 border border-stone-800 shadow-[inset_1px_1px_2px_rgba(255,255,255,0.35),0_1px_3px_rgba(0,0,0,0.8)] absolute z-20", className)} />
  );
}

// ── Left panel feature row ───────────────────────────────────────────────────
const FEATURES = [
  { icon: ShieldAlert, label: "ZUS/PIT Compliance",   sub: "Real-time monitoring" },
  { icon: MapPin,      label: "Multi-Site Ops",        sub: "4 active deployments" },
  { icon: Layers,      label: "5-Tier RBAC",           sub: "Enterprise access control" },
  { icon: Cpu,         label: "Airtable Backend",      sub: "Live sync · 200+ welders" },
  { icon: Hammer,      label: "Welder Certifications", sub: "UDT / Badania / BHP" },
];

// ── Component ────────────────────────────────────────────────────────────────
export function LoginPage() {
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

  const handleRoleSelect = (card: RoleCard) => {
    setSelectedRole(card); setSelectedUser(null); setPassword("");
    setError(null); setBioSuccess(false); setPinSaved(false); setBioRegistered(false);
  };
  const handleUserSelect = (u: typeof T1_USERS[number]) => {
    setSelectedUser(u); setPassword(""); setError(null);
    setBioSuccess(false); updateSavedState(1, u.key);
  };
  const handleBack = () => {
    if (selectedUser) {
      setSelectedUser(null); setPassword(""); setError(null);
      setBioSuccess(false); setPinSaved(false); setBioRegistered(false);
    } else {
      setSelectedRole(null); setPassword(""); setError(null);
      setBioSuccess(false); setPinSaved(false); setBioRegistered(false);
    }
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
      if (!passed) { setError("Biometric failed. Enter PIN manually."); return; }
      const savedPass = getSavedPin(selectedRole.tier, uKey);
      if (!savedPass) { setError("Saved credentials not found."); return; }
      setBioSuccess(true);
      await new Promise(r => setTimeout(r, 500));
      const nameParam = selectedRole.tier === 1 && selectedUser ? selectedUser.key : undefined;
      const result = await mobileLogin(selectedRole.tier, savedPass, nameParam);
      login(selectedRole.role, result.name, result.jwt);
      setLocation("/dashboard");
    } catch { setError("Biometric failed. Enter PIN manually."); }
    finally { setBioLoading(false); }
  };

  const handleForgetDevice = () => {
    if (!selectedRole) return;
    const uKey = selectedRole.tier === 1 ? selectedUser?.key : undefined;
    clearSavedPin(selectedRole.tier, uKey);
    setPinSaved(false); setBioRegistered(false); setPassword("");
  };

  const step: "roles" | "name-picker" | "password" =
    !selectedRole ? "roles" : selectedRole.tier === 1 && !selectedUser ? "name-picker" : "password";

  const canShowBiometric = bioRegistered && pinSaved && bioAvailable;

  // ── Industrial background ────────────────────────────────────────────────────
  const bgStyle: React.CSSProperties = {
    backgroundColor: "#0a0a0a",
    backgroundImage: [
      "radial-gradient(circle at 50% 0%, rgba(60,60,60,0.4) 0%, transparent 60%)",
      "radial-gradient(circle at 50% 100%, rgba(153,27,27,0.18) 0%, transparent 60%)",
      "radial-gradient(#1e1e1e 15%, transparent 16%)",
      "radial-gradient(#1e1e1e 15%, transparent 16%)",
    ].join(","),
    backgroundSize: "100% 100%, 100% 100%, 18px 18px, 18px 18px",
    backgroundPosition: "0 0, 0 0, 0 0, 9px 9px",
  };

  return (
    <div className="min-h-full flex items-center justify-center relative overflow-auto p-3 sm:p-6" style={bgStyle}>
      {/* Lighting overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/40 to-black/80 pointer-events-none" />

      {/* ── Main card ────────────────────────────────────────────────────────── */}
      <div className="relative z-10 w-full max-w-4xl">
        <div className="relative bg-[#111111]/95 backdrop-blur-xl border border-stone-700/50 rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.95),inset_0_1px_0_rgba(255,255,255,0.04)] overflow-hidden flex flex-col md:flex-row">

          {/* Red top accent */}
          <div className="absolute top-0 inset-x-0 h-[3px] bg-gradient-to-r from-red-900 via-red-600 to-red-900 z-30" />

          {/* Rivets */}
          <Rivet className="top-3.5 left-3.5 hidden md:block" />
          <Rivet className="top-3.5 right-3.5" />
          <Rivet className="bottom-3.5 left-3.5 hidden md:block" />
          <Rivet className="bottom-3.5 right-3.5" />

          {/* ── LEFT PANEL ─────────────────────────────────────────────────── */}
          <div className="hidden md:flex w-5/12 flex-col justify-between p-8 pt-11 border-r border-stone-800/70 bg-[#161616] shadow-[inset_-12px_0_24px_rgba(0,0,0,0.5)] relative">

            {/* Logo */}
            <div>
              <div className="flex items-center gap-4 mb-10">
                <div className="w-16 h-16 shrink-0 rounded-full border-[3px] border-stone-900 flex items-center justify-center bg-gradient-to-br from-stone-300 to-stone-500 shadow-[inset_0_2px_4px_rgba(255,255,255,0.45),0_4px_12px_rgba(0,0,0,0.9)]">
                  <span className="text-red-700 font-black text-4xl leading-none drop-shadow" style={{ fontFamily: "Impact, sans-serif" }}>A</span>
                </div>
                <div>
                  <h1 className="text-3xl font-black text-stone-100 tracking-widest leading-none drop-shadow">APATRIS</h1>
                  <p className="text-[10px] text-red-500 font-bold tracking-[0.25em] uppercase mt-1.5">Specialist Welding</p>
                  <p className="text-[10px] text-stone-500 font-mono tracking-widest mt-0.5">SP. Z O.O. · NIP 5252828706</p>
                </div>
              </div>

              <p className="text-stone-400 text-xs leading-relaxed mb-8 border-l-2 border-red-700/60 pl-3 italic">
                Precision welding outsourcing across Poland. Your vision, expertly welded — on time, fully compliant.
              </p>

              {/* Feature list */}
              <div className="space-y-3">
                {FEATURES.map(({ icon: Icon, label, sub }) => (
                  <div key={label} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-stone-800 border border-stone-700 flex items-center justify-center shrink-0 shadow-inner">
                      <Icon className="w-4 h-4 text-red-500" strokeWidth={1.8} />
                    </div>
                    <div>
                      <div className="text-[12px] font-bold text-stone-300 leading-tight">{label}</div>
                      <div className="text-[10px] text-stone-600 font-mono">{sub}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Left footer */}
            <div className="mt-8 pt-5 border-t border-stone-800/60">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-bold text-emerald-500 tracking-widest uppercase">System Online</span>
              </div>
              <p className="text-[9px] text-stone-700 font-mono tracking-wider uppercase">
                Secure · AES-256 Encrypted · GDPR Compliant
              </p>
            </div>
          </div>

          {/* ── RIGHT PANEL ────────────────────────────────────────────────── */}
          <div className="flex-1 flex flex-col p-6 pt-10 sm:p-8 sm:pt-11 min-h-0">

            {/* Mobile-only logo header */}
            <div className="flex md:hidden items-center gap-3 mb-7">
              <div className="w-11 h-11 shrink-0 rounded-full border-2 border-stone-800 flex items-center justify-center bg-gradient-to-br from-stone-300 to-stone-500 shadow-[inset_0_2px_4px_rgba(255,255,255,0.4),0_3px_8px_rgba(0,0,0,0.8)]">
                <span className="text-red-700 font-black text-2xl leading-none" style={{ fontFamily: "Impact, sans-serif" }}>A</span>
              </div>
              <div>
                <h1 className="text-2xl font-black text-stone-100 tracking-[0.2em] leading-none">APATRIS</h1>
                <p className="text-[9px] text-red-500 font-bold tracking-[0.2em] uppercase mt-1">Specialist Welding · Workforce Terminal</p>
              </div>
            </div>

            {/* Auth steps label */}
            <div className="flex items-center gap-3 mb-5">
              <div className="h-px flex-1 bg-stone-800" />
              <span className="text-[9px] font-mono text-stone-600 tracking-[0.25em] uppercase whitespace-nowrap">
                {step === "roles" ? "Select designation" : step === "name-picker" ? "Select profile" : "Authenticate"}
              </span>
              <div className="h-px flex-1 bg-stone-800" />
            </div>

            {/* ── Auth flow ────────────────────────────────────────────────── */}
            <div className="flex-1">
              <AnimatePresence mode="wait">

                {/* STEP 1: Role selector */}
                {step === "roles" && (
                  <motion.div
                    key="role-select"
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -12 }}
                    transition={{ duration: 0.18 }}
                  >
                    <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-2">
                      {ROLES.map((cfg) => {
                        const Icon = cfg.icon;
                        const hasSaved = hasSavedPin(cfg.tier) || (cfg.tier === 1 && T1_USERS.some(u => hasSavedPin(1, u.key)));
                        return (
                          <motion.button
                            key={cfg.role}
                            variants={itemVariants}
                            whileTap={{ scale: 0.975 }}
                            onClick={() => handleRoleSelect(cfg)}
                            className="w-full flex items-center gap-3 p-3.5 rounded-lg text-left bg-stone-900/80 border border-stone-800/80 hover:bg-stone-800/60 hover:border-stone-700 active:bg-stone-800 transition-all duration-150 shadow-md group"
                          >
                            <div className={cn("w-0.5 self-stretch rounded-full border-l-[3px]", cfg.accentL)} />
                            <div className={cn("w-9 h-9 rounded-md flex items-center justify-center shrink-0 bg-black/40 border border-white/8", cfg.accentR)}>
                              <Icon className="w-4.5 h-4.5 w-[18px]" strokeWidth={1.8} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-[13px] font-bold text-stone-200 leading-tight truncate">{cfg.title}</span>
                                <span className={cn("text-[8px] font-black px-1.5 py-0.5 rounded shrink-0 tracking-widest", cfg.badge)}>
                                  T{cfg.tier}
                                </span>
                              </div>
                              <p className="text-[10px] text-stone-500 font-mono truncate">{cfg.subtitle}</p>
                            </div>
                            <div className="flex flex-col items-end gap-1 shrink-0">
                              {hasSaved && <Fingerprint className="w-3 h-3 text-emerald-500" />}
                              <ChevronRight className="w-4 h-4 text-stone-700 group-hover:text-stone-500 transition-colors" />
                            </div>
                          </motion.button>
                        );
                      })}
                    </motion.div>
                  </motion.div>
                )}

                {/* STEP 2: T1 Name picker */}
                {step === "name-picker" && selectedRole && (
                  <motion.div
                    key="name-picker"
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 12 }}
                    transition={{ duration: 0.18 }}
                  >
                    <button onClick={handleBack} className="flex items-center gap-1.5 text-stone-500 hover:text-stone-300 transition-colors mb-5 text-xs font-mono tracking-wide">
                      <ArrowLeft className="w-3.5 h-3.5" /> CHANGE ROLE
                    </button>

                    {/* Role chip */}
                    <div className={cn("flex items-center gap-3 p-3 rounded-lg mb-5 bg-stone-900/80 border", selectedRole.borderColor)}>
                      <div className={cn("w-0.5 self-stretch rounded-full border-l-[3px]", selectedRole.accentL)} />
                      <div className={cn("w-8 h-8 rounded-md flex items-center justify-center shrink-0 bg-black/40 border border-white/8", selectedRole.accentR)}>
                        <selectedRole.icon className="w-4 h-4" strokeWidth={1.8} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-[11px] font-bold text-stone-300 truncate">{selectedRole.title}</span>
                      </div>
                      <span className={cn("text-[8px] font-black px-1.5 py-0.5 rounded tracking-widest shrink-0", selectedRole.badge)}>T1</span>
                    </div>

                    <div className="space-y-3">
                      {T1_USERS.map((u) => {
                        const bio = hasBiometric(1, u.key);
                        const saved = hasSavedPin(1, u.key);
                        return (
                          <motion.button
                            key={u.key}
                            whileTap={{ scale: 0.97 }}
                            onClick={() => handleUserSelect(u)}
                            className={cn(
                              "w-full flex items-center gap-4 p-4 rounded-lg text-left",
                              "bg-stone-900/80 border transition-all duration-150 group",
                              u.color
                            )}
                          >
                            <div className="w-12 h-12 rounded-full bg-stone-800 border-2 border-stone-700 flex items-center justify-center shrink-0 shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)]">
                              <span className="text-base font-black text-stone-300">{u.initials}</span>
                            </div>
                            <div className="flex-1">
                              <div className="text-sm font-bold text-stone-200">{u.name}</div>
                              <div className="text-[10px] text-stone-500 font-mono mt-0.5">Executive Board · {u.role}</div>
                            </div>
                            <div className="flex flex-col items-end gap-1 shrink-0">
                              {bio && bioAvailable && <Fingerprint className="w-3.5 h-3.5 text-emerald-500" />}
                              {saved && !bio && <Lock className="w-3.5 h-3.5 text-blue-400" />}
                              <ChevronRight className="w-4 h-4 text-stone-600 group-hover:text-stone-400 transition-colors" />
                            </div>
                          </motion.button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}

                {/* STEP 3: PIN / Password */}
                {step === "password" && selectedRole && (
                  <motion.div
                    key="password-entry"
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 12 }}
                    transition={{ duration: 0.18 }}
                  >
                    <button onClick={handleBack} className="flex items-center gap-1.5 text-stone-500 hover:text-stone-300 transition-colors mb-5 text-xs font-mono tracking-wide">
                      <ArrowLeft className="w-3.5 h-3.5" />
                      {selectedRole.tier === 1 ? "CHANGE PROFILE" : "CHANGE ROLE"}
                    </button>

                    {/* Identity badge */}
                    <div className={cn("flex items-center gap-3 p-3 rounded-lg mb-5 bg-stone-900/80 border", selectedRole.borderColor)}>
                      <div className={cn("w-0.5 self-stretch rounded-full border-l-[3px]", selectedRole.accentL)} />
                      {selectedUser ? (
                        <div className="w-9 h-9 rounded-full bg-stone-800 border border-stone-700 flex items-center justify-center shrink-0 shadow-inner">
                          <span className="text-xs font-black text-stone-300">{selectedUser.initials}</span>
                        </div>
                      ) : (
                        <div className={cn("w-9 h-9 rounded-md flex items-center justify-center shrink-0 bg-black/40 border border-white/8", selectedRole.accentR)}>
                          <selectedRole.icon className="w-4 h-4" strokeWidth={1.8} />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] font-bold text-stone-200 truncate">
                            {selectedUser ? selectedUser.name : selectedRole.title}
                          </span>
                          <span className={cn("text-[8px] font-black px-1.5 py-0.5 rounded tracking-widest shrink-0", selectedRole.badge)}>
                            T{selectedRole.tier}
                          </span>
                        </div>
                        {selectedUser && <div className="text-[10px] text-stone-500 font-mono mt-0.5">Executive Board · {selectedUser.role}</div>}
                      </div>
                    </div>

                    {/* Biometric button */}
                    <AnimatePresence>
                      {canShowBiometric && (
                        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mb-5">
                          <motion.button
                            type="button"
                            onClick={handleBiometric}
                            disabled={bioLoading}
                            whileTap={{ scale: 0.97 }}
                            className={cn(
                              "w-full flex flex-col items-center gap-2.5 py-5 rounded-lg border transition-all duration-200",
                              bioSuccess
                                ? "bg-emerald-900/30 border-emerald-600/40"
                                : "bg-stone-900/60 border-stone-700 hover:bg-stone-800/60 hover:border-stone-600"
                            )}
                          >
                            {bioSuccess ? (
                              <><CheckCircle2 className="w-8 h-8 text-emerald-400" /><span className="text-[11px] font-bold text-emerald-400 tracking-widest font-mono">IDENTITY CONFIRMED</span></>
                            ) : bioLoading ? (
                              <><div className="w-7 h-7 rounded-full border-2 border-stone-600 border-t-red-500 animate-spin" /><span className="text-[11px] font-bold text-stone-500 tracking-widest font-mono">SCANNING…</span></>
                            ) : (
                              <>
                                <Fingerprint className="w-10 h-10 text-stone-400" strokeWidth={1.4} />
                                <span className="text-[12px] font-bold text-stone-300 tracking-widest font-mono">BIOMETRIC SIGN-IN</span>
                                <span className="text-[9px] text-stone-600 font-mono">Touch sensor / Face ID</span>
                              </>
                            )}
                          </motion.button>
                          <div className="flex items-center gap-3 my-4">
                            <div className="h-px flex-1 bg-stone-800" />
                            <span className="text-[9px] text-stone-700 font-mono tracking-widest">OR ENTER PIN</span>
                            <div className="h-px flex-1 bg-stone-800" />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* PIN form */}
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div>
                        <label className="text-[9px] font-mono text-stone-600 tracking-[0.2em] uppercase block mb-2">
                          <Lock className="w-2.5 h-2.5 inline mr-1.5 mb-0.5" />
                          {selectedRole.tier === 1 ? "Access Password" : "Tier PIN"}
                        </label>
                        <div className="relative">
                          <input
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={(e) => { setPassword(e.target.value); setError(null); }}
                            placeholder={selectedRole.tier === 1 ? "Enter your password" : "Enter tier PIN"}
                            autoFocus={!canShowBiometric}
                            className={cn(
                              "w-full bg-stone-950 border rounded-lg px-4 py-3.5 pr-12",
                              "text-stone-200 text-sm font-mono placeholder:text-stone-700",
                              "outline-none focus:ring-1 transition-all",
                              error
                                ? "border-red-700/70 focus:ring-red-700/30"
                                : "border-stone-700 focus:border-stone-500 focus:ring-stone-600/20"
                            )}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(v => !v)}
                            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-stone-700 hover:text-stone-400 transition-colors"
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                        <AnimatePresence>
                          {error && (
                            <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                              className="text-red-500 text-[10px] mt-2 font-mono"
                            >
                              ⚠ {error}
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
                            "w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-left",
                            rememberDevice
                              ? "bg-emerald-950/40 border-emerald-800/40"
                              : "bg-stone-950 border-stone-800 hover:border-stone-700"
                          )}
                        >
                          <div className={cn(
                            "w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all",
                            rememberDevice ? "bg-emerald-600 border-emerald-600" : "border-stone-600"
                          )}>
                            {rememberDevice && <CheckCircle2 className="w-3 h-3 text-white" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[11px] font-bold text-stone-400">Remember this device</div>
                            <div className="text-[9px] text-stone-700 font-mono mt-0.5">
                              {bioAvailable ? "Enable biometric sign-in for next time" : "Save credentials locally"}
                            </div>
                          </div>
                          {bioAvailable && rememberDevice && <Fingerprint className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
                        </button>
                      )}

                      {/* Forget device */}
                      {pinSaved && (
                        <button
                          type="button"
                          onClick={handleForgetDevice}
                          className="w-full flex items-center gap-2 p-2.5 rounded-lg border border-stone-900 hover:border-red-900/40 hover:bg-red-950/20 transition-all text-left"
                        >
                          <Trash2 className="w-3 h-3 text-stone-700" />
                          <span className="text-[9px] text-stone-700 font-mono tracking-wide">FORGET SAVED LOGIN FOR THIS DEVICE</span>
                        </button>
                      )}

                      <motion.button
                        type="submit"
                        disabled={!password.trim() || loading}
                        whileTap={{ scale: 0.97 }}
                        className={cn(
                          "w-full py-3.5 rounded-lg text-sm font-bold tracking-[0.15em] transition-all duration-200 font-mono",
                          !password.trim() || loading
                            ? "bg-stone-900 text-stone-700 border border-stone-800 cursor-not-allowed"
                            : "bg-red-700 hover:bg-red-600 active:bg-red-800 text-white border border-red-600 shadow-[0_4px_12px_rgba(153,27,27,0.4)]"
                        )}
                      >
                        {loading ? (
                          <span className="flex items-center justify-center gap-2">
                            <span className="w-3.5 h-3.5 border-2 border-stone-500 border-t-white rounded-full animate-spin" />
                            VERIFYING...
                          </span>
                        ) : "AUTHENTICATE"}
                      </motion.button>
                    </form>

                    <p className="text-center text-[9px] text-stone-700 font-mono mt-4 tracking-wide">
                      Contact your administrator if you don&apos;t have access credentials.
                    </p>
                  </motion.div>
                )}

              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-[9px] font-mono text-stone-800 mt-4 tracking-[0.2em] uppercase">
          Unauthorized access is strictly prohibited · Apatris Sp. z o.o.
        </p>
      </div>
    </div>
  );
}
