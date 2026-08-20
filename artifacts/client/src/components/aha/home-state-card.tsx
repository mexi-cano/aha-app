import { Check } from "lucide-react";
import {
  canFinishAha,
  canStartSigning,
  countSignedCrew,
  getReviewReport,
  type Aha,
} from "@workspace/aha-domain";

import { Button } from "@/components/ui/button";
import type { AhaPdfStatus } from "@/data/aha-repository";

interface HomeStateCardProps {
  todayAha: Aha | null;
  todayPdfStatus: AhaPdfStatus | null;
  hasRecentAha: boolean;
  isStarting: boolean;
  onStart: () => void;
  onOpenEditor: () => void;
  onResumeInProgress: () => void;
  onViewCompleted: () => void;
  onUpdateCompleted: () => void;
}

export function HomeStateCard({
  todayAha,
  todayPdfStatus,
  hasRecentAha,
  isStarting,
  onStart,
  onOpenEditor,
  onResumeInProgress,
  onViewCompleted,
  onUpdateCompleted,
}: HomeStateCardProps) {
  if (!todayAha) {
    return (
      <section className="rounded-2xl border border-card-border bg-card px-6 py-9 text-center shadow-sm sm:px-10">
        <h2 className="text-2xl font-semibold">
          Today's AHA has not been started
        </h2>
        <Button
          className="mt-7 min-h-[72px] w-full rounded-[14px] text-xl font-bold tracking-wide"
          onClick={onStart}
          disabled={isStarting}
        >
          {isStarting ? "STARTING…" : "START TODAY'S AHA"}
        </Button>
        <p className="mt-3 text-base font-medium text-muted-foreground">
          {hasRecentAha ? "Starts with your most recent AHA" : "Starts blank"}
        </p>
      </section>
    );
  }

  if (todayAha.status === "draft") {
    return (
      <section className="rounded-2xl border border-card-border bg-card px-6 py-9 text-center shadow-sm sm:px-10">
        <h2 className="text-2xl font-semibold">AHA in progress — Draft</h2>
        <Button
          className="mt-7 min-h-[72px] w-full rounded-[14px] text-xl font-bold tracking-wide"
          onClick={onOpenEditor}
        >
          CONTINUE TODAY'S AHA
        </Button>
      </section>
    );
  }

  if (todayAha.status === "in_progress") {
    const signed = countSignedCrew(todayAha);
    const signingReady = canStartSigning(todayAha);
    const readyToFinish = canFinishAha(todayAha);
    return (
      <section className="rounded-2xl border border-card-border bg-card px-6 py-9 text-center shadow-sm sm:px-10">
        <h2 className="text-2xl font-semibold">
          {readyToFinish ? "AHA ready to finish" : "AHA in progress"}
        </h2>
        <p className="mt-1 text-lg font-medium text-muted-foreground">
          {signed} of {todayAha.crew.length} signed
        </p>
        <div className="mt-7 flex flex-col gap-3">
          <Button
            className="min-h-[72px] w-full rounded-[14px] text-xl font-bold tracking-wide"
            onClick={onResumeInProgress}
          >
            {readyToFinish
              ? "REVIEW & FINISH"
              : signingReady
                ? "CONTINUE SIGNING"
                : "REVIEW CHANGES"}
          </Button>
          <Button
            variant="outline"
            className="min-h-[52px] w-full border-[#C6CDE8] text-[17px] text-primary"
            onClick={onOpenEditor}
          >
            Open editor
          </Button>
        </div>
        {readyToFinish ? (
          <p className="mt-3 text-base font-semibold text-muted-foreground">
            Review the saved signatures, then create the official PDF.
          </p>
        ) : !signingReady ? (
          <p className="mt-3 text-base font-semibold text-warning-foreground">
            Changes need review before signing can continue.
          </p>
        ) : null}
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-card-border bg-card px-6 py-10 text-center shadow-sm sm:px-10">
      <h2 className="inline-flex items-center justify-center gap-2 text-2xl font-semibold">
        Today's AHA — Completed
        <Check
          className="size-7 text-success"
          strokeWidth={3}
          aria-hidden="true"
        />
      </h2>
      <p className="mt-3 text-base font-medium text-muted-foreground">
        {todayPdfStatus === "current"
          ? "The completed AHA and current PDF are saved on this iPad."
          : todayPdfStatus === "unreadable"
            ? "The AHA is saved, but its stored PDF cannot be opened. The existing file was not deleted."
          : "The AHA is saved. Its current PDF still needs to be created."}
      </p>
      <div className="mt-7 flex flex-col gap-3">
        <Button
          className="min-h-[72px] w-full rounded-[14px] text-xl font-bold tracking-wide"
          onClick={onViewCompleted}
        >
          {todayPdfStatus === "current"
            ? "VIEW AHA"
            : todayPdfStatus === "unreadable"
              ? "REPAIR PDF"
            : getReviewReport(todayAha).canStartSigning
              ? "FINISH PDF"
              : "FINISH UPDATE"}
        </Button>
        <Button
          variant="outline"
          className="min-h-14 w-full border-[#C6CDE8] text-[17px] text-primary"
          onClick={onUpdateCompleted}
        >
          Update today's AHA
        </Button>
      </div>
    </section>
  );
}
