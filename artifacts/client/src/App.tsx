import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

const queryClient = new QueryClient();
const AhaApp = lazy(() => import("@/features/aha-app"));

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Suspense
          fallback={
            <main className="min-h-screen bg-background px-5 py-12">
              <p className="text-center text-base font-semibold text-muted-foreground">
                Opening your saved AHAs…
              </p>
            </main>
          }
        >
          <AhaApp />
        </Suspense>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
