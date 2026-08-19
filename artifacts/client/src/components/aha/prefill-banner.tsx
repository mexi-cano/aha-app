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

export function PrefillBanner() {
  const { metadata, dismissBanner, startBlank } = useAhaEditor();
  const [confirmBlank, setConfirmBlank] = useState(false);

  if (!metadata.sourceDate || metadata.bannerDismissed) {
    return null;
  }

  const requestBlank = () => {
    if (requiresStartBlankConfirmation(metadata.hasUserEdits)) {
      setConfirmBlank(true);
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
            onClick={requestBlank}
          >
            Start blank instead
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

      <AlertDialog open={confirmBlank} onOpenChange={setConfirmBlank}>
        <AlertDialogContent className="max-w-md rounded-2xl bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-bold">
              Start blank instead?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base font-medium leading-relaxed">
              Your changes to this draft will be cleared. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="min-h-12 text-base">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="min-h-12 bg-foreground px-6 text-base text-background"
              onClick={() => void startBlank()}
            >
              Start blank
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
