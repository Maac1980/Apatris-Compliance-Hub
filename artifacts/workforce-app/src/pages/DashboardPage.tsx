import { KnowledgeCenter } from "@/components/KnowledgeCenter";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useEffect, useRef, useState } from "react";
import { LogOut } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Role, TIER_CONFIGS } from "@/types";
import { OwnerHome } from "@/components/tabs/OwnerHome";
import { ManagerHome } from "@/components/tabs/ManagerHome";
import { Tier3Home } from "@/components/tabs/Tier3Home";
import { Tier4Home } from "@/components/tabs/Tier4Home";
import { Tier5Home } from "@/components/tabs/Tier5Home";
import { PayrollModule } from "@/components/tabs/PayrollModule";
import { AlertsModule } from "@/components/tabs/AlertsModule";
import { SitesModule } from "@/components/tabs/SitesModule";
import { WorkersTab } from "@/components/tabs/WorkersTab";
import { ProfileTab } from "@/components/tabs/ProfileTab";
import { BottomNav } from "@/components/BottomNav";
import { TimesheetTab } from "@/components/tabs/TimesheetTab";
import { DocsTab } from "@/components/tabs/DocsTab";
import { GpsCheckinTab } from "@/components/tabs/GpsCheckinTab";
import { ContractTab } from "@/components/tabs/ContractTab";
import { ImmigrationTab } from "@/components/tabs/ImmigrationTab";
import { OnboardingTab } from "@/components/tabs/OnboardingTab";
import { CrmTab } from "@/components/tabs/CrmTab";
import { InvoiceTab } from "@/components/tabs/InvoiceTab";
import { ZusTab } from "@/components/tabs/ZusTab";
import { MatchingTab } from "@/components/tabs/MatchingTab";
import { MoodTab } from "@/components/tabs/MoodTab";
import { AdvancesTab } from "@/components/tabs/AdvancesTab";
import { SignaturesTab } from "@/components/tabs/SignaturesTab";
import { BenchTab } from "@/components/tabs/BenchTab";
import { GoogleCalendarTab } from "@/components/tabs/GoogleCalendarTab";
import { ContractGenTab } from "@/components/tabs/ContractGenTab";
import { LeaveTab } from "@/components/tabs/LeaveTab";
import { RoiTab } from "@/components/tabs/RoiTab";
import { FinesTab } from "@/components/tabs/FinesTab";
import { TrustTab } from "@/components/tabs/TrustTab";
import { ChurnTab } from "@/components/tabs/ChurnTab";
import { HousingTab } from "@/components/tabs/HousingTab";
import { RevenueTab } from "@/components/tabs/RevenueTab";
import { SalaryBenchTab } from "@/components/tabs/SalaryBenchTab";
import { LegalTab } from "@/components/tabs/LegalTab";
import { SafetyTab } from "@/components/tabs/SafetyTab";
import { CompetitorTab } from "@/components/tabs/CompetitorTab";
import { CountryTab } from "@/components/tabs/CountryTab";
import { FraudTab } from "@/components/tabs/FraudTab";
import { TranslateTab } from "@/components/tabs/TranslateTab";
import { MessagingTab } from "@/components/tabs/MessagingTab";
import { InsuranceTab } from "@/components/tabs/InsuranceTab";
import { SkillsGapTab } from "@/components/tabs/SkillsGapTab";
import { CareerTab } from "@/components/tabs/CareerTab";
import { MarginTab } from "@/components/tabs/MarginTab";
import { GeoTab } from "@/components/tabs/GeoTab";
import { SignalsTab } from "@/components/tabs/SignalsTab";
import { IdentityTab } from "@/components/tabs/IdentityTab";
import { GuaranteesTab } from "@/components/tabs/GuaranteesTab";
import { WhiteLabelTab } from "@/components/tabs/WhiteLabelTab";
import { FrameworksTab } from "@/components/tabs/FrameworksTab";
import { LegalKBTab } from "@/components/tabs/LegalKBTab";
import { BillingTab } from "@/components/tabs/BillingTab";
import { PostedNotifTab } from "@/components/tabs/PostedNotifTab";
import { EsspassTab } from "@/components/tabs/EsspassTab";
import { DeveloperTab } from "@/components/tabs/DeveloperTab";
import { IntelFeedTab } from "@/components/tabs/IntelFeedTab";
import { WellnessTab } from "@/components/tabs/WellnessTab";
import { useTranslation } from "react-i18next";

