import { useState } from "react";
import { requiresStartBlankConfirmation } from "@workspace/aha-domain";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAhaEditor } from "@/features/aha-editor/editor-context";
import { formatShortDate } from "@/lib/date-format";

export const START_WITHOUT_PREVIOUS_WORK_COPY = {
  action: "Start without previous work",
  title: "Start without previous work?",
  body: "This keeps your saved job details and crew. It clears the copied description, tasks, meeting notes, Energy selections, rescue-plan answer, and safety check.",
  cancel: "Keep copied AHA",
} as const;

export function PrefillBanner() {
  const { metadata, dismissBanner, startBlank } = useAhaEditor();
  const [confirmReset, setConfirmReset] = useState(false);

  if (!metadata.sourceDate || metadata.bannerDismissed) {
    return null;
  }

  const requestReset = () => {
    if (requiresStartBlankConfirmation(metadata.hasUserEdits)) {
      setConfirmReset(true);
    } else {
      void startBlank();
    }
  };

  return (
    <>
      <aside className="flex flex-col gap-3 rounded-xl border border-[#C6CDE8] bg-secondary px-4 py-4 sm:flex-row sm:items-center sm:px-5">
        <p className="flex-1 text-base font-medium leading-relaxed">
          <strong>Started from {formatShortDate(metadata.sourceDate)}.</strong>{" "}
          Review anything that changed today.
        </p>
        <div className="flex flex-col gap-2 min-[440px]:flex-row">
          <button
            type="button"
            className="min-h-12 rounded-[10px] border-[1.5px] border-[#C6CDE8] bg-card px-4 text-base font-semibold text-primary outline-none hover:bg-background focus-visible:ring-2 focus-visible:ring-ring"
            onClick={requestReset}
          >
            {START_WITHOUT_PREVIOUS_WORK_COPY.action}
          </button>
          <button
            type="button"
            className="min-h-12 rounded-[10px] px-4 text-base font-semibold text-muted-foreground outline-none hover:bg-card/70 focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => void dismissBanner()}
          >
            ✕ Dismiss
          </button>
        </div>
      </aside>

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent className="max-w-md rounded-2xl bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-bold">
              {START_WITHOUT_PREVIOUS_WORK_COPY.title}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base font-medium leading-relaxed">
              {START_WITHOUT_PREVIOUS_WORK_COPY.body}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="min-h-12 text-base">
              {START_WITHOUT_PREVIOUS_WORK_COPY.cancel}
            </AlertDialogCancel>
            <AlertDialogAction
              className="min-h-12 bg-foreground px-6 text-base text-background"
              onClick={() => void startBlank()}
            >
              {START_WITHOUT_PREVIOUS_WORK_COPY.action}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
