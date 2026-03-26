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
      <Route path="/calculator">
        {() => <ProtectedRoute component={() => <div style={{padding:"24px",background:"#0f172a",minHeight:"100vh"}}><KnowledgeCenter /></div>} />}
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
