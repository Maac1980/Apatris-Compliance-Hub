import React, { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { PageLoader } from "@/components/Skeleton";

import { AppShell } from "@/components/AppShell";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// Pages
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Apply from "@/pages/Apply";
import AdminSettings from "@/pages/AdminSettings";
import ComplianceAlerts from "@/pages/ComplianceAlerts";
import PayrollPage from "@/pages/PayrollPage";
import { KnowledgeCenter } from "@/components/KnowledgeCenter";
import HistoryPage from "@/pages/HistoryPage";
import WorkerUpload from "@/pages/WorkerUpload";
import ContractHub from "@/pages/ContractHub";
import DocumentWorkflow from "@/pages/DocumentWorkflow";
import GpsTracking from "@/pages/GpsTracking";
import AnalyticsPage from "@/pages/AnalyticsPage";
import AiCopilot from "@/pages/AiCopilot";
import RegulatoryIntelligence from "@/pages/RegulatoryIntelligence";
import ImmigrationSearch from "@/pages/ImmigrationSearch";
import TRCService from "@/pages/TRCService";
import WorkerAvailability from "@/pages/WorkerAvailability";
import ShiftSchedule from "@/pages/ShiftSchedule";
import SkillsMatrix from "@/pages/SkillsMatrix";
import SalaryBenchmark from "@/pages/SalaryBenchmark";
import AiAuditTrail from "@/pages/AiAuditTrail";
import GDPRManagement from "@/pages/GDPRManagement";
import PostedWorkers from "@/pages/PostedWorkers";
import CountryCompliance from "@/pages/CountryCompliance";
import HoursManagement from "@/pages/HoursManagement";
import SystemLogs from "@/pages/SystemLogs";
import ClientManagement from "@/pages/ClientManagement";
import PayTransparency from "@/pages/PayTransparency";
import ApplicationsFeed from "@/pages/ApplicationsFeed";
import JobBoard from "@/pages/JobBoard";
import InvoiceManagement from "@/pages/InvoiceManagement";
import ImmigrationDashboard from "@/pages/ImmigrationDashboard";
import OnboardingPage from "@/pages/OnboardingPage";
import CrmPage from "@/pages/CrmPage";
import ZusFilings from "@/pages/ZusFilings";
import WorkerMatching from "@/pages/WorkerMatching";
import MoodTracker from "@/pages/MoodTracker";
import VoiceCheckins from "@/pages/VoiceCheckins";
import SalaryAdvances from "@/pages/SalaryAdvances";
import CertifiedSignatures from "@/pages/CertifiedSignatures";
import BenchManagement from "@/pages/BenchManagement";
import GoogleWorkspace from "@/pages/GoogleWorkspace";
import ContractGenerator from "@/pages/ContractGenerator";
import SelfService from "@/pages/SelfService";
import RoiDashboard from "@/pages/RoiDashboard";
import FinesPrevention from "@/pages/FinesPrevention";
import TrustScores from "@/pages/TrustScores";
import ChurnPrediction from "@/pages/ChurnPrediction";
import HousingManagement from "@/pages/HousingManagement";
import RevenueForecast from "@/pages/RevenueForecast";
import LegalMonitor from "@/pages/LegalMonitor";
import SafetyMonitor from "@/pages/SafetyMonitor";
import CompetitorMonitor from "@/pages/CompetitorMonitor";
import CountryPayroll from "@/pages/CountryPayroll";
import FraudDetection from "@/pages/FraudDetection";
import TranslationEngine from "@/pages/TranslationEngine";
import Messaging from "@/pages/Messaging";
import InsuranceManagement from "@/pages/InsuranceManagement";
import SkillsGap from "@/pages/SkillsGap";
import CareerPaths from "@/pages/CareerPaths";
import MarginAnalysis from "@/pages/MarginAnalysis";
import GeoIntelligence from "@/pages/GeoIntelligence";
import MarketSignals from "@/pages/MarketSignals";
import WorkerIdentity from "@/pages/WorkerIdentity";
import ComplianceGuarantees from "@/pages/ComplianceGuarantees";
import WhiteLabel from "@/pages/WhiteLabel";
import FrameworkAgreements from "@/pages/FrameworkAgreements";
import LegalKB from "@/pages/LegalKB";
import SaaSBilling from "@/pages/SaaSBilling";
import PostedNotifications from "@/pages/PostedNotifications";
import EsspassPage from "@/pages/EsspassPage";
import DeveloperPortal from "@/pages/DeveloperPortal";
import IntelligenceFeed from "@/pages/IntelligenceFeed";
import PricingPage from "@/pages/PricingPage";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, isRestoring } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isRestoring && !isAuthenticated) {
      setLocation("/login");
    }
  }, [isAuthenticated, isRestoring, setLocation]);

  if (isRestoring) {
    return (
      <div className="fixed inset-0 bg-slate-900 flex items-center justify-center z-50">
        <PageLoader />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <ErrorBoundary>
      <Component />
    </ErrorBoundary>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/apply" component={Apply} />
      <Route path="/worker-upload/:id" component={WorkerUpload} />
      <Route path="/admin-settings">
        {() => <ProtectedRoute component={AdminSettings} />}
      </Route>
      <Route path="/compliance-alerts">
        {() => <ProtectedRoute component={ComplianceAlerts} />}
      </Route>
      <Route path="/payroll">
        {() => <ProtectedRoute component={PayrollPage} />}
      </Route>
      <Route path="/history">
        {() => <ProtectedRoute component={HistoryPage} />}
      </Route>
      <Route path="/contracts">
        {() => <ProtectedRoute component={ContractHub} />}
      </Route>
      <Route path="/doc-workflow">
        {() => <ProtectedRoute component={DocumentWorkflow} />}
      </Route>
      <Route path="/gps-tracking">
        {() => <ProtectedRoute component={GpsTracking} />}
      </Route>
      <Route path="/analytics">
        {() => <ProtectedRoute component={AnalyticsPage} />}
      </Route>
      <Route path="/ai-copilot">
        {() => <ProtectedRoute component={AiCopilot} />}
      </Route>
      <Route path="/regulatory">
        {() => <ProtectedRoute component={RegulatoryIntelligence} />}
      </Route>
      <Route path="/immigration-search">
        {() => <ProtectedRoute component={ImmigrationSearch} />}
      </Route>
      <Route path="/trc-service">
        {() => <ProtectedRoute component={TRCService} />}
      </Route>
      <Route path="/availability">
        {() => <ProtectedRoute component={WorkerAvailability} />}
      </Route>
      <Route path="/shift-schedule">
        {() => <ProtectedRoute component={ShiftSchedule} />}
      </Route>
      <Route path="/skills-matrix">
        {() => <ProtectedRoute component={SkillsMatrix} />}
      </Route>
      <Route path="/salary-benchmark">
        {() => <ProtectedRoute component={SalaryBenchmark} />}
      </Route>
      <Route path="/ai-audit">
        {() => <ProtectedRoute component={AiAuditTrail} />}
      </Route>
      <Route path="/gdpr">
        {() => <ProtectedRoute component={GDPRManagement} />}
      </Route>
      <Route path="/posted-workers">
        {() => <ProtectedRoute component={PostedWorkers} />}
      </Route>
      <Route path="/country-compliance">
        {() => <ProtectedRoute component={CountryCompliance} />}
      </Route>
      <Route path="/hours">
        {() => <ProtectedRoute component={HoursManagement} />}
      </Route>
      <Route path="/system-logs">
        {() => <ProtectedRoute component={SystemLogs} />}
      </Route>
      <Route path="/clients">
        {() => <ProtectedRoute component={ClientManagement} />}
      </Route>
      <Route path="/pay-transparency">
        {() => <ProtectedRoute component={PayTransparency} />}
      </Route>
      <Route path="/applications">
        {() => <ProtectedRoute component={ApplicationsFeed} />}
      </Route>
      <Route path="/job-board">
        {() => <ProtectedRoute component={JobBoard} />}
      </Route>
      <Route path="/invoices">
        {() => <ProtectedRoute component={InvoiceManagement} />}
      </Route>
      <Route path="/immigration">
        {() => <ProtectedRoute component={ImmigrationDashboard} />}
      </Route>
      <Route path="/onboarding">
        {() => <ProtectedRoute component={OnboardingPage} />}
      </Route>
      <Route path="/crm">
        {() => <ProtectedRoute component={CrmPage} />}
      </Route>
      <Route path="/zus">
        {() => <ProtectedRoute component={ZusFilings} />}
      </Route>
      <Route path="/matching">
        {() => <ProtectedRoute component={WorkerMatching} />}
      </Route>
      <Route path="/mood">
        {() => <ProtectedRoute component={MoodTracker} />}
      </Route>
      <Route path="/voice">
        {() => <ProtectedRoute component={VoiceCheckins} />}
      </Route>
      <Route path="/advances">
        {() => <ProtectedRoute component={SalaryAdvances} />}
      </Route>
      <Route path="/certified-signatures">
        {() => <ProtectedRoute component={CertifiedSignatures} />}
      </Route>
      <Route path="/bench">
        {() => <ProtectedRoute component={BenchManagement} />}
      </Route>
      <Route path="/google">
        {() => <ProtectedRoute component={GoogleWorkspace} />}
      </Route>
      <Route path="/contract-gen">
        {() => <ProtectedRoute component={ContractGenerator} />}
      </Route>
      <Route path="/self-service">
        {() => <ProtectedRoute component={SelfService} />}
      </Route>
      <Route path="/roi">
        {() => <ProtectedRoute component={RoiDashboard} />}
      </Route>
      <Route path="/fines">
        {() => <ProtectedRoute component={FinesPrevention} />}
      </Route>
      <Route path="/trust">
        {() => <ProtectedRoute component={TrustScores} />}
      </Route>
      <Route path="/churn">
        {() => <ProtectedRoute component={ChurnPrediction} />}
      </Route>
      <Route path="/housing">
        {() => <ProtectedRoute component={HousingManagement} />}
      </Route>
      <Route path="/revenue">
        {() => <ProtectedRoute component={RevenueForecast} />}
      </Route>
      <Route path="/legal">
        {() => <ProtectedRoute component={LegalMonitor} />}
      </Route>
      <Route path="/safety">
        {() => <ProtectedRoute component={SafetyMonitor} />}
      </Route>
      <Route path="/competitors">
        {() => <ProtectedRoute component={CompetitorMonitor} />}
      </Route>
      <Route path="/country-payroll">
        {() => <ProtectedRoute component={CountryPayroll} />}
      </Route>
      <Route path="/fraud">
        {() => <ProtectedRoute component={FraudDetection} />}
      </Route>
      <Route path="/translate">
        {() => <ProtectedRoute component={TranslationEngine} />}
      </Route>
      <Route path="/messages">
        {() => <ProtectedRoute component={Messaging} />}
      </Route>
      <Route path="/insurance">
        {() => <ProtectedRoute component={InsuranceManagement} />}
      </Route>
      <Route path="/skills-gap">
        {() => <ProtectedRoute component={SkillsGap} />}
      </Route>
      <Route path="/careers">
        {() => <ProtectedRoute component={CareerPaths} />}
      </Route>
      <Route path="/margins">
        {() => <ProtectedRoute component={MarginAnalysis} />}
      </Route>
      <Route path="/geo">
        {() => <ProtectedRoute component={GeoIntelligence} />}
      </Route>
      <Route path="/signals">
        {() => <ProtectedRoute component={MarketSignals} />}
      </Route>
      <Route path="/identity">
        {() => <ProtectedRoute component={WorkerIdentity} />}
      </Route>
      <Route path="/guarantees">
        {() => <ProtectedRoute component={ComplianceGuarantees} />}
      </Route>
      <Route path="/whitelabel">
        {() => <ProtectedRoute component={WhiteLabel} />}
      </Route>
      <Route path="/frameworks">
        {() => <ProtectedRoute component={FrameworkAgreements} />}
      </Route>
      <Route path="/legal-kb">
        {() => <ProtectedRoute component={LegalKB} />}
      </Route>
      <Route path="/saas-billing">
        {() => <ProtectedRoute component={SaaSBilling} />}
      </Route>
      <Route path="/posted-notifications">
        {() => <ProtectedRoute component={PostedNotifications} />}
      </Route>
      <Route path="/esspass">
        {() => <ProtectedRoute component={EsspassPage} />}
      </Route>
      <Route path="/developer">
        {() => <ProtectedRoute component={DeveloperPortal} />}
      </Route>
      <Route path="/intelligence-feed">
        {() => <ProtectedRoute component={IntelligenceFeed} />}
      </Route>
      <Route path="/pricing" component={PricingPage} />
      <Route path="/calculator">
        {() => <ProtectedRoute component={() => <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background"><KnowledgeCenter /></div>} />}
      </Route>
      <Route path="/">
        {() => <ProtectedRoute component={Dashboard} />}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <AppShell>
              <ErrorBoundary>
                <Router />
              </ErrorBoundary>
            </AppShell>
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
