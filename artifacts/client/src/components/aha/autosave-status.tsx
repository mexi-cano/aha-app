import { Check, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAhaEditor } from "@/features/aha-editor/editor-context";

export function AutosaveStatus() {
  const { saveState, isOnline, retrySave } = useAhaEditor();

  if (saveState === "error") {
    return (
      <div
        className="flex flex-wrap items-center justify-end gap-2 text-sm font-semibold text-destructive sm:text-base"
        role="alert"
      >
        <span>Couldn't save on this iPad.</span>
        <Button
          type="button"
          variant="outline"
          className="min-h-12 px-3 text-base text-destructive"
          onClick={() => void retrySave()}
        >
          <RotateCw aria-hidden="true" /> Retry
        </Button>
      </div>
    );
  }

  if (saveState === "saving") {
    return (
      <span
        className="text-sm font-semibold text-muted-foreground sm:text-base"
        aria-live="polite"
      >
        Saving…
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground sm:text-base"
      aria-live="polite"
    >
      {isOnline ? "Saved" : "Offline · Saved on this iPad"}
      <Check
        className="size-5 text-[#1E8E3E]"
        strokeWidth={3}
        aria-hidden="true"
      />
    </span>
  );
}
