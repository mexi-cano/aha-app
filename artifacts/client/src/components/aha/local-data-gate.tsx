import { useEffect, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { initializeLocalData } from "@/data/aha-repository";
import { requestAppReload } from "@/data/app-reload";
import {
  classifyLocalDataError,
  type LocalDataFailureKind,
} from "@/data/local-data-initialization";
import { useToday } from "@/hooks/use-today";

export function LocalDataGate({ children }: { children: ReactNode }) {
  const today = useToday();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [failureKind, setFailureKind] = useState<LocalDataFailureKind>(
    "storage_unavailable",
  );
  const [isReloading, setIsReloading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    void initializeLocalData(today)
      .then(() => {
        if (!cancelled) setState("ready");
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setFailureKind(classifyLocalDataError(error));
          setState("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, today]);

  const reloadLatestVersion = async () => {
    if (isReloading) return;
    setIsReloading(true);
    try {
      const registration = await navigator.serviceWorker?.getRegistration();
      await registration?.update();
    } catch {
      // A cached offline app can still reload even when update checking fails.
    } finally {
      requestAppReload("storage_version_recovery");
    }
  };

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
          <h1 className="text-2xl font-bold">
            {failureKind === "app_update_required"
              ? "This tab needs the latest app version"
              : "Local storage is temporarily unavailable"}
          </h1>
          <p className="mt-3 text-base font-medium leading-relaxed text-muted-foreground">
            {failureKind === "app_update_required"
              ? "Another tab has already updated the saved AHA format. Reload this tab before continuing. Your saved records were not deleted."
              : "We couldn't open the AHAs saved on this iPad. Your saved records were not deleted. Try again, then reload the app if the problem continues."}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {failureKind === "storage_unavailable" ? (
              <Button
                className="min-h-12 px-6 text-base"
                onClick={() => setAttempt((value) => value + 1)}
              >
                Try again
              </Button>
            ) : null}
            <Button
              variant={
                failureKind === "app_update_required" ? "default" : "outline"
              }
              className="min-h-12 px-6 text-base"
              disabled={isReloading}
              onClick={() => void reloadLatestVersion()}
            >
              {isReloading ? "Reloading…" : "Reload app"}
            </Button>
          </div>
        </section>
      </main>
    );
  }

  return children;
}
