import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { DashboardLayout } from "@/components/DashboardLayout";
import Index from "./pages/Index";
import Session from "./pages/Session";
import CampaignAudit from "./pages/CampaignAudit";
import Studio from "./pages/Studio";
import Tracker from "./pages/Tracker";
import TestChecklist from "./pages/TestChecklist";
import Sessions from "./pages/Sessions";
import Media from "./pages/Media";
import Onboarding from "./pages/Onboarding";
import Pricing from "./pages/Pricing";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import Landing from "./pages/Landing";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/landing" element={<Landing />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="*" element={
              <AuthGuard>
                <Routes>
                  <Route path="/onboarding" element={<Onboarding />} />
                  <Route path="*" element={
                    <DashboardLayout>
                      <Routes>
                        <Route path="/" element={<Index />} />
                        <Route path="/pricing" element={<Pricing />} />
                        <Route path="/campaign" element={<CampaignAudit />} />
                        <Route path="/studio" element={<Studio />} />
                        <Route path="/tracker" element={<Tracker />} />
                        <Route path="/test-checklist" element={<TestChecklist />} />
                        <Route path="/sessions" element={<Sessions />} />
                        <Route path="/media" element={<Media />} />
                        <Route path="/settings" element={<Settings />} />
                        <Route path="/session/:sessionId" element={<Session />} />
                        <Route path="*" element={<NotFound />} />
                      </Routes>
                    </DashboardLayout>
                  } />
                </Routes>
              </AuthGuard>
            } />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
