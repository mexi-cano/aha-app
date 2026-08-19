import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { useLocation } from "react-router";
import {
  canStartSigning,
  getEditorSectionReadiness,
} from "@workspace/aha-domain";

import { AutosaveStatus } from "./autosave-status";
import { useAhaEditor } from "@/features/aha-editor/editor-context";
import { formatEditorDate } from "@/lib/date-format";
import { cn } from "@/lib/utils";

export function EditorShell({ children }: { children: ReactNode }) {
  const { aha, job, navigateSafely } = useAhaEditor();
  const location = useLocation();
  const activeStep =
    ["details", "work", "energy", "review"].find((step) =>
      location.pathname.endsWith(`/${step}`),
    ) ?? "details";
  const basePath = `/ahas/${aha.id}`;
  const readiness = getEditorSectionReadiness(aha);
  const steps = [
    { id: "details", number: 1, label: "Details", ready: readiness.details },
    { id: "work", number: 2, label: "Work", ready: readiness.work },
    { id: "energy", number: 3, label: "Energy", ready: readiness.energy },
    { id: "review", number: 4, label: "Review", ready: readiness.review },
    {
      id: "sign",
      number: 5,
      label: "Sign",
      ready: false,
      disabled: aha.status === "draft" || !canStartSigning(aha),
    },
  ];

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-card">
        <div className="mx-auto flex max-w-[834px] items-center gap-3 px-4 pb-3 pt-4 sm:px-7">
          <button
            type="button"
            className="min-h-12 shrink-0 rounded-lg px-2 text-base font-semibold text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => void navigateSafely("/")}
          >
            ‹ Home
          </button>
          <p className="min-w-0 flex-1 truncate text-center text-sm font-semibold text-muted-foreground sm:text-base">
            {job.name} — {formatEditorDate(aha.date)}
          </p>
          <div className="flex min-w-[96px] justify-end sm:min-w-[190px]">
            <AutosaveStatus />
          </div>
        </div>
        <nav
          className="mx-auto max-w-[834px] px-4 pb-4 sm:px-7"
          aria-label="AHA editor sections"
        >
          <div className="flex gap-1 rounded-xl bg-secondary p-1">
            {steps.map((step) => {
              const isActive = activeStep === step.id;
              return (
                <button
                  key={step.id}
                  type="button"
                  className={cn(
                    "flex min-h-12 min-w-12 items-center justify-center gap-1 rounded-lg px-2 text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring sm:flex-1 sm:px-3 sm:text-base",
                    isActive
                      ? "flex-1 bg-primary font-bold text-primary-foreground"
                      : "w-12 text-secondary-foreground hover:bg-card/70 sm:w-auto",
                    step.disabled &&
                      "cursor-not-allowed text-muted-foreground opacity-60 hover:bg-transparent",
                  )}
                  aria-current={isActive ? "step" : undefined}
                  disabled={step.disabled}
                  onClick={() =>
                    void navigateSafely(
                      step.id === "sign"
                        ? `${basePath}/sign`
                        : `${basePath}/${step.id}`,
                    )
                  }
                >
                  <span>{step.number}</span>
                  <span className={cn(!isActive && "hidden sm:inline")}>
                    {step.label}
                  </span>
                  {step.ready && !isActive ? (
                    <Check
                      className="size-4 text-success"
                      strokeWidth={3}
                      aria-label="Complete"
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
        </nav>
      </header>
      <div className="mx-auto max-w-[748px] px-5 py-5 sm:px-6 sm:py-7">
        {children}
      </div>
    </main>
  );
}
