import { lazy, Suspense, useEffect, useRef } from "react";
import {
  BrowserRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router";

import { LocalDataGate } from "@/components/aha/local-data-gate";
import { ErrorBoundary } from "@/components/error-boundary";
import { AuthProvider } from "@/features/auth/auth-context";
import { BackupManager } from "@/features/backup/backup-manager";
import { RestoreGate } from "@/features/restore/restore-gate";
import { UpdateManager } from "@/features/pwa/update-manager";
import { AhaEditorLayout } from "@/features/aha-editor/editor-context";
import AhaDetails from "@/pages/aha-details";
import AhaCompleted from "@/pages/aha-completed";
import AhaEnergy from "@/pages/aha-energy";
import AhaLateWorker from "@/pages/aha-late-worker";
import AhaPdfView from "@/pages/aha-pdf-view";
import AhaReview from "@/pages/aha-review";
import AhaSigning from "@/pages/aha-signing";
import AhaWork from "@/pages/aha-work";
import Home from "@/pages/home";
import JobSetup from "@/pages/job-setup";
import Jobs from "@/pages/jobs";
import NotFound from "@/pages/not-found";

const PdfTest = import.meta.env.DEV
  ? lazy(() => import("@/pages/pdf-test"))
  : null;

function InitialEditorRecoveryRedirect() {
  const location = useLocation();
  const navigate = useNavigate();
  const initialPath = useRef(location.pathname);
  const hasCheckedInitialPath = useRef(false);

  useEffect(() => {
    if (hasCheckedInitialPath.current) return;
    hasCheckedInitialPath.current = true;
    // A reload or relaunch always recovers through Home. Internal editor
    // navigation is unaffected because this checks only the captured first URL.
    if (initialPath.current.startsWith("/ahas/")) {
      navigate("/", { replace: true });
    }
  }, [navigate]);

  return null;
}

function AppRoutes() {
  const location = useLocation();

  return (
    <ErrorBoundary resetKey={location.pathname}>
      <InitialEditorRecoveryRedirect />
      <UpdateManager />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/setup" element={<JobSetup />} />
        <Route path="/jobs" element={<Jobs />} />
        <Route path="/jobs/:jobId/setup" element={<JobSetup />} />
        {PdfTest ? (
          <Route
            path="/pdf-test"
            element={
              <Suspense
                fallback={<main className="p-8">Opening PDF comparison…</main>}
              >
                <PdfTest />
              </Suspense>
            }
          />
        ) : null}
        <Route path="/ahas/:ahaId" element={<AhaEditorLayout />}>
          <Route path="details" element={<AhaDetails />} />
          <Route path="work" element={<AhaWork />} />
          <Route path="energy" element={<AhaEnergy />} />
          <Route path="review" element={<AhaReview />} />
          <Route path="sign" element={<AhaSigning />} />
          <Route path="completed" element={<AhaCompleted />} />
          <Route path="pdf" element={<AhaPdfView />} />
          <Route path="add-worker" element={<AhaLateWorker />} />
          <Route path="update/details" element={<AhaDetails />} />
          <Route path="update/work" element={<AhaWork />} />
          <Route path="update/energy" element={<AhaEnergy />} />
          <Route path="update/review" element={<AhaReview />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </ErrorBoundary>
  );
}

export default function AhaApp() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <LocalDataGate>
        <AuthProvider>
          <BackupManager />
          <RestoreGate>
            <AppRoutes />
          </RestoreGate>
        </AuthProvider>
      </LocalDataGate>
    </BrowserRouter>
  );
}
