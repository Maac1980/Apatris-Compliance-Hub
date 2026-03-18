import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useEffect } from "react";
import { LogOut, LayoutDashboard } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export function DashboardPage() {
  const { role, logout, isReady } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isReady && !role) {
      setLocation("/");
    }
  }, [role, isReady, setLocation]);

  if (!role) return null;

  const handleLogout = () => {
    logout();
    setLocation("/");
  };

  // Map roles to their specific UI accent colors for the header dot
  const roleColors: Record<string, string> = {
    Owner: "bg-indigo-500",
    Manager: "bg-blue-500",
    Office: "bg-emerald-500",
    Worker: "bg-amber-500",
  };

  const dotColor = roleColors[role] || "bg-primary";

  return (
    <div className="flex flex-col min-h-full bg-gray-50">
      {/* Header */}
      <header className="h-16 bg-white border-b border-border shadow-sm px-5 flex items-center justify-between shrink-0 sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-8 h-8 rounded-full bg-gray-50 border border-gray-100">
            <div className={cn("w-2.5 h-2.5 rounded-full shadow-sm animate-pulse", dotColor)} />
          </div>
          <h1 className="text-lg font-bold text-foreground tracking-tight">
            {role} Dashboard
          </h1>
        </div>
        
        <button 
          onClick={handleLogout}
          className="w-10 h-10 rounded-full flex items-center justify-center text-muted-foreground hover:bg-gray-50 hover:text-foreground active:scale-95 transition-all"
          title="Sign out"
        >
          <LogOut className="w-5 h-5" strokeWidth={2} />
        </button>
      </header>

      {/* Content */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="max-w-xs mx-auto bg-white p-8 rounded-3xl shadow-sm border border-border"
        >
          <div className="w-20 h-20 bg-primary/5 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <LayoutDashboard className="w-10 h-10 text-primary opacity-80" strokeWidth={1.5} />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-3">
            Welcome, {role}
          </h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Your specialized dashboard is loading in the next phase. This foundation is ready for Airtable integration.
          </p>
        </motion.div>
      </main>
    </div>
  );
}
