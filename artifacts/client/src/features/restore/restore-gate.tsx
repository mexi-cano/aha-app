import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Search } from "lucide-react";
import { useNavigate } from "react-router";
import type { Job } from "@workspace/aha-domain";

import { AppLogo } from "@/components/aha/app-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ahaDatabase } from "@/data/database";
import {
  filterJobsForSelection,
  JOB_SEARCH_THRESHOLD,
  sortJobsForSelection,
} from "@/data/job-selection";
import { recoveryErrorMessage } from "@/data/recovery-error";
import {
  beginRestore,
  clearRestoreProgressForRestart,
  getRestoreProgress,
  InvalidRestoreProgressError,
  listRemoteJobs,
  resumeRestore,
} from "@/data/restore";
import { useAuthorization } from "@/features/auth/auth-context";

interface RecoveryOfferState {
  phase: "offer";
  jobs: Job[];
  selectedIds: Set<string>;
  query: string;
  error: string | null;
}

interface ResumableRecoveryState {
  phase: "resumable";
  jobs: Job[];
  error: string | null;
}

interface InvalidRecoveryState {
  phase: "invalid_progress";
  error: string;
}

type PausableRecoveryState = ResumableRecoveryState | InvalidRecoveryState;

type RecoveryMachineState =
  | { phase: "inspecting" | "discovering" | "authorization_required" }
  | { phase: "ready" | "skipped" }
  | RecoveryOfferState
  | ResumableRecoveryState
  | InvalidRecoveryState
  | { phase: "discovery_failed"; error: string }
  | {
      phase: "restoring";
      jobs: Job[];
      message: string;
      durableProgress: boolean;
      source: "offer" | "resumable" | "restart";
    }
  | { phase: "paused"; recovery: PausableRecoveryState }
  | { phase: "complete"; jobs: Job[] };

export type RecoveryPhase = RecoveryMachineState["phase"];

interface RecoveryState {
  phase: RecoveryPhase;
  isPaused: boolean;
  hasPendingRecovery: boolean;
  isWriteBlocked: boolean;
  resumeRecovery: () => void;
}

const RecoveryContext = createContext<RecoveryState>({
  phase: "ready",
  isPaused: false,
  hasPendingRecovery: false,
  isWriteBlocked: false,
  resumeRecovery: () => undefined,
});

export function useRecoveryState(): RecoveryState {
  return useContext(RecoveryContext);
}

function hasDurableRecovery(state: RecoveryMachineState): boolean {
  if (
    state.phase === "resumable" ||
    state.phase === "invalid_progress" ||
    state.phase === "paused"
  ) {
    return true;
  }
  return state.phase === "restoring" && state.durableProgress;
}

function RecoveryOpeningScreen({
  authorizationRequired = false,
  onAuthorize,
}: {
  authorizationRequired?: boolean;
  onAuthorize?: () => void;
}) {
  return (
    <main className="min-h-screen bg-background px-5 py-12">
      <section className="mx-auto max-w-lg rounded-2xl border border-card-border bg-card p-8 text-center shadow-sm">
        <div className="flex justify-center">
          <AppLogo />
        </div>
        <h1 className="mt-8 text-2xl font-bold">
          {authorizationRequired
            ? "Connect to check saved work"
            : "Opening saved work…"}
        </h1>
        <p className="mt-3 text-base font-medium leading-relaxed text-muted-foreground">
          {authorizationRequired
            ? "No job is saved on this device. Enter the access code while online to check available backups."
            : "Checking this device and available backups. Your saved records are not being changed."}
        </p>
        {authorizationRequired && onAuthorize ? (
          <Button
            className="mt-7 min-h-14 w-full text-base font-bold"
            onClick={onAuthorize}
          >
            ENTER ACCESS CODE
          </Button>
        ) : null}
      </section>
    </main>
  );
}

function errorForState(state: RecoveryMachineState): string | null {
  if (
    state.phase === "offer" ||
    state.phase === "resumable" ||
    state.phase === "invalid_progress" ||
    state.phase === "discovery_failed"
  ) {
    return state.error;
  }
  return null;
}

