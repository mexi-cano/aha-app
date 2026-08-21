import { createRoot } from "react-dom/client";

import App from "./App";
import { ErrorBoundary } from "@/components/error-boundary";
import {
  recordStartupDiagnostic,
  requestAppReload,
} from "@/data/app-reload";

import "./index.css";

recordStartupDiagnostic();

createRoot(document.getElementById("root")!, {
  // Keeps caught errors off reportError(), which would raise the dev overlay.
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
}).render(
  <ErrorBoundary onRetry={() => requestAppReload("manual_error_retry")}>
    <App />
  </ErrorBoundary>,
);
