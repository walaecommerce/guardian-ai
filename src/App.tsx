import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Session from "./pages/Session";
import CampaignAudit from "./pages/CampaignAudit";
import Studio from "./pages/Studio";
import Tracker from "./pages/Tracker";
import TestChecklist from "./pages/TestChecklist";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/campaign" element={<CampaignAudit />} />
          <Route path="/studio" element={<Studio />} />
          <Route path="/tracker" element={<Tracker />} />
          <Route path="/test-checklist" element={<TestChecklist />} />
          <Route path="/session/:sessionId" element={<Session />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
