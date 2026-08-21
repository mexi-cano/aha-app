import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Job } from "@workspace/aha-domain";

import { Button } from "@/components/ui/button";
import { ahaDatabase } from "@/data/database";
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

interface RestoreOffer {
  jobs: Job[];
  isResume: boolean;
}

interface RecoveryState {
  isPaused: boolean;
  hasPendingRecovery: boolean;
  resumeRecovery: () => void;
}

const RecoveryContext = createContext<RecoveryState>({
  isPaused: false,
  hasPendingRecovery: false,
  resumeRecovery: () => undefined,
});

export function useRecoveryState(): RecoveryState {
  return useContext(RecoveryContext);
}

export function RestoreGate({ children }: { children: ReactNode }) {
  const { isAuthorizedForNetwork } = useAuthorization();
  const [offer, setOffer] = useState<RestoreOffer | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isRestoring, setIsRestoring] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [isDeferred, setIsDeferred] = useState(false);
  const [invalidProgress, setInvalidProgress] = useState(false);
  const dialogHeadingRef = useRef<HTMLHeadingElement>(null);
  const resumeButtonRef = useRef<HTMLButtonElement>(null);

  const hasPendingRecovery = Boolean(offer?.isResume || invalidProgress);
  const isPaused = isDeferred && hasPendingRecovery;
  const modalVisible = Boolean((offer || invalidProgress) && !isDeferred);

  useEffect(() => {
    if (!isAuthorizedForNetwork || finished) return;
    let cancelled = false;
    void (async () => {
      try {
        const progress = await getRestoreProgress();
        if (progress) {
          if (!cancelled) {
            setOffer({ jobs: progress.jobs, isResume: true });
            setSelected(new Set(progress.jobs.map((job) => job.id)));
          }
          return;
        }
      } catch (caught) {
        if (!cancelled && caught instanceof InvalidRestoreProgressError) {
          setInvalidProgress(true);
          setError(
            "Saved recovery progress could not be read. Restart recovery to verify the available backup again.",
          );
        }
        return;
      }

      if ((await ahaDatabase.jobs.count()) > 0) return;
      try {
        const remote = await listRemoteJobs();
        if ((await ahaDatabase.jobs.count()) > 0) return;
        if (!cancelled && remote.length) {
          const jobs = remote.map((record) => record.job);
          setOffer({ jobs, isResume: false });
          setSelected(new Set(jobs.map((job) => job.id)));
        }
      } catch {
        // Local setup remains available. Recovery can be offered later.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [finished, isAuthorizedForNetwork]);

  useEffect(() => {
    if (modalVisible) dialogHeadingRef.current?.focus();
  }, [modalVisible]);

  const restore = async () => {
    if (!offer || isRestoring) return;
    setIsRestoring(true);
    setError(null);
    try {
      if (!offer.isResume) {
        const selectedJobs = offer.jobs.filter((job) => selected.has(job.id));
        await beginRestore(selectedJobs);
        setOffer({ jobs: selectedJobs, isResume: true });
        setSelected(new Set(selectedJobs.map((job) => job.id)));
      }
      await resumeRestore(setMessage);
      setFinished(true);
      setOffer(null);
      setMessage("");
      setIsDeferred(false);
    } catch (caught) {
      setError(recoveryErrorMessage(caught, navigator.onLine));
    } finally {
      setIsRestoring(false);
    }
  };

  const restartRecovery = async () => {
    if (isRestoring) return;
    setIsRestoring(true);
    setError(null);
    try {
      await clearRestoreProgressForRestart();
      const remote = await listRemoteJobs();
      const jobs = remote.map((record) => record.job);
      if (!jobs.length) {
        setError("No backed-up jobs are currently available to restore.");
        return;
      }
      setInvalidProgress(false);
      setOffer({ jobs, isResume: false });
      setSelected(new Set(jobs.map((job) => job.id)));
    } catch (caught) {
      setError(recoveryErrorMessage(caught, navigator.onLine));
    } finally {
      setIsRestoring(false);
    }
  };

  const leaveForNow = () => {
    if (isRestoring) return;
    setIsDeferred(true);
    window.requestAnimationFrame(() => resumeButtonRef.current?.focus());
  };

  const contextValue = useMemo<RecoveryState>(
    () => ({
      isPaused,
      hasPendingRecovery,
      resumeRecovery: () => setIsDeferred(false),
    }),
    [hasPendingRecovery, isPaused],
  );

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
              onClick={() => setIsDeferred(false)}
            >
              RESUME
            </Button>
          </div>
        </aside>
      ) : null}

      {children}

      {modalVisible ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-background/95 px-5 py-8 backdrop-blur-sm">
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
              {invalidProgress
                ? "Restart saved recovery"
                : offer?.isResume
                  ? "Resume saved recovery"
                  : "Restore backed-up jobs?"}
            </h1>
            <p className="mt-3 text-base font-medium leading-relaxed text-muted-foreground">
              Recovery copies selected jobs, AHAs, and verified PDFs to this
              device. It does not enable live syncing.
            </p>

            {offer?.jobs.length ? (
              <div className="mt-5 space-y-2">
                {offer.jobs.map((job) => (
                  <label
                    key={job.id}
                    className="flex min-h-12 items-center gap-3 rounded-lg border border-border px-3 text-base font-semibold"
                  >
                    <input
                      type="checkbox"
                      className="size-5"
                      disabled={offer.isResume || isRestoring}
                      checked={selected.has(job.id)}
                      onChange={(event) => {
                        setSelected((current) => {
                          const next = new Set(current);
                          if (event.target.checked) next.add(job.id);
                          else next.delete(job.id);
                          return next;
                        });
                      }}
                    />
                    <span>
                      {job.name} — {job.cityLabel}
                    </span>
                  </label>
                ))}
              </div>
            ) : null}

            {message && isRestoring ? (
              <p className="mt-4 text-base font-semibold" role="status">
                {message}
              </p>
            ) : null}
            {error ? (
              <div
                className="mt-4 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-warning-foreground"
                role="alert"
              >
                <p className="text-base font-semibold">{error}</p>
                <p className="mt-2 text-sm font-medium">
                  Progress and verified copies remain in this browser. Private
                  browsing may clear local progress when all private windows
                  close.
                </p>
              </div>
            ) : null}

            <Button
              className="mt-6 min-h-14 w-full text-base font-bold"
              disabled={
                isRestoring ||
                (!invalidProgress && Boolean(offer) && selected.size === 0)
              }
              onClick={() =>
                void (invalidProgress ? restartRecovery() : restore())
              }
            >
              {isRestoring
                ? "RESTORING…"
                : invalidProgress
                  ? "RESTART RECOVERY"
                  : error && offer?.isResume
                    ? "TRY AGAIN"
                    : offer?.isResume
                      ? "RESUME RECOVERY"
                      : "RESTORE SELECTED JOBS"}
            </Button>

            {hasPendingRecovery ? (
              <Button
                type="button"
                variant="outline"
                className="mt-3 min-h-12 w-full border-[#C6CDE8] text-primary"
                disabled={isRestoring}
                onClick={leaveForNow}
              >
                LEAVE FOR NOW
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                className="mt-2 min-h-12 w-full text-base text-primary"
                onClick={() => {
                  setOffer(null);
                  setFinished(true);
                }}
              >
                Set up this device without restoring
              </Button>
            )}
          </section>
        </div>
      ) : null}
    </RecoveryContext.Provider>
  );
}