const ROLE_BADGE_COLORS: Record<Role, string> = {
  Executive:    "bg-indigo-500/15 text-indigo-400 border-indigo-500/25",
  LegalHead:    "bg-violet-500/15 text-violet-400 border-violet-500/25",
  TechOps:      "bg-blue-500/15 text-blue-400 border-blue-500/25",
  Coordinator:  "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  Professional: "bg-amber-500/15 text-amber-400 border-amber-500/25",
};

const ROLE_ACCENT_GRADIENT: Record<Role, string> = {
  Executive:    "from-indigo-500/20 via-transparent",
  LegalHead:    "from-violet-500/20 via-transparent",
  TechOps:      "from-blue-500/20 via-transparent",
  Coordinator:  "from-emerald-500/20 via-transparent",
  Professional: "from-amber-500/20 via-transparent",
};

export function DashboardPage() {
  const { role, logout, isReady } = useAuth();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("home");
  const { t } = useTranslation();

  // Tab history stack — so back button walks through previously visited tabs
  const tabHistoryRef = useRef<string[]>(["home"]);

  // Navigate to a tab, recording it in both our stack and browser history
  const navigateTab = (tab: string) => {
    // Don't push duplicates of the current top
    const history = tabHistoryRef.current;
    if (history[history.length - 1] === tab) return;
    tabHistoryRef.current = [...history, tab];
    setActiveTab(tab);
    // Push a browser history entry so popstate fires on back press
    window.history.pushState({ wfTab: tab }, "");
  };

  // On mount: push an initial guard so the FIRST back press is interceptable
  useEffect(() => {
    window.history.pushState({ wfTab: "home" }, "");

    const handlePopState = () => {
      const stack = tabHistoryRef.current;
      if (stack.length > 1) {
        // Pop the current tab and go back to the previous one
        const next = stack.slice(0, -1);
        tabHistoryRef.current = next;
        const prevTab = next[next.length - 1];
        setActiveTab(prevTab);
        // Re-push a guard so the next back press is also caught
        window.history.pushState({ wfTab: prevTab }, "");
      } else {
        // Already at root (home) — re-push guard to prevent leaving the app
        window.history.pushState({ wfTab: "home" }, "");
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isReady && !role) setLocation("/");
  }, [role, isReady, setLocation]);

  if (!role) return null;

  const tierConfig = TIER_CONFIGS[role];
  const badgeColor = ROLE_BADGE_COLORS[role];

  const handleLogout = () => {
    logout();
    setLocation("/");
  };

  // T1 and T2 can access every tab — no restrictions on navigation
  const isT1 = role === "Executive";
  const isT2 = role === "LegalHead";

  const renderContent = () => {
    switch (activeTab) {

      // ── HOME ──────────────────────────────────────────────────────────────
      case "home":
        if (isT1) return <OwnerHome onNavigate={navigateTab} />;
        if (isT2) return <ManagerHome onNavigate={navigateTab} />;
        if (role === "TechOps")      return <WorkersTab />;
        if (role === "Coordinator")  return <WorkersTab />;
        if (role === "Professional") return <Tier5Home />;
        return null;

      // ── DIRECTORY (workers) ───────────────────────────────────────────────
      // T1 / T2 → Professional Directory
      // T3 → Operational Workspace
      // T4 → Operational Workspace
      case "workers":
        if (role === "TechOps")     return <Tier3Home />;
        if (role === "Coordinator") return <Tier4Home />;
        return <WorkersTab />;

      case "calculator": return <div className="p-4 min-h-full overflow-y-auto pb-20 bg-[#0c0c0e]"><KnowledgeCenter /></div>;
      // ── PAYROLL (T1 only) ─────────────────────────────────────────────────
      case "payroll":
        if (!tierConfig.canViewFinancials) {
          return <AccessDenied title={t("common.financialFirewall")} message={t("common.financialFirewallMsg")} label={t("common.tier1Only")} />;
        }
        return <PayrollModule />;

      // ── ALERTS (T1 + T2, and inherited by both) ───────────────────────────
      case "alerts":
        return <AlertsModule />;

      // ── WORKSPACE — T3 view, now also accessible by T1 + T2 ──────────────
      case "workspace":
        return <Tier3Home />;

      // ── SITES — T3 view, also accessible by T1 + T2 ──────────────────────
      case "sites":
        return <SitesModule />;

      // ── DOC QUEUE — T4 view, also accessible by T1 + T2 ──────────────────
      case "queue":
        return <Tier4Home />;

      // ── MY DOCS — focused document status view ────────────────────────────
      case "docs":
        return <DocsTab />;

      // ── TIMESHEET — T5 view, also accessible by T1 + T2 ──────────────────
      case "timesheet":
        return <TimesheetTab />;

      // ── GPS CHECK-IN ─────────────────────────────────────────────────────
      case "gps":
        return <GpsCheckinTab />;

      // ── IMMIGRATION PERMITS ──────────────────────────────────────────────
      case "immigration":
        return <ImmigrationTab />;

      // ── ONBOARDING CHECKLIST ───────────────────────────────────────────
      case "onboarding":
        return <OnboardingTab />;

      // ── CRM ─────────────────────────────────────────────────────────────
      case "crm":
        return <CrmTab />;

      // ── INVOICES ────────────────────────────────────────────────────────
      case "invoices":
        return <InvoiceTab />;

      // ── ZUS FILINGS ─────────────────────────────────────────────────────
      case "zus":
        return <ZusTab />;

      // ── WORKER MATCHING ─────────────────────────────────────────────────
      case "matching":
        return <MatchingTab />;

      // ── MOOD ────────────────────────────────────────────────────────────
      case "mood":
        return <MoodTab />;

      // ── SALARY ADVANCES ─────────────────────────────────────────────────
      case "advances":
        return <AdvancesTab />;

      // ── CERTIFIED SIGNATURES ────────────────────────────────────────────
      case "signatures":
        return <SignaturesTab />;

      // ── BENCH ───────────────────────────────────────────────────────────
      case "bench":
        return <BenchTab />;

      // ── GOOGLE CALENDAR ─────────────────────────────────────────────────
      case "calendar":
        return <GoogleCalendarTab />;

      // ── AI CONTRACT GENERATOR ───────────────────────────────────────────
      case "contractgen":
        return <ContractGenTab />;

      // ── LEAVE REQUESTS ──────────────────────────────────────────────────
      case "leave":
        return <LeaveTab />;

      // ── ROI DASHBOARD ───────────────────────────────────────────────────
      case "roi":
        return <RoiTab />;

      // ── FINES PREVENTION ────────────────────────────────────────────────
      case "fines":
        return <FinesTab />;

      // ── TRUST SCORES ────────────────────────────────────────────────────
      case "trust":
        return <TrustTab />;

      // ── CHURN PREDICTION ────────────────────────────────────────────────
      case "churn":
        return <ChurnTab />;

      // ── HOUSING ─────────────────────────────────────────────────────────
      case "housing":
        return <HousingTab />;

      // ── REVENUE ─────────────────────────────────────────────────────────
      case "revenue":
        return <RevenueTab />;

      // ── SALARY BENCHMARK ────────────────────────────────────────────────
      case "salarybench":
        return <SalaryBenchTab />;

      // ── LEGAL UPDATES ───────────────────────────────────────────────────
      case "legal":
        return <LegalTab />;

      // ── SAFETY ──────────────────────────────────────────────────────────
      case "safety":
        return <SafetyTab />;

      // ── COMPETITORS ─────────────────────────────────────────────────────
      case "competitors":
        return <CompetitorTab />;

      // ── COUNTRY RULES ───────────────────────────────────────────────────
      case "countrypay":
        return <CountryTab />;

      // ── FRAUD DETECTION ─────────────────────────────────────────────────
      case "fraud":
        return <FraudTab />;

      // ── TRANSLATE ───────────────────────────────────────────────────────
      case "translate":
        return <TranslateTab />;

      // ── MESSAGES ────────────────────────────────────────────────────────
      case "messages":
        return <MessagingTab />;

      // ── INSURANCE ───────────────────────────────────────────────────────
      case "insurance":
        return <InsuranceTab />;

      // ── SKILLS GAP ──────────────────────────────────────────────────────
      case "skillsgap":
        return <SkillsGapTab />;

      // ── CAREER PATHS ────────────────────────────────────────────────────
      case "careers":
        return <CareerTab />;

      // ── MARGINS ─────────────────────────────────────────────────────────
      case "margins":
        return <MarginTab />;

      // ── GEO INTELLIGENCE ────────────────────────────────────────────────
      case "geo":
        return <GeoTab />;

      // ── MARKET SIGNALS ──────────────────────────────────────────────────
      case "signals":
        return <SignalsTab />;

      // ── IDENTITY ────────────────────────────────────────────────────────
      case "identity":
        return <IdentityTab />;

      // ── GUARANTEES ──────────────────────────────────────────────────────
      case "guarantees":
        return <GuaranteesTab />;

      // ── WHITE LABEL ─────────────────────────────────────────────────────
      case "whitelabel":
        return <WhiteLabelTab />;

      // ── FRAMEWORKS ──────────────────────────────────────────────────────
      case "frameworks":
        return <FrameworksTab />;

      // ── LEGAL KB ────────────────────────────────────────────────────────
      case "legalkb":
        return <LegalKBTab />;

      // ── BILLING ─────────────────────────────────────────────────────────
      case "billing":
        return <BillingTab />;

      // ── POSTED NOTIFICATIONS ────────────────────────────────────────────
      case "postednotif":
        return <PostedNotifTab />;

      // ── ESSPASS ─────────────────────────────────────────────────────────
      case "esspass":
        return <EsspassTab />;

      // ── DEVELOPER ───────────────────────────────────────────────────────
      case "developer":
        return <DeveloperTab />;

      // ── INTEL FEED ──────────────────────────────────────────────────────
      case "intelfeed":
        return <IntelFeedTab />;

      // ── WELLNESS ────────────────────────────────────────────────────────
      case "wellness":
        return <WellnessTab />;

      // ── CONTRACTS ─────────────────────────────────────────────────────────
      case "contracts":
        return <ContractTab />;

      // ── PROFILE ───────────────────────────────────────────────────────────
      case "profile":
        return <ProfileTab onLogout={handleLogout} />;

      default:
        return null;
    }
  };

  const accentGradient = ROLE_ACCENT_GRADIENT[role];

  return (
    <div className="flex flex-col h-full bg-[#0c0c0e]">
      {/* Premium Header */}
      <header className="premium-header shrink-0 sticky top-0 z-40 relative overflow-hidden">
        {/* Subtle role-colored accent glow at top */}
        <div className={cn("absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r", accentGradient, "to-transparent")} />
        <div className="relative h-14 px-4 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            {/* Premium logo mark */}
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-red-600 to-red-700 flex items-center justify-center shadow-lg shadow-red-900/20">
                <span className="text-white font-black text-sm leading-none" style={{ fontFamily: "Impact, sans-serif" }}>A</span>
              </div>
              <span className="font-heading font-black text-[15px] tracking-[0.08em] text-white shrink-0">APATRIS</span>
            </div>
            <div className="w-px h-5 bg-white/[0.08]" />
            <div className={cn(
              "px-2.5 py-1 rounded-lg text-[9px] font-black border tracking-widest whitespace-nowrap shrink-0 uppercase",
              badgeColor
            )}>
              {tierConfig.shortLabel}
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-white/30 hover:text-white/60 hover:bg-white/[0.06] active:scale-90 transition-all shrink-0"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>
      </header>

      {/* Main content with premium transitions */}
      <main className="flex-1 overflow-y-auto no-scrollbar bg-[#0c0c0e] relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 12, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.99 }}
            transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="h-full"
          >
            {renderContent()}
          </motion.div>
        </AnimatePresence>
      </main>

      <BottomNav activeTab={activeTab} onTabChange={navigateTab} />
    </div>
  );
}

// ── Shared access-denied wall ─────────────────────────────────────────────────
function AccessDenied({ title, message, label }: { title: string; message: string; label: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center p-8 text-center h-full min-h-[300px]"
    >
      <div className="w-20 h-20 bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4 border-2 border-red-500/20">
        <LockSvg className="w-8 h-8 text-red-400" />
      </div>
      <h2 className="text-base font-bold text-red-400 mb-2">{title}</h2>
      <p className="text-sm text-muted-foreground max-w-[220px]">{message}</p>
      <div className="mt-4 px-3 py-1.5 bg-red-500/10 border border-red-500/25 rounded-xl text-xs font-bold text-red-400">
        {label}
      </div>
    </motion.div>
  );
}

function LockSvg({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
    </svg>
  );
}
