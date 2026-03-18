import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Role } from "@/types";
import { motion } from "framer-motion";
import {
  Crown, Scale, Wrench, ClipboardList, HardHat, ChevronRight,
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
  },
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

  const handleLogin = (role: Role) => {
    login(role);
    setLocation("/dashboard");
  };

  return (
    <div
      className="flex flex-col min-h-full relative overflow-hidden"
      style={{ background: "#0d0d0d" }}
    >
      {/* Dot-grid overlay — matches Apatris dashboard */}
      <div
        className="absolute inset-0 opacity-[0.12] pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />

      {/* Subtle top vignette */}
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/60 to-transparent pointer-events-none" />
      {/* Subtle bottom vignette */}
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />

      <div className="relative z-10 flex flex-col min-h-full px-6 py-10">

        {/* Brand header — identical style to Apatris dashboard */}
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

        {/* Divider — "WORKFORCE DEPLOYMENT TERMINAL" */}
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

        {/* Role selector panel */}
        <div className="bg-gray-900/80 border border-white/10 rounded-2xl p-5 shadow-2xl backdrop-blur-sm flex-1">
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
                  onClick={() => handleLogin(cfg.role)}
                  className={cn(
                    "w-full flex items-center gap-3 p-3.5 rounded-xl text-left",
                    "bg-gray-800/60 border border-white/[0.07]",
                    "hover:bg-gray-700/60 hover:border-white/15",
                    "active:bg-gray-700/80 transition-all duration-200 shadow-md",
                    cfg.glow
                  )}
                >
                  {/* Colored left accent stripe */}
                  <div className={cn("w-0.5 self-stretch rounded-full border-l-2", cfg.accent.split(" ")[0])} />

                  {/* Icon */}
                  <div className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                    "bg-white/5 border border-white/10",
                    cfg.accent.split(" ")[1]
                  )}>
                    <Icon className="w-5 h-5" strokeWidth={1.8} />
                  </div>

                  {/* Text */}
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
        </div>

        {/* Footer */}
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
