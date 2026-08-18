import type { ReactNode } from "react";
import { useLocation } from "react-router";

import { AutosaveStatus } from "./autosave-status";
import { useAhaEditor } from "@/features/aha-editor/editor-context";
import { formatEditorDate } from "@/lib/date-format";
import { cn } from "@/lib/utils";

export function EditorShell({ children }: { children: ReactNode }) {
  const { aha, job, navigateSafely } = useAhaEditor();
  const location = useLocation();
  const activeStep = location.pathname.endsWith("/work") ? "work" : "details";
  const basePath = `/ahas/${aha.id}`;

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
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-secondary p-1">
            {[
              { id: "details", label: "1 Details" },
              { id: "work", label: "2 Work" },
            ].map((step) => (
              <button
                key={step.id}
                type="button"
                className={cn(
                  "min-h-12 rounded-lg px-3 text-base font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                  activeStep === step.id
                    ? "bg-primary font-bold text-primary-foreground"
                    : "text-secondary-foreground hover:bg-card/70",
                )}
                aria-current={activeStep === step.id ? "step" : undefined}
                onClick={() => void navigateSafely(`${basePath}/${step.id}`)}
              >
                {step.label}
              </button>
            ))}
          </div>
        </nav>
      </header>
      <div className="mx-auto max-w-[748px] px-5 py-5 sm:px-6 sm:py-7">
        {children}
      </div>
    </main>
  );
}
