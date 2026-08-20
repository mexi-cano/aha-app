import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AlertTriangle, Check, ChevronRight, FileText } from "lucide-react";
import { useNavigate } from "react-router";

import { AppLogo } from "@/components/aha/app-logo";
import { Button } from "@/components/ui/button";
import {
  getCompletedAhaHistorySnapshot,
  type AhaPdfStatus,
} from "@/data/aha-repository";
import { createPdfNavigationState } from "@/features/aha-editor/pdf-navigation";
import { formatEditorDate, formatTime } from "@/lib/date-format";
import { generateAndStoreAhaPdf } from "@/pdf";

const PAGE_SIZE = 20;

const PDF_STATUS_COPY = {
  current: "PDF ready",
  missing: "PDF unavailable",
  stale: "PDF out of date",
  unreadable: "PDF unreadable",
} as const satisfies Record<AhaPdfStatus, string>;

type RecreationFailure = "fit_failed" | "failed";

export default function History() {
  const navigate = useNavigate();
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE);
  const [recreatingId, setRecreatingId] = useState<string | null>(null);
  const [failures, setFailures] = useState<
    Record<string, RecreationFailure | undefined>
  >({});
  const previousJobId = useRef<string | null>(null);
  const snapshot = useLiveQuery(
    () => getCompletedAhaHistorySnapshot(visibleLimit),
    [visibleLimit],
  );

  useEffect(() => {
    const jobId = snapshot?.job?.id ?? null;
    if (previousJobId.current && jobId !== previousJobId.current) {
      setVisibleLimit(PAGE_SIZE);
      setFailures({});
      setRecreatingId(null);
    }
    previousJobId.current = jobId;
  }, [snapshot?.job?.id]);

  if (!snapshot) {
    return (
      <main className="min-h-screen bg-background px-5 py-12 text-center text-base font-semibold text-muted-foreground">
        Opening completed AHAs…
      </main>
    );
  }

  const recreate = async (
    item: (typeof snapshot.items)[number],
  ): Promise<void> => {
    if (!snapshot.job || recreatingId) return;
    const jobId = snapshot.job.id;
    setRecreatingId(item.aha.id);
    setFailures((current) => ({ ...current, [item.aha.id]: undefined }));
    const result = await generateAndStoreAhaPdf(item.aha, snapshot.job);
    if (previousJobId.current !== jobId) return;
    setRecreatingId(null);

    if (result.status === "stored") {
      navigate(`/ahas/${item.aha.id}/pdf`, {
        state: createPdfNavigationState("history"),
      });
    } else {
      setFailures((current) => ({
        ...current,
        [item.aha.id]: result.status === "fit_failed" ? "fit_failed" : "failed",
      }));
    }
  };

  return (
    <main className="min-h-screen bg-background px-5 pb-16 pt-7 text-foreground sm:px-7 sm:pt-10">
      <div className="mx-auto flex max-w-[700px] flex-col gap-5">
        <header className="flex items-center gap-4">
          <AppLogo />
          <Button
            variant="ghost"
            className="ml-auto min-h-12 text-base text-primary"
            onClick={() => navigate("/")}
          >
            Home
          </Button>
        </header>

        <div>
          <p className="text-sm font-bold tracking-[0.1em] text-muted-foreground">
            COMPLETED AHAS
          </p>
          <h1 className="mt-1 text-3xl font-bold">AHA history</h1>
          <p className="mt-2 text-base font-medium leading-relaxed text-muted-foreground">
            {snapshot.job
              ? `${snapshot.job.name} · Completed records saved on this iPad.`
              : "Choose a job before opening its completed records."}
          </p>
        </div>

        {snapshot.unreadableCount ? (
          <div
            className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-base font-semibold leading-relaxed text-warning-foreground"
            role="status"
          >
            <AlertTriangle
              className="mr-2 inline size-5 align-text-bottom"
              aria-hidden="true"
            />
            {snapshot.unreadableCount === 1
              ? "1 saved AHA could not be read. It remains on this iPad; readable completed AHAs are shown below."
              : `${snapshot.unreadableCount} saved AHAs could not be read. They remain on this iPad; readable completed AHAs are shown below.`}
          </div>
        ) : null}

        {!snapshot.job ? (
          <section className="rounded-[14px] border border-card-border bg-card p-6 text-center">
            <h2 className="text-xl font-bold">No active job</h2>
            <Button
              className="mt-5 min-h-12 w-full"
              onClick={() => navigate("/jobs")}
            >
              Choose a job
            </Button>
          </section>
        ) : snapshot.items.length === 0 ? (
          <section className="rounded-[14px] border border-card-border bg-card p-7 text-center">
            <FileText
              className="mx-auto size-10 text-muted-foreground"
              aria-hidden="true"
            />
            <h2 className="mt-4 text-xl font-bold">No completed AHAs yet</h2>
            <p className="mt-2 text-base font-medium text-muted-foreground">
              Completed AHAs for this job will appear here automatically.
            </p>
          </section>
        ) : (
          <>
            <ol className="flex flex-col gap-3" aria-label="Completed AHAs">
              {snapshot.items.map((item) => {
                const isCurrent = item.pdf.status === "current";
                const isRecreating = recreatingId === item.aha.id;
                const failure = failures[item.aha.id];
                return (
                  <li
                    key={item.aha.id}
                    className="rounded-[14px] border border-card-border bg-card p-5 sm:p-6"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <h2 className="text-lg font-bold">
                          <time dateTime={item.aha.date}>
                            {formatEditorDate(item.aha.date)}
                          </time>
                        </h2>
                        <p className="mt-1 text-sm font-semibold text-muted-foreground">
                          {item.aha.completedAt
                            ? `Completed ${formatTime(item.aha.completedAt)}`
                            : "Completion time unavailable"}
                        </p>
                        <p
                          className={`mt-2 inline-flex min-h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-bold ${
                            isCurrent
                              ? "bg-success/10 text-success"
                              : "bg-warning/10 text-warning-foreground"
                          }`}
                        >
                          {isCurrent ? (
                            <Check
                              className="size-4"
                              strokeWidth={3}
                              aria-hidden="true"
                            />
                          ) : null}
                          {PDF_STATUS_COPY[item.pdf.status]}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant={isCurrent ? "outline" : "default"}
                        className={`min-h-12 w-full shrink-0 text-base sm:w-auto ${
                          isCurrent ? "text-primary" : ""
                        }`}
                        disabled={Boolean(recreatingId)}
                        onClick={() => {
                          if (isCurrent) {
                            navigate(`/ahas/${item.aha.id}/pdf`, {
                              state: createPdfNavigationState("history"),
                            });
                          } else {
                            void recreate(item);
                          }
                        }}
                      >
                        {isCurrent
                          ? "View PDF"
                          : isRecreating
                            ? "Recreating…"
                            : "Recreate PDF"}
                        {!isRecreating ? (
                          <ChevronRight className="size-5" aria-hidden="true" />
                        ) : null}
                      </Button>
                    </div>

                    {failure ? (
                      <div
                        className="mt-4 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm font-semibold text-warning-foreground"
                        role="alert"
                      >
                        <p>
                          {failure === "fit_failed"
                            ? "This saved AHA no longer fits the official PDF sheet. The completed AHA and every signature remain saved. Contact support; historical content cannot be edited."
                            : "We couldn't recreate the PDF. The completed AHA and every signature remain saved."}
                        </p>
                        {failure === "failed" ? (
                          <Button
                            type="button"
                            variant="outline"
                            className="mt-3 min-h-12 w-full border-warning/40 bg-card text-warning-foreground"
                            disabled={Boolean(recreatingId)}
                            onClick={() => void recreate(item)}
                          >
                            Retry
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ol>

            {snapshot.items.length < snapshot.totalCount ? (
              <Button
                type="button"
                variant="outline"
                className="min-h-14 w-full text-base text-primary"
                onClick={() =>
                  setVisibleLimit((current) => current + PAGE_SIZE)
                }
              >
                Load older
              </Button>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}
