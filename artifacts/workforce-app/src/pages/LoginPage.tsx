import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { mobileLogin } from "@/lib/api";
import { Role } from "@/types";
import { motion, AnimatePresence } from "framer-motion";
import {
  Crown, Scale, Wrench, ClipboardList, HardHat, ChevronRight,
  ArrowLeft, Eye, EyeOff, Lock, User,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface RoleCard {
  role: Role;
  tier: number;
  title: string;
  subtitle: string;
  icon: React.ElementType;
  accent: string;
  badge: string;
  glow: string;
  borderColor: string;
}

const ROLES: RoleCard[] = [
  {
    role: "Executive",
    tier: 1,
    title: "Executive Board & Partners",
    subtitle: "Full platform access · Payroll · Financials",
    icon: Crown,
    accent: "border-indigo-500 text-indigo-400",
    badge: "bg-indigo-600 text-white",
    glow: "hover:shadow-indigo-900/40",
    borderColor: "border-indigo-500/40",
  },
  {
    role: "LegalHead",
    tier: 2,
    title: "Head of Legal & Compliance",
    subtitle: "Professional directory · PIP dossiers · Alerts",
    icon: Scale,
    accent: "border-violet-500 text-violet-400",
    badge: "bg-violet-600 text-white",
    glow: "hover:shadow-violet-900/40",
    borderColor: "border-violet-500/40",
  },
  {
    role: "TechOps",
    tier: 3,
    title: "Key Account & Technical Ops",
    subtitle: "Add Professionals · UDT · Site Deployments",
    icon: Wrench,
    accent: "border-blue-500 text-blue-400",
    badge: "bg-blue-600 text-white",
    glow: "hover:shadow-blue-900/40",
    borderColor: "border-blue-500/40",
  },
  {
    role: "Coordinator",
    tier: 4,
    title: "Compliance Coordinator",
    subtitle: "Professionals · Doc queue · Operational modules",
    icon: ClipboardList,
    accent: "border-emerald-500 text-emerald-400",
    badge: "bg-emerald-600 text-white",
    glow: "hover:shadow-emerald-900/40",
    borderColor: "border-emerald-500/40",
  },
  {
    role: "Professional",
    tier: 5,
    title: "Deployed Professional",
    subtitle: "My profile · Submit hours · Upload documents",
    icon: HardHat,
    accent: "border-amber-500 text-amber-400",
    badge: "bg-amber-500 text-white",
    glow: "hover:shadow-amber-900/40",
    borderColor: "border-amber-500/40",
  },
];

const T1_USERS = [
  { name: "Akshay", key: "akshay", initials: "AK", color: "border-indigo-500/50 hover:border-indigo-400 text-indigo-300" },
  { name: "Manish", key: "manish", initials: "MN", color: "border-violet-500/50 hover:border-violet-400 text-violet-300" },
];

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.07, delayChildren: 0.25 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 260, damping: 24 } },
};

