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
import { Loader2, Terminal, ShieldBan, LogOut } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

const CompanySuspended = ({ companyName, onSignOut }: { companyName: string; onSignOut: () => void }) => (
  <div className="min-h-screen flex items-center justify-center bg-background p-4">
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-md text-center"
    >
      <div className="inline-flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
          <Terminal className="w-6 h-6 text-primary-foreground" />
        </div>
        <h1 className="text-3xl font-mono font-bold text-foreground tracking-tight">Терминал</h1>
      </div>
      <div className="glass rounded-2xl p-8 shadow-lg">
        <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center bg-destructive/10">
          <ShieldBan className="w-8 h-8 text-destructive" />
        </div>
        <h2 className="text-lg font-mono font-bold text-foreground mb-2">Аккаунт заблокирован</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Аккаунт компании «{companyName}» временно заблокирован. Обратитесь к администратору платформы для получения информации.
        </p>
        <Button onClick={onSignOut} variant="outline" className="rounded-xl">
          <LogOut className="w-4 h-4 mr-2" /> Выйти
        </Button>
      </div>
    </motion.div>
  </div>
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

const AppRoutes = () => {
  const { user, loading, membership, membershipLoading, isPlatformAdmin, signOut } = useAuth();
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

  if (membership.company_status === "suspended") {
    return (
      <Routes>
        <Route path="*" element={<CompanySuspended companyName={membership.company_name} onSignOut={signOut} />} />
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
