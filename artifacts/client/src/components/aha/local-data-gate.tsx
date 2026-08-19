import { useEffect, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { initializeLocalData } from "@/data/aha-repository";
import { useToday } from "@/hooks/use-today";

export function LocalDataGate({ children }: { children: ReactNode }) {
  const today = useToday();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    void initializeLocalData(today)
      .then(() => {
        if (!cancelled) setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, today]);

  if (state === "loading") {
    return (
      <main className="min-h-screen bg-background px-5 py-12">
        <p className="text-center text-base font-semibold text-muted-foreground">
          Opening your saved AHAs…
        </p>
      </main>
    );
  }

  if (state === "error") {
    return (
      <main className="min-h-screen bg-background px-5 py-12">
        <section className="mx-auto max-w-lg rounded-2xl border border-card-border bg-card p-7 shadow-sm">
          <h1 className="text-2xl font-bold">Local storage is unavailable</h1>
          <p className="mt-3 text-base font-medium leading-relaxed text-muted-foreground">
            We couldn't open the AHAs saved on this iPad. Nothing has been
            deleted. Check that private browsing is off, then try again.
          </p>
          <Button
            className="mt-6 min-h-12 px-6 text-base"
            onClick={() => {
              setState("loading");
              setAttempt((value) => value + 1);
            }}
          >
            Try again
          </Button>
        </section>
      </main>
    );
  }

  return children;
}
