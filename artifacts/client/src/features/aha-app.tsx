import { useEffect, useRef } from "react";
import {
  BrowserRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router";

import { LocalDataGate } from "@/components/aha/local-data-gate";
import { ErrorBoundary } from "@/components/error-boundary";
import { AhaEditorLayout } from "@/features/aha-editor/editor-context";
import AhaDetails from "@/pages/aha-details";
import AhaEnergy from "@/pages/aha-energy";
import AhaReview from "@/pages/aha-review";
import AhaSigning from "@/pages/aha-signing";
import AhaWork from "@/pages/aha-work";
import Home from "@/pages/home";
import NotFound from "@/pages/not-found";

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
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/ahas/:ahaId" element={<AhaEditorLayout />}>
          <Route path="details" element={<AhaDetails />} />
          <Route path="work" element={<AhaWork />} />
          <Route path="energy" element={<AhaEnergy />} />
          <Route path="review" element={<AhaReview />} />
          <Route path="sign" element={<AhaSigning />} />
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
        <AppRoutes />
      </LocalDataGate>
    </BrowserRouter>
  );
}
