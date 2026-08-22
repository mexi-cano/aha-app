import { lazy, Suspense, useEffect, useRef, type ReactNode } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router";

import { LocalDataGate } from "@/components/aha/local-data-gate";
import { ErrorBoundary } from "@/components/error-boundary";
import { AuthProvider } from "@/features/auth/auth-context";
import { BackupManager } from "@/features/backup/backup-manager";
import { RestoreGate, useRecoveryState } from "@/features/restore/restore-gate";
import { UpdateManager } from "@/features/pwa/update-manager";
import { AhaEditorLayout } from "@/features/aha-editor/editor-context";
import AhaDetails from "@/pages/aha-details";
import AhaCompleted from "@/pages/aha-completed";
import AhaEnergy from "@/pages/aha-energy";
import AhaLateWorker from "@/pages/aha-late-worker";
import AhaDocumentHistory from "@/pages/aha-document-history";
import AhaCrewManagement from "@/pages/aha-crew-management";
import AhaSignatureCorrection from "@/pages/aha-signature-correction";
import AhaPdfView from "@/pages/aha-pdf-view";
import AhaReview from "@/pages/aha-review";
import AhaSigning from "@/pages/aha-signing";
import AhaWork from "@/pages/aha-work";
import Home from "@/pages/home";
import History from "@/pages/history";
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

function RecoveryWriteRoute({ children }: { children: ReactNode }) {
  const { isWriteBlocked } = useRecoveryState();
  return isWriteBlocked ? <Navigate to="/" replace /> : children;
}

function AppRoutes() {
  const location = useLocation();

  return (
    <ErrorBoundary resetKey={location.pathname}>
      <InitialEditorRecoveryRedirect />
      <UpdateManager />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/history" element={<History />} />
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
          <Route
            path="details"
            element={
              <RecoveryWriteRoute>
                <AhaDetails />
              </RecoveryWriteRoute>
            }
          />
          <Route
            path="work"
            element={
              <RecoveryWriteRoute>
                <AhaWork />
              </RecoveryWriteRoute>
            }
          />
          <Route
            path="energy"
            element={
              <RecoveryWriteRoute>
                <AhaEnergy />
              </RecoveryWriteRoute>
            }
          />
          <Route
            path="review"
            element={
              <RecoveryWriteRoute>
                <AhaReview />
              </RecoveryWriteRoute>
            }
          />
          <Route
            path="sign"
            element={
              <RecoveryWriteRoute>
                <AhaSigning />
              </RecoveryWriteRoute>
            }
          />
          <Route path="completed" element={<AhaCompleted />} />
          <Route path="pdf" element={<AhaPdfView />} />
          <Route
            path="add-worker"
            element={
              <RecoveryWriteRoute>
                <AhaLateWorker />
              </RecoveryWriteRoute>
            }
          />
          <Route path="document-history" element={<AhaDocumentHistory />} />
          <Route
            path="crew"
            element={
              <RecoveryWriteRoute>
                <AhaCrewManagement />
              </RecoveryWriteRoute>
            }
          />
          <Route
            path="crew/:workerId/replace-signature"
            element={
              <RecoveryWriteRoute>
                <AhaSignatureCorrection />
              </RecoveryWriteRoute>
            }
          />
          <Route
            path="update/details"
            element={
              <RecoveryWriteRoute>
                <AhaDetails />
              </RecoveryWriteRoute>
            }
          />
          <Route
            path="update/work"
            element={
              <RecoveryWriteRoute>
                <AhaWork />
              </RecoveryWriteRoute>
            }
          />
          <Route
            path="update/energy"
            element={
              <RecoveryWriteRoute>
                <AhaEnergy />
              </RecoveryWriteRoute>
            }
          />
          <Route
            path="update/review"
            element={
              <RecoveryWriteRoute>
                <AhaReview />
              </RecoveryWriteRoute>
            }
          />
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
