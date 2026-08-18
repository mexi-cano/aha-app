import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Check } from "lucide-react";
import { useNavigate } from "react-router";

import { AppLogo } from "@/components/aha/app-logo";
import { HomeStateCard } from "@/components/aha/home-state-card";
import { getHomeSnapshot, startToday } from "@/data/aha-repository";
import { useToday } from "@/hooks/use-today";
import { formatLongDate, formatShortDate } from "@/lib/date-format";

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
                className="mt-3 flex flex-wrap gap-2"
                aria-label="Recent AHAs"
              >
                {snapshot.recentAhas.map((aha) => (
                  <li
                    key={aha.id}
                    className="inline-flex min-h-12 items-center gap-2 rounded-[10px] border border-border bg-card px-4 text-base font-semibold"
                  >
                    {formatShortDate(aha.date)}
                    {aha.status === "completed" ? (
                      <Check
                        className="size-5 text-[#1E8E3E]"
                        strokeWidth={3}
                        aria-label="Completed"
                      />
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        {aha.status === "draft" ? "Draft" : "Signing"}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

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
          hasRecentAha={snapshot.recentAhas.length > 0}
          isStarting={isStarting}
          onStart={() => void handleStart()}
          onOpenEditor={() =>
            snapshot.todayAha && openEditor(snapshot.todayAha.id)
          }
        />
      </div>
    </main>
  );
}
