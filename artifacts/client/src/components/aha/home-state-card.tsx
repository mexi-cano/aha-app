import { Check } from "lucide-react";
import type { Aha } from "@workspace/aha-domain";

import { Button } from "@/components/ui/button";

interface HomeStateCardProps {
  todayAha: Aha | null;
  hasRecentAha: boolean;
  isStarting: boolean;
  onStart: () => void;
  onOpenEditor: () => void;
}

export function HomeStateCard({
  todayAha,
  hasRecentAha,
  isStarting,
  onStart,
  onOpenEditor,
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
    const signed = todayAha.crew.filter(
      ({ signaturePng }) => signaturePng !== null,
    ).length;
    return (
      <section className="rounded-2xl border border-card-border bg-card px-6 py-9 text-center shadow-sm sm:px-10">
        <h2 className="text-2xl font-semibold">AHA in progress</h2>
        <p className="mt-1 text-lg font-medium text-muted-foreground">
          {signed} of {todayAha.crew.length} signed
        </p>
        <p className="mt-5 text-base font-medium text-muted-foreground">
          Signing is underway on this iPad.
        </p>
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
        The completed AHA is saved on this iPad.
      </p>
    </section>
  );
}
