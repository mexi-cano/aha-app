import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router";
import { canStartSigning, type Aha } from "@workspace/aha-domain";

import { AppLogo } from "@/components/aha/app-logo";
import { BackupStatus } from "@/components/aha/backup-status";
import { HomeStateCard } from "@/components/aha/home-state-card";
import { Button } from "@/components/ui/button";
import { getHomeSnapshot, startToday } from "@/data/aha-repository";
import {
  getJobSetupDraftKeys,
  jobSetupDraftKey,
} from "@/data/job-setup-draft-repository";
import { createPdfNavigationState } from "@/features/aha-editor/pdf-navigation";
import { useRecoveryState } from "@/features/restore/restore-gate";
import { useToday } from "@/hooks/use-today";
import { formatLongDate, formatShortDate } from "@/lib/date-format";
import { cn } from "@/lib/utils";

const RECENT_AHA_STATUS_LABELS = {
  completed: "Completed",
  draft: "Draft",
  in_progress: "Signing",
} as const satisfies Record<Aha["status"], string>;

function EmptyJobState({
  hasJobs,
  isReadOnly,
  onSetup,
  onChoose,
  onResumeRecovery,
  hasSetupDraft,
}: {
  hasJobs: boolean;
  isReadOnly: boolean;
  onSetup: () => void;
  onChoose: () => void;
  onResumeRecovery: () => void;
  hasSetupDraft: boolean;
}) {
  return (
    <main className="min-h-screen bg-background px-5 py-12">
      <section className="mx-auto max-w-lg rounded-2xl border border-card-border bg-card p-8 text-center shadow-sm">
        <div className="flex justify-center">
          <AppLogo />
        </div>
        <h1 className="mt-8 text-2xl font-bold">
          {isReadOnly && hasSetupDraft
            ? "Saved job setup"
            : isReadOnly && hasJobs
              ? "Recovery paused"
              : hasJobs
                ? "Choose the restored job"
                : hasSetupDraft
                  ? "Continue setting up your job"
                  : "No job is set up yet"}
        </h1>
        <p className="mt-3 text-base font-medium leading-relaxed text-muted-foreground">
          {isReadOnly && hasSetupDraft
            ? "Your unfinished setup remains saved on this iPad. You can review it while recovery keeps changes read-only."
            : isReadOnly && hasJobs
              ? "Choose a verified saved job to view its completed documents, or resume recovery from the banner above."
              : hasJobs
                ? "Recovery is complete. Choose the job to open; the app will not guess for you."
                : hasSetupDraft
                  ? "Your unfinished setup is saved on this iPad. Continue where you left off."
                  : "No job has been set up on this iPad. Your existing local data has not been changed."}
        </p>
        <Button
          className="mt-7 min-h-14 w-full text-base font-bold"
          onClick={
            isReadOnly && hasSetupDraft
              ? onSetup
              : isReadOnly
                ? hasJobs
                  ? onChoose
                  : onResumeRecovery
                : hasJobs
                  ? onChoose
                  : onSetup
          }
        >
          {isReadOnly && hasSetupDraft
            ? "VIEW SAVED SETUP"
            : isReadOnly && hasJobs
              ? "CHOOSE SAVED JOB"
              : isReadOnly
                ? "RESUME RECOVERY"
                : hasJobs
                  ? "CHOOSE A JOB"
                  : hasSetupDraft
                    ? "CONTINUE JOB SETUP"
                    : "SET UP A JOB"}
        </Button>
      </section>
    </main>
  );
}

