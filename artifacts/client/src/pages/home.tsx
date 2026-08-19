import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Check } from "lucide-react";
import { useNavigate } from "react-router";
import {
  canStartSigning,
  getReviewReport,
  type Aha,
} from "@workspace/aha-domain";

import { AppLogo } from "@/components/aha/app-logo";
import { HomeStateCard } from "@/components/aha/home-state-card";
import { getHomeSnapshot, startToday } from "@/data/aha-repository";
import { useToday } from "@/hooks/use-today";
import { formatLongDate, formatShortDate } from "@/lib/date-format";

const RECENT_AHA_STATUS_LABELS = {
  completed: "Completed",
  draft: "Draft",
  in_progress: "Signing",
} as const satisfies Record<Aha["status"], string>;

function EmptyJobState() {
  return (
    <main className="min-h-screen bg-background px-5 py-12">
      <section className="mx-auto max-w-lg rounded-2xl border border-card-border bg-card p-8 text-center shadow-sm">
        <div className="flex justify-center">
          <AppLogo />
        </div>
        <h1 className="mt-8 text-2xl font-bold">No job is set up yet</h1>
        <p className="mt-3 text-base font-medium leading-relaxed text-muted-foreground">
          No job has been set up on this iPad. Your existing local data has not
          been changed.
        </p>
      </section>
    </main>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const today = useToday();
  const snapshot = useLiveQuery(() => getHomeSnapshot(today), [today]);
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  if (!snapshot) {
    return (
      <main className="min-h-screen bg-background px-5 py-12">
        <p className="text-center text-base font-semibold text-muted-foreground">
          Opening today's AHA…
        </p>
      </main>
    );
  }

  if (!snapshot.job) {
    return <EmptyJobState />;
  }
  const job = snapshot.job;

  const openEditor = (ahaId: string) => navigate(`/ahas/${ahaId}/details`);
  const handleStart = async () => {
    if (isStarting) return;
    setIsStarting(true);
    setStartError(null);
    try {
      const result = await startToday(job, today);
      openEditor(result.aha.id);
    } catch {
      setStartError(
        "We couldn't start today's AHA. Nothing was deleted. Try again.",
      );
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <main className="min-h-screen bg-background px-5 pb-16 pt-7 text-foreground sm:px-7 sm:pt-10">
      <div className="mx-auto flex max-w-[700px] flex-col gap-6">
        <header className="flex items-center gap-4">
          <AppLogo />
          <p className="ml-auto text-right text-base font-semibold text-muted-foreground sm:text-lg">
            {formatLongDate(today)}
          </p>
        </header>

        <section className="rounded-[14px] border border-card-border bg-card px-5 py-6 sm:px-7">
          <p className="text-sm font-bold tracking-[0.1em] text-muted-foreground">
            CURRENT JOB
          </p>
          <h1 className="mt-1 text-2xl font-bold">{job.name}</h1>
          <p className="mt-1 text-lg font-medium text-muted-foreground">
            {job.cityLabel}
          </p>

          {snapshot.recentAhas.length ? (
            <div className="mt-5 border-t border-border pt-4">
              <p className="text-sm font-semibold tracking-wide text-muted-foreground">
                Recent AHAs
              </p>
              <ul
                className="mt-2 divide-y divide-border"
                aria-label="Recent AHAs"
              >
                {snapshot.recentAhas.map((aha) => {
                  const statusLabel = RECENT_AHA_STATUS_LABELS[aha.status];
                  return (
                    <li
                      key={aha.id}
                      className="flex min-h-12 items-center justify-between gap-4 py-2 text-base font-semibold"
                      aria-label={`${formatShortDate(aha.date)}, ${statusLabel}`}
                    >
                      <time dateTime={aha.date}>
                        {formatShortDate(aha.date)}
                      </time>
                      {aha.status === "completed" ? (
                        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-success">
                          <Check
                            className="size-5"
                            strokeWidth={3}
                            aria-hidden="true"
                          />
                          {statusLabel}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          {statusLabel}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </section>

        {snapshot.unreadableCount ? (
          <div
            className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-base font-semibold leading-relaxed text-warning-foreground"
            role="status"
          >
            {snapshot.unreadableCount === 1
              ? "1 saved AHA could not be read. It remains on this iPad; readable AHAs are still available."
              : `${snapshot.unreadableCount} saved AHAs could not be read. They remain on this iPad; readable AHAs are still available.`}
          </div>
        ) : null}

        {startError ? (
          <div
            className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-base font-semibold text-destructive"
            role="alert"
          >
            {startError}
          </div>
        ) : null}

        <HomeStateCard
          todayAha={snapshot.todayAha}
          todayPdfStatus={snapshot.todayPdfStatus}
          hasRecentAha={snapshot.recentAhas.length > 0}
          isStarting={isStarting}
          onStart={() => void handleStart()}
          onOpenEditor={() =>
            snapshot.todayAha && openEditor(snapshot.todayAha.id)
          }
          onResumeInProgress={() => {
            if (!snapshot.todayAha) return;
            navigate(
              canStartSigning(snapshot.todayAha)
                ? `/ahas/${snapshot.todayAha.id}/sign`
                : `/ahas/${snapshot.todayAha.id}/review`,
            );
          }}
          onViewCompleted={() => {
            if (!snapshot.todayAha) return;
            navigate(
              snapshot.todayPdfStatus === "current"
                ? `/ahas/${snapshot.todayAha.id}/pdf`
                : !getReviewReport(snapshot.todayAha).canStartSigning
                  ? `/ahas/${snapshot.todayAha.id}/update/review`
                  : `/ahas/${snapshot.todayAha.id}/completed`,
            );
          }}
          onUpdateCompleted={() => {
            if (!snapshot.todayAha) return;
            navigate(`/ahas/${snapshot.todayAha.id}/update/details`);
          }}
        />
      </div>
    </main>
  );
}
