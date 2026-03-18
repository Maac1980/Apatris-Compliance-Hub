import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Role } from "@/types";
import { motion } from "framer-motion";
import { 
  Briefcase, 
  Users, 
  Building, 
  HardHat,
  ChevronRight,
  ShieldHalf
} from "lucide-react";
import { cn } from "@/lib/utils";

const roleConfig: Array<{
  role: Role;
  title: string;
  subtitle: string;
  icon: React.ElementType;
  colors: {
    base: string;
    hover: string;
    border: string;
    icon: string;
    bg: string;
  };
}> = [
  {
    role: "Owner",
    title: "Owner",
    subtitle: "Full system access & analytics",
    icon: ShieldHalf,
    colors: {
      base: "border-indigo-100 bg-white",
      hover: "hover:border-indigo-300 hover:bg-indigo-50/50 hover:shadow-indigo-100",
      border: "bg-indigo-500",
      icon: "text-indigo-600 bg-indigo-100",
      bg: "bg-indigo-50",
    },
  },
  {
    role: "Manager",
    title: "Manager",
    subtitle: "Team oversight & scheduling",
    icon: Users,
    colors: {
      base: "border-blue-100 bg-white",
      hover: "hover:border-blue-300 hover:bg-blue-50/50 hover:shadow-blue-100",
      border: "bg-blue-500",
      icon: "text-blue-600 bg-blue-100",
      bg: "bg-blue-50",
    },
  },
  {
    role: "Office",
    title: "Office",
    subtitle: "Admin, payroll & documents",
    icon: Building,
    colors: {
      base: "border-emerald-100 bg-white",
      hover: "hover:border-emerald-300 hover:bg-emerald-50/50 hover:shadow-emerald-100",
      border: "bg-emerald-500",
      icon: "text-emerald-600 bg-emerald-100",
      bg: "bg-emerald-50",
    },
  },
  {
    role: "Worker",
    title: "Worker",
    subtitle: "My shifts, docs & timesheet",
    icon: HardHat,
    colors: {
      base: "border-amber-100 bg-white",
      hover: "hover:border-amber-300 hover:bg-amber-50/50 hover:shadow-amber-100",
      border: "bg-amber-500",
      icon: "text-amber-600 bg-amber-100",
      bg: "bg-amber-50",
    },
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.2 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } },
};

export function LoginPage() {
  const { login } = useAuth();
  const [, setLocation] = useLocation();

  const handleLogin = (role: Role) => {
    login(role);
    setLocation("/dashboard");
  };

  return (
    <div className="flex flex-col min-h-full pb-8">
      {/* Header Area */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="pt-16 pb-10 px-6 flex flex-col items-center text-center bg-white border-b border-border shadow-sm relative z-10"
      >
        <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-5 shadow-inner">
          <Briefcase className="w-8 h-8 text-primary" strokeWidth={2.5} />
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground mb-2">WorkForce</h1>
        <p className="text-muted-foreground text-sm font-medium">Staffing Management Platform</p>
      </motion.div>

      {/* Content Area */}
      <div className="flex-1 px-5 pt-8 bg-gray-50/50">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
        >
          <h2 className="text-[13px] font-bold uppercase tracking-widest text-muted-foreground mb-5 px-1">
            Select your role
          </h2>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="space-y-4"
        >
          {roleConfig.map((config) => {
            const Icon = config.icon;
            return (
              <motion.button
                key={config.role}
                variants={itemVariants}
                whileHover={{ scale: 1.015 }}
                whileTap={{ scale: 0.985 }}
                onClick={() => handleLogin(config.role)}
                className={cn(
                  "w-full flex items-center p-4 text-left rounded-2xl border transition-all duration-300 shadow-sm relative overflow-hidden group",
                  config.colors.base,
                  config.colors.hover
                )}
              >
                {/* Left accent border equivalent */}
                <div className={cn("absolute left-0 top-0 bottom-0 w-1.5 transition-colors", config.colors.border)} />
                
                <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center shrink-0 mr-4 transition-transform group-hover:scale-110", config.colors.icon)}>
                  <Icon className="w-6 h-6" strokeWidth={2} />
                </div>
                
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold text-foreground mb-0.5">
                    {config.title}
                  </h3>
                  <p className="text-xs text-muted-foreground truncate font-medium">
                    {config.subtitle}
                  </p>
                </div>
                
                <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center shrink-0 ml-3 group-hover:bg-white transition-colors border border-gray-100">
                  <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-foreground transition-colors" />
                </div>
              </motion.button>
            );
          })}
        </motion.div>
      </div>

      {/* Footer */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8, duration: 0.5 }}
        className="mt-auto pt-8 pb-4 text-center"
      >
        <p className="text-[11px] text-muted-foreground/60 font-medium">
          Workforce Management v1.0
        </p>
      </motion.div>
    </div>
  );
}