export function LoginPage() {
  const { login } = useAuth();
  const [, setLocation] = useLocation();

  const [selectedRole, setSelectedRole] = useState<RoleCard | null>(null);
  const [selectedUser, setSelectedUser]  = useState<typeof T1_USERS[number] | null>(null);
  const [password, setPassword]          = useState("");
  const [showPassword, setShowPassword]  = useState(false);
  const [loading, setLoading]            = useState(false);
  const [error, setError]                = useState<string | null>(null);

  const handleRoleSelect = (card: RoleCard) => {
    setSelectedRole(card);
    setSelectedUser(null);
    setPassword("");
    setError(null);
  };

  const handleUserSelect = (u: typeof T1_USERS[number]) => {
    setSelectedUser(u);
    setPassword("");
    setError(null);
  };

  const handleBack = () => {
    if (selectedUser) {
      // On password screen for T1 → back to name picker
      setSelectedUser(null);
      setPassword("");
      setError(null);
    } else {
      // On name picker or T2-T5 password screen → back to role list
      setSelectedRole(null);
      setPassword("");
      setError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRole || !password.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const nameParam = selectedRole.tier === 1 && selectedUser ? selectedUser.key : undefined;
      const result = await mobileLogin(selectedRole.tier, password.trim(), nameParam);
      login(selectedRole.role, result.name, result.jwt);
      setLocation("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setLoading(false);
    }
  };

  // Determine which step we're on
  const step: "roles" | "name-picker" | "password" =
    !selectedRole
      ? "roles"
      : selectedRole.tier === 1 && !selectedUser
        ? "name-picker"
        : "password";

  const passwordLabel = selectedRole?.tier === 1
    ? `Welcome, ${selectedUser?.name ?? ""}`
    : selectedRole?.tier === 1
      ? "Access password"
      : "Tier PIN";

  return (
    <div
      className="flex flex-col min-h-full relative overflow-hidden"
      style={{ background: "#0d0d0d" }}
    >
      <div
        className="absolute inset-0 opacity-[0.12] pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/60 to-transparent pointer-events-none" />
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />

      <div className="relative z-10 flex flex-col min-h-full px-6 py-10">

        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="text-center mb-8 pt-4"
        >
          <div className="w-12 h-1 bg-red-600 mx-auto mb-6 rounded-full" />
          <h1 className="text-4xl font-bold text-white tracking-[0.2em] uppercase leading-none">
            APATRIS
          </h1>
          <p className="text-gray-400 text-xs tracking-wider uppercase mt-3 leading-snug">
            Precision Welding Outsourcing.&nbsp;Your vision, expertly welded.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="flex items-center gap-3 mb-6"
        >
          <div className="h-px flex-1 bg-gradient-to-r from-transparent to-white/10" />
          <span className="text-gray-500 font-mono text-[10px] tracking-widest uppercase whitespace-nowrap">
            Workforce Deployment Terminal
          </span>
          <div className="h-px flex-1 bg-gradient-to-l from-transparent to-white/10" />
        </motion.div>

        <div className="bg-gray-900/80 border border-white/10 rounded-2xl p-5 shadow-2xl backdrop-blur-sm flex-1">

          <AnimatePresence mode="wait">

            {/* ── STEP 1: Role selector ──────────────────────────────────── */}
            {step === "roles" && (
              <motion.div
                key="role-select"
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.2 }}
              >
                <p className="text-[10px] font-mono text-gray-500 tracking-widest uppercase mb-4">
                  Select your designation
                </p>

                <motion.div
                  variants={containerVariants}
                  initial="hidden"
                  animate="show"
                  className="space-y-2.5"
                >
                  {ROLES.map((cfg) => {
                    const Icon = cfg.icon;
                    return (
                      <motion.button
                        key={cfg.role}
                        variants={itemVariants}
                        whileTap={{ scale: 0.975 }}
                        onClick={() => handleRoleSelect(cfg)}
                        className={cn(
                          "w-full flex items-center gap-3 p-3.5 rounded-xl text-left",
                          "bg-gray-800/60 border border-white/[0.07]",
                          "hover:bg-gray-700/60 hover:border-white/15",
                          "active:bg-gray-700/80 transition-all duration-200 shadow-md",
                          cfg.glow
                        )}
                      >
                        <div className={cn("w-0.5 self-stretch rounded-full border-l-2", cfg.accent.split(" ")[0])} />
                        <div className={cn(
                          "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                          "bg-white/5 border border-white/10",
                          cfg.accent.split(" ")[1]
                        )}>
                          <Icon className="w-5 h-5" strokeWidth={1.8} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-[13px] font-bold text-white leading-tight truncate">
                              {cfg.title}
                            </span>
                            <span className={cn(
                              "text-[9px] font-black px-1.5 py-0.5 rounded-full shrink-0 tracking-wide",
                              cfg.badge
                            )}>
                              T{cfg.tier}
                            </span>
                          </div>
                          <p className="text-[11px] text-gray-400 font-medium leading-tight truncate">
                            {cfg.subtitle}
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-600 shrink-0" />
                      </motion.button>
                    );
                  })}
                </motion.div>
              </motion.div>
            )}

            {/* ── STEP 2: T1 Name picker ─────────────────────────────────── */}
            {step === "name-picker" && selectedRole && (
              <motion.div
                key="name-picker"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 16 }}
                transition={{ duration: 0.2 }}
              >
                <button
                  onClick={handleBack}
                  className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors mb-5 text-xs font-medium"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Change role
                </button>

                {/* Role preview */}
                <div className={cn(
                  "flex items-center gap-3 p-3.5 rounded-xl mb-6",
                  "bg-gray-800/80 border",
                  selectedRole.borderColor
                )}>
                  <div className={cn("w-0.5 self-stretch rounded-full border-l-2", selectedRole.accent.split(" ")[0])} />
                  <div className={cn(
                    "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
                    "bg-white/5 border border-white/10",
                    selectedRole.accent.split(" ")[1]
                  )}>
                    <selectedRole.icon className="w-4 h-4" strokeWidth={1.8} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-bold text-white truncate">{selectedRole.title}</span>
                      <span className={cn("text-[9px] font-black px-1.5 py-0.5 rounded-full shrink-0", selectedRole.badge)}>
                        T1
                      </span>
                    </div>
                  </div>
                </div>

                <p className="text-[10px] font-mono text-gray-500 tracking-widest uppercase mb-4">
                  Select your profile
                </p>

                <div className="space-y-3">
                  {T1_USERS.map((u) => (
                    <motion.button
                      key={u.key}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => handleUserSelect(u)}
                      className={cn(
                        "w-full flex items-center gap-4 p-4 rounded-xl text-left",
                        "bg-gray-800/60 border transition-all duration-200",
                        u.color
                      )}
                    >
                      <div className="w-11 h-11 rounded-full bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                        <span className="text-sm font-black text-white/70">{u.initials}</span>
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-bold text-white">{u.name}</div>
                        <div className="text-[11px] text-gray-500 font-medium mt-0.5">Executive Board · Partner</div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-600 shrink-0" />
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}

            {/* ── STEP 3: Password / PIN ─────────────────────────────────── */}
            {step === "password" && selectedRole && (
              <motion.div
                key="password-entry"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 16 }}
                transition={{ duration: 0.2 }}
              >
                <button
                  onClick={handleBack}
                  className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors mb-5 text-xs font-medium"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  {selectedRole.tier === 1 ? "Change profile" : "Change role"}
                </button>

                {/* Selected identity preview */}
                <div className={cn(
                  "flex items-center gap-3 p-3.5 rounded-xl mb-6",
                  "bg-gray-800/80 border",
                  selectedRole.borderColor
                )}>
                  <div className={cn("w-0.5 self-stretch rounded-full border-l-2", selectedRole.accent.split(" ")[0])} />
                  {selectedUser ? (
                    <div className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                      <span className="text-xs font-black text-white/70">{selectedUser.initials}</span>
                    </div>
                  ) : (
                    <div className={cn(
                      "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
                      "bg-white/5 border border-white/10",
                      selectedRole.accent.split(" ")[1]
                    )}>
                      <selectedRole.icon className="w-4 h-4" strokeWidth={1.8} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-bold text-white truncate">
                        {selectedUser ? selectedUser.name : selectedRole.title}
                      </span>
                      <span className={cn("text-[9px] font-black px-1.5 py-0.5 rounded-full shrink-0", selectedRole.badge)}>
                        T{selectedRole.tier}
                      </span>
                    </div>
                    {selectedUser && (
                      <div className="text-[11px] text-gray-500 mt-0.5">Executive Board · Partner</div>
                    )}
                  </div>
                </div>

                {/* Password form */}
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="text-[10px] font-mono text-gray-500 tracking-widest uppercase block mb-2">
                      <Lock className="w-3 h-3 inline mr-1.5 mb-0.5" />
                      {selectedRole.tier === 1 ? "Access password" : "Tier PIN"}
                    </label>

                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          setError(null);
                        }}
                        placeholder={selectedRole.tier === 1 ? "Enter your password" : "Enter tier PIN"}
                        autoFocus
                        className={cn(
                          "w-full bg-gray-800/60 border rounded-xl px-4 py-3.5 pr-12",
                          "text-white text-sm font-mono placeholder:text-gray-600",
                          "outline-none focus:ring-2 transition-all",
                          error
                            ? "border-red-500/60 focus:ring-red-500/30"
                            : "border-white/10 focus:border-white/20 focus:ring-white/10"
                        )}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>

                    <AnimatePresence>
                      {error && (
                        <motion.p
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          className="text-red-400 text-[11px] mt-2 font-medium"
                        >
                          {error}
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </div>

                  <motion.button
                    type="submit"
                    disabled={!password.trim() || loading}
                    whileTap={{ scale: 0.97 }}
                    className={cn(
                      "w-full py-3.5 rounded-xl text-sm font-bold tracking-wide transition-all duration-200",
                      "border border-white/10",
                      !password.trim() || loading
                        ? "bg-gray-800/40 text-gray-600 cursor-not-allowed"
                        : "bg-white text-gray-900 hover:bg-gray-100 active:bg-gray-200 shadow-lg"
                    )}
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                        Verifying...
                      </span>
                    ) : (
                      "Authenticate"
                    )}
                  </motion.button>
                </form>

                <p className="text-center text-[10px] text-gray-600 mt-5">
                  Contact your administrator if you don&apos;t have access credentials.
                </p>
              </motion.div>
            )}

          </AnimatePresence>
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9, duration: 0.5 }}
          className="text-center text-[10px] font-mono text-gray-600 mt-6"
        >
          UNAUTHORIZED ACCESS IS STRICTLY PROHIBITED
        </motion.p>
        <p className="text-center text-[10px] font-mono text-gray-700 mt-1">
          APATRIS SP. Z O.O. · NIP: 5252828706
        </p>
      </div>
    </div>
  );
}