function SetupDraftNotice({
  title,
  description,
  action,
  onOpen,
}: {
  title: string;
  description: string;
  action: string;
  onOpen: () => void;
}) {
  return (
    <section className="rounded-xl border border-[#C6CDE8] bg-secondary px-4 py-4 text-secondary-foreground">
      <p className="text-base font-bold">{title}</p>
      <p className="mt-1 text-sm font-medium leading-relaxed">{description}</p>
      <Button
        variant="outline"
        className="mt-3 min-h-12 bg-card text-base text-primary"
        onClick={onOpen}
      >
        {action}
      </Button>
    </section>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const { isPaused, isWriteBlocked, resumeRecovery } = useRecoveryState();
  const today = useToday();
  const snapshot = useLiveQuery(() => getHomeSnapshot(today), [today]);
  const setupDraftKeys = useLiveQuery(getJobSetupDraftKeys);
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  if (!snapshot || setupDraftKeys === undefined) {
    return (
      <main className="min-h-screen bg-background px-5 py-12">
        <p className="text-center text-base font-semibold text-muted-foreground">
          Opening today's AHA…
        </p>
      </main>
    );
  }

  if (!snapshot.job) {
    return (
      <EmptyJobState
        hasJobs={snapshot.jobCount > 0}
        isReadOnly={isWriteBlocked}
        onSetup={() => navigate("/setup")}
        onChoose={() => navigate("/jobs")}
        onResumeRecovery={resumeRecovery}
        hasSetupDraft={setupDraftKeys.includes(jobSetupDraftKey(null))}
      />
    );
  }
  const job = snapshot.job;
  const hasNewJobDraft = setupDraftKeys.includes(jobSetupDraftKey(null));
  const hasActiveJobDraft = setupDraftKeys.includes(jobSetupDraftKey(job.id));

  const openEditor = (ahaId: string) => navigate(`/ahas/${ahaId}/details`);
  const handleStart = async () => {
    if (isStarting || isWriteBlocked) return;
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
          <div className="ml-auto text-right">
            <p className="text-base font-semibold text-muted-foreground sm:text-lg">
              {formatLongDate(today)}
            </p>
            <BackupStatus className="justify-end" />
          </div>
        </header>

        {hasActiveJobDraft ? (
          <SetupDraftNotice
            title={`Unfinished updates to ${job.name}`}
            description="Your changes to this job's defaults and roster are saved on this iPad."
            action={
              isWriteBlocked ? "View saved changes" : "Continue job updates"
            }
            onOpen={() => navigate(`/jobs/${job.id}/setup`)}
          />
        ) : null}

        {hasNewJobDraft ? (
          <SetupDraftNotice
            title="Unfinished new job setup"
            description="Your entered details and workers are saved on this iPad."
            action={isWriteBlocked ? "View saved setup" : "Continue job setup"}
            onOpen={() => navigate("/setup")}
          />
        ) : null}

        <section className="rounded-[14px] border border-card-border bg-card px-5 py-6 sm:px-7">
          <p className="text-sm font-bold tracking-[0.1em] text-muted-foreground">
            CURRENT JOB
          </p>
          <h1 className="mt-1 text-2xl font-bold">{job.name}</h1>
          <p className="mt-1 text-lg font-medium text-muted-foreground">
            {job.cityLabel}
          </p>
          <Button
            variant="ghost"
            className="mt-3 min-h-12 px-0 text-base text-primary"
            onClick={() => navigate("/jobs")}
          >
            {isPaused ? "Choose saved job" : "Change job or update defaults"}
          </Button>

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
                  const opensCurrentPdf =
                    aha.status === "completed" &&
                    snapshot.recentAhaPdfStatuses[aha.id] === "current";
                  return (
                    <li key={aha.id}>
                      {aha.status === "completed" ? (
                        <button
                          type="button"
                          className="flex min-h-12 w-full items-center justify-between gap-4 rounded-lg py-2 text-left text-base font-semibold outline-none focus-visible:ring-4 focus-visible:ring-secondary"
                          aria-label={`${formatShortDate(aha.date)}, ${statusLabel}, ${opensCurrentPdf ? "view PDF" : "open AHA history"}`}
                          onClick={() => {
                            if (opensCurrentPdf) {
                              navigate(`/ahas/${aha.id}/pdf`, {
                                state: createPdfNavigationState("home"),
                              });
                            } else {
                              navigate("/history");
                            }
                          }}
                        >
                          <time dateTime={aha.date}>
                            {formatShortDate(aha.date)}
                          </time>
                          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-success">
                            <Check
                              className="size-5"
                              strokeWidth={3}
                              aria-hidden="true"
                            />
                            {statusLabel}
                            <ChevronRight
                              className="size-5 text-primary"
                              aria-hidden="true"
                            />
                          </span>
                        </button>
                      ) : (
                        <div className="flex min-h-12 items-center justify-between gap-4 py-2 text-base font-semibold">
                          <time dateTime={aha.date}>
                            {formatShortDate(aha.date)}
                          </time>
                          <span className="text-sm text-muted-foreground">
                            {statusLabel}
                          </span>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
          {snapshot.completedAhaCount ? (
            <Button
              variant="ghost"
              className={cn(
                snapshot.recentAhas.length ? "mt-2" : "mt-4",
                "min-h-12 w-full justify-between px-0 text-base text-primary",
              )}
              onClick={() => navigate("/history")}
            >
              View all completed AHAs
              <ChevronRight className="size-5" aria-hidden="true" />
            </Button>
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

        {isWriteBlocked ? (
          <section className="rounded-xl border border-[#C6CDE8] bg-secondary px-4 py-4 text-secondary-foreground">
            <p className="text-base font-bold">Safety records are read-only.</p>
            <p className="mt-1 text-sm font-medium leading-relaxed">
              Completed documents remain available. Resume recovery before
              starting or changing an AHA.
            </p>
            <Button
              type="button"
              variant="outline"
              className="mt-3 min-h-12 w-full border-[#C6CDE8] bg-card text-primary"
              onClick={resumeRecovery}
              disabled={!isPaused}
            >
              RESUME RECOVERY
            </Button>
          </section>
        ) : null}

        <HomeStateCard
          todayAha={snapshot.todayAha}
          todayPdfStatus={snapshot.todayPdfStatus}
          hasRecentAha={snapshot.recentAhas.length > 0}
          isStarting={isStarting}
          isReadOnly={isWriteBlocked}
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
            navigate(`/ahas/${snapshot.todayAha.id}/completed`);
          }}
        />
      </div>
    </main>
  );
}
