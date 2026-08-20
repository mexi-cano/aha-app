import { useLiveQuery } from "dexie-react-hooks";
import { Check, ChevronRight, Plus } from "lucide-react";
import { useNavigate } from "react-router";

import { AppLogo } from "@/components/aha/app-logo";
import { Button } from "@/components/ui/button";
import { getJobListSnapshot, setActiveJob } from "@/data/job-repository";

export default function Jobs() {
  const navigate = useNavigate();
  const snapshot = useLiveQuery(getJobListSnapshot);

  if (!snapshot) {
    return (
      <main className="min-h-screen bg-background px-5 py-12 text-center text-base font-semibold text-muted-foreground">
        Opening jobs…
      </main>
    );
  }

  const activate = async (jobId: string) => {
    await setActiveJob(jobId);
    navigate("/", { replace: true });
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
            JOBS ON THIS IPAD
          </p>
          <h1 className="mt-1 text-3xl font-bold">Choose a job</h1>
          <p className="mt-2 text-base font-medium text-muted-foreground">
            Each job keeps its own defaults, roster, and AHA history.
          </p>
        </div>

        <section className="overflow-hidden rounded-[14px] border border-card-border bg-card">
          {snapshot.jobs.map((job) => {
            const active = job.id === snapshot.activeJobId;
            return (
              <div
                key={job.id}
                className="flex min-h-20 items-center gap-3 border-b border-border px-4 py-3 last:border-b-0 sm:px-6"
              >
                <button
                  type="button"
                  className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-lg text-left outline-none focus:ring-4 focus:ring-secondary"
                  aria-current={active ? "true" : undefined}
                  onClick={() => void activate(job.id)}
                >
                  {active ? (
                    <Check
                      className="size-6 shrink-0 text-success"
                      strokeWidth={3}
                      aria-hidden="true"
                    />
                  ) : (
                    <span className="size-6 shrink-0" />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-lg font-bold">
                      {job.name}
                    </span>
                    <span className="block truncate text-base font-medium text-muted-foreground">
                      {job.cityLabel}
                    </span>
                  </span>
                </button>
                <Button
                  variant="ghost"
                  className="min-h-12 shrink-0 text-base text-primary"
                  onClick={() => navigate(`/jobs/${job.id}/setup`)}
                >
                  Defaults{" "}
                  <ChevronRight className="size-5" aria-hidden="true" />
                </Button>
              </div>
            );
          })}
        </section>

        <Button
          variant="outline"
          className="min-h-14 border-dashed text-base text-primary"
          onClick={() => navigate("/setup")}
        >
          <Plus className="size-5" aria-hidden="true" /> Set up another job
        </Button>
      </div>
    </main>
  );
}
