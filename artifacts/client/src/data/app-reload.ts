export type AppReloadReason =
  | "pwa_update"
  | "storage_version_recovery"
  | "manual_error_retry";

export type AppNavigationType =
  | "navigate"
  | "reload"
  | "back_forward"
  | "prerender"
  | "unknown";

export interface AppStartupDiagnostic {
  occurredAt: string;
  initialPath: string;
  navigationType: AppNavigationType;
  requestedReloadReason: AppReloadReason | null;
  externallyInitiatedReload: boolean;
}

type ReloadStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

const REQUESTED_RELOAD_REASON_KEY = "its-aha:requested-reload-reason";
const STARTUP_DIAGNOSTIC_KEY = "its-aha:last-startup-diagnostic";
const RELOAD_REASONS = new Set<AppReloadReason>([
  "pwa_update",
  "storage_version_recovery",
  "manual_error_retry",
]);

function parseReloadReason(value: string | null): AppReloadReason | null {
  return value && RELOAD_REASONS.has(value as AppReloadReason)
    ? (value as AppReloadReason)
    : null;
}

function readNavigationType(
  performanceApi: Pick<Performance, "getEntriesByType">,
): AppNavigationType {
  try {
    const entry = performanceApi.getEntriesByType(
      "navigation",
    )[0] as PerformanceNavigationTiming | undefined;
    return entry &&
      ["navigate", "reload", "back_forward", "prerender"].includes(entry.type)
      ? entry.type
      : "unknown";
  } catch {
    return "unknown";
  }
}

export function createStartupDiagnostic(input: {
  occurredAt: string;
  initialPath: string;
  navigationType: AppNavigationType;
  requestedReloadReason: AppReloadReason | null;
}): AppStartupDiagnostic {
  return {
    ...input,
    externallyInitiatedReload:
      input.navigationType === "reload" && input.requestedReloadReason === null,
  };
}

export function recordStartupDiagnostic(
  storage: ReloadStorage = window.sessionStorage,
  performanceApi: Pick<Performance, "getEntriesByType"> = window.performance,
  initialPath = window.location.pathname,
  now = new Date(),
  logger: Pick<Console, "info"> = console,
): AppStartupDiagnostic {
  let requestedReloadReason: AppReloadReason | null = null;
  try {
    requestedReloadReason = parseReloadReason(
      storage.getItem(REQUESTED_RELOAD_REASON_KEY),
    );
    storage.removeItem(REQUESTED_RELOAD_REASON_KEY);
  } catch {
    // Diagnostics must never prevent a local-first app from opening.
  }

  const diagnostic = createStartupDiagnostic({
    occurredAt: now.toISOString(),
    initialPath,
    navigationType: readNavigationType(performanceApi),
    requestedReloadReason,
  });

  try {
    storage.setItem(STARTUP_DIAGNOSTIC_KEY, JSON.stringify(diagnostic));
  } catch {
    // Private browsing and storage restrictions may reject session storage.
  }
  logger.info("ITS AHA startup", diagnostic);
  return diagnostic;
}

export function requestAppReload(
  reason: AppReloadReason,
  storage: ReloadStorage = window.sessionStorage,
  reload: () => void = () => window.location.reload(),
): void {
  try {
    storage.setItem(REQUESTED_RELOAD_REASON_KEY, reason);
  } catch {
    // The reload remains usable when diagnostics storage is unavailable.
  }
  reload();
}
