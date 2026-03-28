import React, { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { PageLoader } from "@/components/Skeleton";

import { AppShell } from "@/components/AppShell";

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

  return <Component />;
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
              <Router />
            </AppShell>
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
