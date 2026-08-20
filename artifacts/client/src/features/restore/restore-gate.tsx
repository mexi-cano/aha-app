import { useEffect, useState, type ReactNode } from "react";
import type { Job } from "@workspace/aha-domain";

import { Button } from "@/components/ui/button";
import { ahaDatabase } from "@/data/database";
import {
  beginRestore,
  getRestoreProgress,
  listRemoteJobs,
  resumeRestore,
} from "@/data/restore";
import { useAuthorization } from "@/features/auth/auth-context";

interface RestoreOffer {
  jobs: Job[];
  isResume: boolean;
}

export function RestoreGate({ children }: { children: ReactNode }) {
  const { isAuthorizedForNetwork } = useAuthorization();
  const [offer, setOffer] = useState<RestoreOffer | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isRestoring, setIsRestoring] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    if (!isAuthorizedForNetwork || finished) return;
    let cancelled = false;
    void (async () => {
      const progress = await getRestoreProgress();
      if (progress) {
        if (!cancelled) {
          setOffer({ jobs: progress.jobs, isResume: true });
          setSelected(new Set(progress.jobs.map((job) => job.id)));
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
        // Setup remains available. Recovery can be offered after connectivity returns.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [finished, isAuthorizedForNetwork]);

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
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Recovery stopped safely. Try again.",
      );
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <>
      {children}
      {offer ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-background/95 px-5 py-8 backdrop-blur-sm">
          <section className="w-full max-w-lg rounded-2xl border border-card-border bg-card p-7 shadow-xl">
            <p className="text-sm font-bold tracking-[0.1em] text-muted-foreground">
              EMPTY-IPAD RECOVERY
            </p>
            <h1 className="mt-2 text-2xl font-bold">
              {offer.isResume
                ? "Resume saved recovery"
                : "Restore backed-up jobs?"}
            </h1>
            <p className="mt-3 text-base font-medium leading-relaxed text-muted-foreground">
              This iPad has no configured work. Recovery copies selected jobs,
              AHAs, and verified PDFs here; it does not enable live syncing.
            </p>
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
            {message && isRestoring ? (
              <p className="mt-4 text-base font-semibold" role="status">
                {message}
              </p>
            ) : null}
            {error ? (
              <p
                className="mt-4 text-base font-semibold text-destructive"
                role="alert"
              >
                {error} Progress remains saved on this iPad.
              </p>
            ) : null}
            <Button
              className="mt-6 min-h-14 w-full text-base font-bold"
              disabled={isRestoring || selected.size === 0}
              onClick={() => void restore()}
            >
              {isRestoring
                ? "RESTORING…"
                : offer.isResume
                  ? "RESUME RECOVERY"
                  : "RESTORE SELECTED JOBS"}
            </Button>
            {!offer.isResume ? (
              <Button
                variant="ghost"
                className="mt-2 min-h-12 w-full text-base text-primary"
                onClick={() => setOffer(null)}
              >
                Set up this iPad without restoring
              </Button>
            ) : null}
          </section>
        </div>
      ) : null}
    </>
  );
}
