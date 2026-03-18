import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useEffect, useState } from "react";
import { LogOut, Bell, User, LayoutDashboard, Search, FileText, Clock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { OwnerHome } from "@/components/tabs/OwnerHome";
import { ManagerHome } from "@/components/tabs/ManagerHome";
import { WorkersTab } from "@/components/tabs/WorkersTab";
import { BottomNav } from "@/components/BottomNav";

export function DashboardPage() {
  const { role, logout, isReady } = useAuth();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("home");

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

  // Map roles to their specific UI accent colors
  const roleColors: Record<string, string> = {
    Owner: "bg-indigo-100 text-indigo-700 border-indigo-200",
    Manager: "bg-blue-100 text-blue-700 border-blue-200",
    Office: "bg-emerald-100 text-emerald-700 border-emerald-200",
    Worker: "bg-amber-100 text-amber-700 border-amber-200",
  };

  const badgeColor = roleColors[role] || "bg-primary/10 text-primary border-primary/20";

  const renderContent = () => {
    if (activeTab === "home") {
      if (role === "Owner" || role === "Office") return <OwnerHome />;
      if (role === "Manager") return <ManagerHome />;
      return (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="flex-1 flex flex-col items-center justify-center p-6 text-center h-full"
        >
          <div className="w-20 h-20 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <LayoutDashboard className="w-10 h-10 text-gray-400" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">Worker Home Coming Soon</h2>
          <p className="text-muted-foreground text-sm">Your assignments will appear here.</p>
        </motion.div>
      );
    }
    
    if (activeTab === "workers") {
      return <WorkersTab />;
    }

    if (activeTab === "alerts") {
      return (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="flex-1 flex flex-col items-center justify-center p-6 text-center h-full"
        >
          <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Bell className="w-8 h-8 text-amber-500" />
          </div>
          <h2 className="text-lg font-bold text-foreground mb-2">Alerts Coming Soon</h2>
        </motion.div>
      );
    }

    if (activeTab === "profile") {
      return (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="flex-1 flex flex-col items-center justify-center p-6 text-center h-full"
        >
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <User className="w-8 h-8 text-gray-400" />
          </div>
          <h2 className="text-lg font-bold text-foreground mb-2">Profile Coming Soon</h2>
        </motion.div>
      );
    }

    if (activeTab === "docs") {
      return (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="flex-1 flex flex-col items-center justify-center p-6 text-center h-full"
        >
          <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8 text-blue-500" />
          </div>
          <h2 className="text-lg font-bold text-foreground mb-2">Documents Coming Soon</h2>
        </motion.div>
      );
    }

    if (activeTab === "timesheet") {
      return (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="flex-1 flex flex-col items-center justify-center p-6 text-center h-full"
        >
          <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Clock className="w-8 h-8 text-emerald-500" />
          </div>
          <h2 className="text-lg font-bold text-foreground mb-2">Timesheet Coming Soon</h2>
        </motion.div>
      );
    }

    return null;
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <header className="h-14 bg-white border-b border-border shadow-sm px-5 flex items-center justify-between shrink-0 sticky top-0 z-40">
        <div className="font-bold text-foreground tracking-tight text-lg">
          APATRIS
        </div>
        
        <div className="flex items-center gap-3">
          <div className={cn("px-2.5 py-0.5 rounded-full text-xs font-bold border", badgeColor)}>
            {role}
          </div>
          <button 
            onClick={handleLogout}
            className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-gray-50 hover:text-foreground active:scale-95 transition-all"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto no-scrollbar bg-gray-50 relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.15 }}
            className="h-full"
          >
            {renderContent()}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Bottom Navigation */}
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}