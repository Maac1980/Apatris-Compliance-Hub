import React, { useEffect, lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { PageLoader } from "@/components/Skeleton";

import { AppShell } from "@/components/AppShell";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// Eager — used on every session
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Apply from "@/pages/Apply";
import NotFound from "@/pages/not-found";

// Lazy — loaded on demand (code splitting)
const AdminSettings = lazy(() => import("@/pages/AdminSettings"));
const ComplianceAlerts = lazy(() => import("@/pages/ComplianceAlerts"));
const PayrollPage = lazy(() => import("@/pages/PayrollPage"));
const KnowledgeCenterPage = lazy(() => import("@/components/KnowledgeCenter").then(m => ({ default: () => <div className="min-h-screen overflow-y-auto"><m.KnowledgeCenter /></div> })));
const HistoryPage = lazy(() => import("@/pages/HistoryPage"));
const WorkerUpload = lazy(() => import("@/pages/WorkerUpload"));
const ContractHub = lazy(() => import("@/pages/ContractHub"));
const DocumentWorkflow = lazy(() => import("@/pages/DocumentWorkflow"));
const GpsTracking = lazy(() => import("@/pages/GpsTracking"));
const AnalyticsPage = lazy(() => import("@/pages/AnalyticsPage"));
const AiCopilot = lazy(() => import("@/pages/AiCopilot"));
const RegulatoryIntelligence = lazy(() => import("@/pages/RegulatoryIntelligence"));
const ImmigrationSearch = lazy(() => import("@/pages/ImmigrationSearch"));
const TRCService = lazy(() => import("@/pages/TRCService"));
const WorkerAvailability = lazy(() => import("@/pages/WorkerAvailability"));
const ShiftSchedule = lazy(() => import("@/pages/ShiftSchedule"));
const SkillsMatrix = lazy(() => import("@/pages/SkillsMatrix"));
const SalaryBenchmark = lazy(() => import("@/pages/SalaryBenchmark"));
const AiAuditTrail = lazy(() => import("@/pages/AiAuditTrail"));
const GDPRManagement = lazy(() => import("@/pages/GDPRManagement"));
const PostedWorkers = lazy(() => import("@/pages/PostedWorkers"));
const CountryCompliance = lazy(() => import("@/pages/CountryCompliance"));
const HoursManagement = lazy(() => import("@/pages/HoursManagement"));
const SystemLogs = lazy(() => import("@/pages/SystemLogs"));
const ClientManagement = lazy(() => import("@/pages/ClientManagement"));
const PayTransparency = lazy(() => import("@/pages/PayTransparency"));
const ApplicationsFeed = lazy(() => import("@/pages/ApplicationsFeed"));
const JobBoard = lazy(() => import("@/pages/JobBoard"));
const InvoiceManagement = lazy(() => import("@/pages/InvoiceManagement"));
const ImmigrationDashboard = lazy(() => import("@/pages/ImmigrationDashboard"));
const OnboardingPage = lazy(() => import("@/pages/OnboardingPage"));
const CrmPage = lazy(() => import("@/pages/CrmPage"));
const ZusFilings = lazy(() => import("@/pages/ZusFilings"));
const WorkerMatching = lazy(() => import("@/pages/WorkerMatching"));
const MoodTracker = lazy(() => import("@/pages/MoodTracker"));
const VoiceCheckins = lazy(() => import("@/pages/VoiceCheckins"));
const SalaryAdvances = lazy(() => import("@/pages/SalaryAdvances"));
const CertifiedSignatures = lazy(() => import("@/pages/CertifiedSignatures"));
const BenchManagement = lazy(() => import("@/pages/BenchManagement"));
const GoogleWorkspace = lazy(() => import("@/pages/GoogleWorkspace"));
const ContractGenerator = lazy(() => import("@/pages/ContractGenerator"));
const SelfService = lazy(() => import("@/pages/SelfService"));
const RoiDashboard = lazy(() => import("@/pages/RoiDashboard"));
const FinesPrevention = lazy(() => import("@/pages/FinesPrevention"));
const TrustScores = lazy(() => import("@/pages/TrustScores"));
const ChurnPrediction = lazy(() => import("@/pages/ChurnPrediction"));
const HousingManagement = lazy(() => import("@/pages/HousingManagement"));
const RevenueForecast = lazy(() => import("@/pages/RevenueForecast"));
const LegalMonitor = lazy(() => import("@/pages/LegalMonitor"));
const SafetyMonitor = lazy(() => import("@/pages/SafetyMonitor"));
const CompetitorMonitor = lazy(() => import("@/pages/CompetitorMonitor"));
const CountryPayroll = lazy(() => import("@/pages/CountryPayroll"));
const FraudDetection = lazy(() => import("@/pages/FraudDetection"));
const TranslationEngine = lazy(() => import("@/pages/TranslationEngine"));
const Messaging = lazy(() => import("@/pages/Messaging"));
const InsuranceManagement = lazy(() => import("@/pages/InsuranceManagement"));
const SkillsGap = lazy(() => import("@/pages/SkillsGap"));
const CareerPaths = lazy(() => import("@/pages/CareerPaths"));
const MarginAnalysis = lazy(() => import("@/pages/MarginAnalysis"));
const GeoIntelligence = lazy(() => import("@/pages/GeoIntelligence"));
const MarketSignals = lazy(() => import("@/pages/MarketSignals"));
const WorkerIdentity = lazy(() => import("@/pages/WorkerIdentity"));
const ComplianceGuarantees = lazy(() => import("@/pages/ComplianceGuarantees"));
const WhiteLabel = lazy(() => import("@/pages/WhiteLabel"));
const FrameworkAgreements = lazy(() => import("@/pages/FrameworkAgreements"));
const LegalKB = lazy(() => import("@/pages/LegalKB"));
const SaaSBilling = lazy(() => import("@/pages/SaaSBilling"));
const PostedNotifications = lazy(() => import("@/pages/PostedNotifications"));
const EsspassPage = lazy(() => import("@/pages/EsspassPage"));
const DeveloperPortal = lazy(() => import("@/pages/DeveloperPortal"));
const IntelligenceFeed = lazy(() => import("@/pages/IntelligenceFeed"));
const FinancialWellness = lazy(() => import("@/pages/FinancialWellness"));
const DeploymentFlow = lazy(() => import("@/pages/DeploymentFlow"));
const PricingPage = lazy(() => import("@/pages/PricingPage"));
const ScreeningPage = lazy(() => import("@/pages/ScreeningPage"));
const WorkerTimeline = lazy(() => import("@/pages/WorkerTimeline"));
const PIPReadiness = lazy(() => import("@/pages/PIPReadiness"));
const AuthorityPacks = lazy(() => import("@/pages/AuthorityPacks"));
const LegalQueue = lazy(() => import("@/pages/LegalQueue"));
const RejectionIntelligence = lazy(() => import("@/pages/RejectionIntelligence"));
const LegalAlerts = lazy(() => import("@/pages/LegalAlerts"));
const PIPInspectionReport = lazy(() => import("@/pages/PIPInspectionReport"));
const LinkedCases = lazy(() => import("@/pages/LinkedCases"));
const LegalDocuments = lazy(() => import("@/pages/LegalDocuments"));
const RiskOverview = lazy(() => import("@/pages/RiskOverview"));
const IntelligenceDashboard = lazy(() => import("@/pages/IntelligenceDashboard"));
const DocumentIntake = lazy(() => import("@/pages/DocumentIntake"));
const LegalBrief = lazy(() => import("@/pages/LegalBrief"));
const LegalIntelligence = lazy(() => import("@/pages/LegalIntelligence"));

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
    <Suspense fallback={<div className="fixed inset-0 bg-slate-900 flex items-center justify-center"><PageLoader /></div>}>
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
      <Route path="/screening">
        {() => <ProtectedRoute component={ScreeningPage} />}
      </Route>
      <Route path="/worker-timeline">
        {() => <ProtectedRoute component={WorkerTimeline} />}
      </Route>
      <Route path="/pip-readiness">
        {() => <ProtectedRoute component={PIPReadiness} />}
      </Route>
      <Route path="/authority-packs">
        {() => <ProtectedRoute component={AuthorityPacks} />}
      </Route>
      <Route path="/legal-queue">
        {() => <ProtectedRoute component={LegalQueue} />}
      </Route>
      <Route path="/rejection-intelligence">
        {() => <ProtectedRoute component={RejectionIntelligence} />}
      </Route>
      <Route path="/document-intake">
        {() => <ProtectedRoute component={DocumentIntake} />}
      </Route>
      <Route path="/legal-brief">
        {() => <ProtectedRoute component={LegalBrief} />}
      </Route>
      <Route path="/legal-intelligence">
        {() => <ProtectedRoute component={LegalIntelligence} />}
      </Route>
      <Route path="/legal-alerts">
        {() => <ProtectedRoute component={LegalAlerts} />}
      </Route>
      <Route path="/pip-inspection-report">
        {() => <ProtectedRoute component={PIPInspectionReport} />}
      </Route>
      <Route path="/linked-cases">
        {() => <ProtectedRoute component={LinkedCases} />}
      </Route>
      <Route path="/legal-documents">
        {() => <ProtectedRoute component={LegalDocuments} />}
      </Route>
      <Route path="/risk-overview">
        {() => <ProtectedRoute component={RiskOverview} />}
      </Route>
      <Route path="/intelligence-dashboard">
        {() => <ProtectedRoute component={IntelligenceDashboard} />}
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
      <Route path="/wellness">
        {() => <ProtectedRoute component={FinancialWellness} />}
      </Route>
      <Route path="/deploy">
        {() => <ProtectedRoute component={DeploymentFlow} />}
      </Route>
      <Route path="/pricing" component={PricingPage} />
      <Route path="/calculator">
        {() => <ProtectedRoute component={KnowledgeCenterPage} />}
      </Route>
      <Route path="/">
        {() => <ProtectedRoute component={Dashboard} />}
      </Route>
      <Route component={NotFound} />
    </Switch>
    </Suspense>
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
