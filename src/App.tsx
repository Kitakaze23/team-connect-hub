import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { CallProvider } from "@/contexts/CallContext";
import CallOverlay from "@/components/call/CallOverlay";
import AuthPage from "./pages/AuthPage";
import Dashboard from "./pages/Dashboard";
import CompanySetup from "./pages/CompanySetup";
import PendingApproval from "./pages/PendingApproval";
import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";
import NotFound from "./pages/NotFound";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

const AppRoutes = () => {
  const { user, loading, membership, membershipLoading, isPlatformAdmin } = useAuth();
  const isInitialMembershipLoad = Boolean(user) && !isPlatformAdmin && !membership && membershipLoading;

  if (loading || isInitialMembershipLoad) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  // Platform admin — only admin dashboard
  if (user && isPlatformAdmin) {
    return (
      <Routes>
        <Route path="/admin/dashboard" element={<AdminDashboard />} />
        <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
      </Routes>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/" element={<AuthPage />} />
        <Route path="/admin" element={<AdminLogin />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  if (!membership) {
    return (
      <Routes>
        <Route path="*" element={<CompanySetup />} />
      </Routes>
    );
  }

  if (membership.status !== "approved") {
    return (
      <Routes>
        <Route path="*" element={<PendingApproval />} />
      </Routes>
    );
  }

  return (
    <CallProvider>
      <CallOverlay />
      <Routes>
        <Route path="/app" element={<Dashboard />} />
        <Route path="/" element={<Navigate to="/app" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </CallProvider>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
