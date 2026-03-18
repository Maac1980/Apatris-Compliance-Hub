import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Role, TIER_CONFIGS } from "@/types";
import { motion } from "framer-motion";
import {
  Briefcase,
  Crown,
  Scale,
  Wrench,
  ClipboardList,
  HardHat,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface LoginRoleConfig {
  role: Role;
  tier: number;
  title: string;
  subtitle: string;
  icon: React.ElementType;
  colors: {
    base: string;
    hover: string;
    border: string;
    icon: string;
    tierBadge: string;
  };
}

const roleConfig: LoginRoleConfig[] = [
  {
    role: "Executive",
    tier: 1,
    title: "Executive Board & Partners",
    subtitle: "Full platform access · Payroll · Financials",
    icon: Crown,
    colors: {
      base: "border-indigo-100 bg-white",
      hover: "hover:border-indigo-300 hover:bg-indigo-50/40 hover:shadow-indigo-100/50",
      border: "bg-indigo-600",
      icon: "text-indigo-600 bg-indigo-100",
      tierBadge: "bg-indigo-600 text-white",
    },
  },
  {
    role: "LegalHead",
    tier: 2,
    title: "Head of Legal & Compliance",
    subtitle: "Professional directory · PIP dossiers · Alerts",
    icon: Scale,
    colors: {
      base: "border-violet-100 bg-white",
      hover: "hover:border-violet-300 hover:bg-violet-50/40 hover:shadow-violet-100/50",
      border: "bg-violet-600",
      icon: "text-violet-600 bg-violet-100",
      tierBadge: "bg-violet-600 text-white",
    },
  },
  {
    role: "TechOps",
    tier: 3,
    title: "Key Account & Technical Operations",
    subtitle: "Add Professionals · UDT · Site Deployments",
    icon: Wrench,
    colors: {
      base: "border-blue-100 bg-white",
      hover: "hover:border-blue-300 hover:bg-blue-50/40 hover:shadow-blue-100/50",
      border: "bg-blue-600",
      icon: "text-blue-600 bg-blue-100",
      tierBadge: "bg-blue-600 text-white",
    },
  },
  {
    role: "Coordinator",
    tier: 4,
    title: "Compliance Coordinator",
    subtitle: "Professionals · Doc queue · Operational modules",
    icon: ClipboardList,
    colors: {
      base: "border-emerald-100 bg-white",
      hover: "hover:border-emerald-300 hover:bg-emerald-50/40 hover:shadow-emerald-100/50",
      border: "bg-emerald-600",
      icon: "text-emerald-600 bg-emerald-100",
      tierBadge: "bg-emerald-600 text-white",
    },
  },
  {
    role: "Professional",
    tier: 5,
    title: "Deployed Professional",
    subtitle: "My profile · Submit hours · Upload documents",
    icon: HardHat,
    colors: {
      base: "border-amber-100 bg-white",
      hover: "hover:border-amber-300 hover:bg-amber-50/40 hover:shadow-amber-100/50",
      border: "bg-amber-500",
      icon: "text-amber-600 bg-amber-100",
      tierBadge: "bg-amber-500 text-white",
    },
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.15 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 280, damping: 26 } },
};

export function LoginPage() {
  const { login } = useAuth();
  const [, setLocation] = useLocation();

  const handleLogin = (role: Role) => {
    login(role);
    setLocation("/dashboard");
  };

  return (
    <div className="flex flex-col min-h-full pb-6">
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="pt-14 pb-8 px-6 flex flex-col items-center text-center bg-white border-b border-border shadow-sm"
      >
        <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center mb-4 shadow-inner">
          <Briefcase className="w-7 h-7 text-indigo-600" strokeWidth={2.5} />
        </div>
        <h1 className="text-2xl font-black tracking-tight text-foreground leading-none mb-1">
          APATRIS
        </h1>
        <p className="text-muted-foreground text-sm font-medium">
          | Certified Welders
        </p>
        <p className="text-muted-foreground/70 text-xs font-medium mt-2">
          Workforce & Compliance Management
        </p>
      </motion.div>

      <div className="flex-1 px-4 pt-6 bg-gray-50/60">
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-4 px-1"
        >
          Select your designation
        </motion.p>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="space-y-3"
        >
          {roleConfig.map((config) => {
            const Icon = config.icon;
            return (
              <motion.button
                key={config.role}
                variants={itemVariants}
                whileHover={{ scale: 1.012 }}
                whileTap={{ scale: 0.988 }}
                onClick={() => handleLogin(config.role)}
                className={cn(
                  "w-full flex items-center p-3.5 text-left rounded-2xl border transition-all duration-250 shadow-sm relative overflow-hidden group",
                  config.colors.base,
                  config.colors.hover
                )}
              >
                <div className={cn("absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl", config.colors.border)} />

                <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center shrink-0 mr-3 ml-1 transition-transform group-hover:scale-105", config.colors.icon)}>
                  <Icon className="w-5 h-5" strokeWidth={2} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="text-sm font-bold text-foreground leading-tight truncate">
                      {config.title}
                    </h3>
                    <span className={cn("text-[9px] font-black px-1.5 py-0.5 rounded-full shrink-0 tracking-wide", config.colors.tierBadge)}>
                      T{config.tier}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground font-medium leading-tight truncate">
                    {config.subtitle}
                  </p>
                </div>

                <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-400 transition-colors shrink-0 ml-2" />
              </motion.button>
            );
          })}
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.9, duration: 0.5 }}
        className="pt-6 pb-2 text-center"
      >
        <p className="text-[10px] text-muted-foreground/50 font-medium">
          APATRIS SP. Z O.O. · NIP: 5252828706 · v2.0
        </p>
      </motion.div>
    </div>
  );
}