export function RestoreGate({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { isAuthorizedForNetwork, requireAuthorization } = useAuthorization();
  const [state, setState] = useState<RecoveryMachineState>({
    phase: "inspecting",
  });
  const [discoveryAttempt, setDiscoveryAttempt] = useState(0);
  const discoveryDisabledRef = useRef(false);
  const dialogHeadingRef = useRef<HTMLHeadingElement>(null);
  const resumeButtonRef = useRef<HTMLButtonElement>(null);

  const hasPendingRecovery = hasDurableRecovery(state);
  const isPaused = state.phase === "paused";
  const isWriteBlocked = hasPendingRecovery;
  const modalVisible = [
    "offer",
    "resumable",
    "invalid_progress",
    "discovery_failed",
    "restoring",
  ].includes(state.phase);

  useEffect(() => {
    if (discoveryDisabledRef.current) return;
    let cancelled = false;

    void (async () => {
      setState({ phase: "inspecting" });
      try {
        const progress = await getRestoreProgress();
        if (progress) {
          if (!cancelled) {
            setState({
              phase: "resumable",
              jobs: sortJobsForSelection(progress.jobs),
              error: null,
            });
          }
          return;
        }
      } catch (caught) {
        if (!cancelled && caught instanceof InvalidRestoreProgressError) {
          setState({
            phase: "invalid_progress",
            error:
              "Saved recovery progress could not be read. Restart recovery to verify the available backup again.",
          });
        }
        return;
      }

      if ((await ahaDatabase.jobs.count()) > 0) {
        if (!cancelled) {
          discoveryDisabledRef.current = true;
          setState({ phase: "ready" });
        }
        return;
      }

      if (!isAuthorizedForNetwork) {
        if (!cancelled) setState({ phase: "authorization_required" });
        return;
      }

      if (!cancelled) setState({ phase: "discovering" });
      try {
        const remote = await listRemoteJobs();
        if ((await ahaDatabase.jobs.count()) > 0) {
          if (!cancelled) {
            discoveryDisabledRef.current = true;
            setState({ phase: "ready" });
          }
          return;
        }
        if (cancelled) return;
        const jobs = sortJobsForSelection(remote.map((record) => record.job));
        if (jobs.length) {
          setState({
            phase: "offer",
            jobs,
            selectedIds: new Set(),
            query: "",
            error: null,
          });
        } else {
          discoveryDisabledRef.current = true;
          setState({ phase: "ready" });
        }
      } catch (caught) {
        if (!cancelled) {
          setState({
            phase: "discovery_failed",
            error: recoveryErrorMessage(caught, navigator.onLine),
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [discoveryAttempt, isAuthorizedForNetwork]);

  useEffect(() => {
    if (modalVisible) dialogHeadingRef.current?.focus();
  }, [modalVisible, state.phase]);

  useEffect(() => {
    if (state.phase !== "complete") return;
    const jobs = state.jobs;
    setState({ phase: "ready" });
    if (jobs.length === 1) {
      navigate("/", { replace: true });
    } else {
      navigate("/jobs", {
        replace: true,
        state: { recoveryCompleted: true },
      });
    }
  }, [navigate, state]);

  const restore = async () => {
    if (state.phase !== "offer" && state.phase !== "resumable") return;
    const source = state;
    const jobs =
      source.phase === "offer"
        ? source.jobs.filter((job) => source.selectedIds.has(job.id))
        : source.jobs;
    if (!jobs.length) return;

    let durableProgress = source.phase === "resumable";
    setState({
      phase: "restoring",
      jobs,
      message: "Preparing recovery…",
      durableProgress,
      source: source.phase,
    });
    try {
      if (source.phase === "offer") {
        await beginRestore(jobs);
        durableProgress = true;
        setState({
          phase: "restoring",
          jobs,
          message: "Preparing recovery…",
          durableProgress: true,
          source: "offer",
        });
      }
      await resumeRestore((message) => {
        setState((current) =>
          current.phase === "restoring" ? { ...current, message } : current,
        );
      });
      discoveryDisabledRef.current = true;
      setState({ phase: "complete", jobs });
    } catch (caught) {
      const error = recoveryErrorMessage(caught, navigator.onLine);
      if (durableProgress) {
        setState({ phase: "resumable", jobs, error });
      } else if (source.phase === "offer") {
        setState({ ...source, error });
      }
    }
  };

  const restartRecovery = async () => {
    if (state.phase !== "invalid_progress") return;
    setState({
      phase: "restoring",
      jobs: [],
      message: "Checking available backups…",
      durableProgress: true,
      source: "restart",
    });
    try {
      await clearRestoreProgressForRestart();
      const remote = await listRemoteJobs();
      const jobs = sortJobsForSelection(remote.map((record) => record.job));
      if (!jobs.length) {
        setState({
          phase: "discovery_failed",
          error: "No backed-up jobs are currently available to restore.",
        });
        return;
      }
      setState({
        phase: "offer",
        jobs,
        selectedIds: new Set(),
        query: "",
        error: null,
      });
    } catch (caught) {
      const progress = await getRestoreProgress().catch(() => null);
      if (progress) {
        setState({
          phase: "resumable",
          jobs: sortJobsForSelection(progress.jobs),
          error: recoveryErrorMessage(caught, navigator.onLine),
        });
      } else {
        setState({
          phase: "discovery_failed",
          error: recoveryErrorMessage(caught, navigator.onLine),
        });
      }
    }
  };

  const leaveForNow = () => {
    if (state.phase !== "resumable" && state.phase !== "invalid_progress") {
      return;
    }
    setState({ phase: "paused", recovery: state });
    window.requestAnimationFrame(() => resumeButtonRef.current?.focus());
  };

  const skipRecovery = () => {
    discoveryDisabledRef.current = true;
    setState({ phase: "skipped" });
  };

  const contextValue = useMemo<RecoveryState>(
    () => ({
      phase: state.phase,
      isPaused,
      hasPendingRecovery,
      isWriteBlocked,
      resumeRecovery: () => {
        setState((current) =>
          current.phase === "paused" ? current.recovery : current,
        );
      },
    }),
    [hasPendingRecovery, isPaused, isWriteBlocked, state.phase],
  );

  const offer = state.phase === "offer" ? state : null;
  const visibleJobs = offer
    ? filterJobsForSelection(offer.jobs, offer.query)
    : [];
  const error = errorForState(state);

  let heading = "Restore backed-up jobs?";
  if (state.phase === "resumable") heading = "Resume saved recovery";
  if (state.phase === "invalid_progress") heading = "Restart saved recovery";
  if (state.phase === "discovery_failed") heading = "Check available backups";
  if (state.phase === "restoring") heading = "Restoring saved work";

  const renderOpeningBackground = ![
    "ready",
    "skipped",
    "paused",
  ].includes(state.phase);

  return (
    <RecoveryContext.Provider value={contextValue}>
      {isPaused ? (
        <aside className="sticky top-0 z-30 border-b border-[#C6CDE8] bg-secondary px-4 py-2.5 text-secondary-foreground shadow-sm">
          <div className="mx-auto flex max-w-[834px] flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold sm:text-base">
              Recovery paused — safety records are read-only.
            </p>
            <Button
              ref={resumeButtonRef}
              type="button"
              variant="outline"
              className="min-h-12 border-[#C6CDE8] bg-card px-5 text-primary"
              onClick={() =>
                setState((current) =>
                  current.phase === "paused" ? current.recovery : current,
                )
              }
            >
              RESUME
            </Button>
          </div>
        </aside>
      ) : null}

      {state.phase === "authorization_required" ? (
        <RecoveryOpeningScreen
          authorizationRequired
          onAuthorize={requireAuthorization}
        />
      ) : renderOpeningBackground ? (
        <RecoveryOpeningScreen />
      ) : (
        children
      )}

      {modalVisible ? (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-background/95 px-5 py-8 backdrop-blur-sm">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="recovery-dialog-heading"
            className="w-full max-w-lg rounded-2xl border border-card-border bg-card p-7 shadow-xl"
          >
            <p className="text-sm font-bold tracking-[0.1em] text-muted-foreground">
              EMPTY-DEVICE RECOVERY
            </p>
            <h1
              ref={dialogHeadingRef}
              id="recovery-dialog-heading"
              tabIndex={-1}
              className="mt-2 text-2xl font-bold outline-none"
            >
              {heading}
            </h1>
            <p className="mt-3 text-base font-medium leading-relaxed text-muted-foreground">
              Recovery copies selected jobs, AHAs, and verified PDFs to this
              device. It does not enable live syncing.
            </p>

            {offer ? (
              <>
                {offer.jobs.length > JOB_SEARCH_THRESHOLD ? (
                  <label className="mt-5 block text-base font-bold">
                    Find a job
                    <span className="relative mt-2 block">
                      <Search
                        className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <Input
                        type="search"
                        className="min-h-12 pl-11 text-base"
                        value={offer.query}
                        onChange={(event) =>
                          setState({ ...offer, query: event.target.value })
                        }
                        placeholder="Search job name or city"
                      />
                    </span>
                  </label>
                ) : null}
                <p
                  className="mt-5 text-sm font-bold text-muted-foreground"
                  role="status"
                >
                  {offer.selectedIds.size} of {offer.jobs.length} selected
                </p>
                <div className="mt-2 space-y-2">
                  {visibleJobs.map((job) => (
                    <label
                      key={job.id}
                      className="flex min-h-12 items-center gap-3 rounded-lg border border-border px-3 py-2 text-base font-semibold"
                    >
                      <input
                        type="checkbox"
                        className="size-5 shrink-0"
                        checked={offer.selectedIds.has(job.id)}
                        onChange={(event) => {
                          const selectedIds = new Set(offer.selectedIds);
                          if (event.target.checked) selectedIds.add(job.id);
                          else selectedIds.delete(job.id);
                          setState({ ...offer, selectedIds });
                        }}
                      />
                      <span className="min-w-0">
                        <span className="block font-bold">{job.name}</span>
                        <span className="block font-medium text-muted-foreground">
                          {job.cityLabel}
                        </span>
                      </span>
                    </label>
                  ))}
                  {!visibleJobs.length ? (
                    <p className="rounded-lg border border-border px-4 py-4 text-base font-semibold text-muted-foreground">
                      No jobs match that search.
                    </p>
                  ) : null}
                </div>
              </>
            ) : state.phase === "resumable" && state.jobs.length ? (
              <div className="mt-5 space-y-2">
                {state.jobs.map((job) => (
                  <div
                    key={job.id}
                    className="flex min-h-12 items-center rounded-lg border border-border px-3 py-2 text-base font-semibold"
                  >
                    {job.name} — {job.cityLabel}
                  </div>
                ))}
              </div>
            ) : null}

            {state.phase === "restoring" ? (
              <p className="mt-4 text-base font-semibold" role="status">
                {state.message}
              </p>
            ) : null}
            {error ? (
              <div
                className="mt-4 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-warning-foreground"
                role="alert"
              >
                <p className="text-base font-semibold">{error}</p>
                {hasPendingRecovery ? (
                  <p className="mt-2 text-sm font-medium">
                    Progress and verified copies remain in this browser. Private
                    browsing may clear local progress when all private windows
                    close.
                  </p>
                ) : null}
              </div>
            ) : null}

            <Button
              className="mt-6 min-h-14 w-full text-base font-bold"
              disabled={
                state.phase === "restoring" ||
                (offer !== null && offer.selectedIds.size === 0)
              }
              onClick={() => {
                if (state.phase === "discovery_failed") {
                  setDiscoveryAttempt((value) => value + 1);
                } else if (state.phase === "invalid_progress") {
                  void restartRecovery();
                } else {
                  void restore();
                }
              }}
            >
              {state.phase === "restoring"
                ? "RESTORING…"
                : state.phase === "discovery_failed"
                  ? "TRY AGAIN"
                  : state.phase === "invalid_progress"
                    ? "RESTART RECOVERY"
                    : state.phase === "resumable" && state.error
                      ? "TRY AGAIN"
                      : state.phase === "resumable"
                        ? "RESUME RECOVERY"
                        : "RESTORE SELECTED JOBS"}
            </Button>

            {state.phase === "resumable" ||
            state.phase === "invalid_progress" ? (
              <Button
                type="button"
                variant="outline"
                className="mt-3 min-h-12 w-full border-[#C6CDE8] text-primary"
                onClick={leaveForNow}
              >
                LEAVE FOR NOW
              </Button>
            ) : state.phase === "offer" ||
              state.phase === "discovery_failed" ? (
              <Button
                type="button"
                variant="ghost"
                className="mt-2 min-h-12 w-full text-base text-primary"
                onClick={skipRecovery}
              >
                SET UP WITHOUT RESTORING
              </Button>
            ) : null}
          </section>
        </div>
      ) : null}
    </RecoveryContext.Provider>
  );
}
