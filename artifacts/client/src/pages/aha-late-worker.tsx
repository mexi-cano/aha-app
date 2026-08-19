import { useRef, useState } from "react";
import {
  MAX_CREW_MEMBERS,
  addLateSignedCrewMember,
} from "@workspace/aha-domain";

import { WorkerReviewAndSign } from "@/components/aha/worker-review-and-sign";
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
import { Button } from "@/components/ui/button";
import { createLocalId } from "@/data/aha-repository";
import { useAhaEditor } from "@/features/aha-editor/editor-context";
import {
  analyzeAhaPdfFit,
  saveAhaAndGeneratePdf,
  type PdfFitIssue,
} from "@/pdf";

export default function AhaLateWorker() {
  const { aha, job, commitAha, navigateSafely } = useAhaEditor();
  const [name, setName] = useState("");
  const [workerId] = useState(() => createLocalId());
  const [hasInk, setHasInk] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [discardAsk, setDiscardAsk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fitIssues, setFitIssues] = useState<PdfFitIssue[]>([]);
  const saveInFlightRef = useRef(false);

  const completedPath = `/ahas/${aha.id}/completed`;
  const hasStagedEntry = Boolean(name.trim() || hasInk);

  const requestBack = () => {
    if (hasStagedEntry) setDiscardAsk(true);
    else void navigateSafely(completedPath);
  };

  const confirm = async (signaturePng: string) => {
    if (!name.trim() || isSaving || saveInFlightRef.current) return;
    saveInFlightRef.current = true;
    setIsSaving(true);
    setError(null);
    setFitIssues([]);
    try {
      const now = new Date();
      let candidate;
      try {
        candidate = addLateSignedCrewMember(
          aha,
          { id: workerId, name },
          signaturePng,
          now,
        );
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "This worker could not be added.",
        );
        return;
      }
      let fit;
      try {
        fit = await analyzeAhaPdfFit(candidate, job);
      } catch {
        setError(
          "We couldn't check the official PDF. The new signature has not been saved. Try again.",
        );
        return;
      }
      if (fit.issues.length > 0) {
        setFitIssues(fit.issues);
        return;
      }
      const result = await saveAhaAndGeneratePdf({
        commitAha,
        update: (current) =>
          addLateSignedCrewMember(
            current,
            { id: workerId, name },
            signaturePng,
            now,
          ),
        job,
      });
      if (result.status === "save_failed") {
        setError(
          "We couldn't save this signature. It is still on this screen. Try again.",
        );
        return;
      }
      if (result.status === "fit_failed") {
        setFitIssues(result.issues);
      }
      await navigateSafely(`/ahas/${result.savedAha.id}/completed`);
    } finally {
      saveInFlightRef.current = false;
      setIsSaving(false);
    }
  };

  if (aha.status !== "completed" || aha.crew.length >= MAX_CREW_MEMBERS) {
    return (
      <main className="min-h-screen bg-background px-5 py-12 text-center">
        <h1 className="text-xl font-bold">No signature slot is available.</h1>
        <p className="mt-2 text-base font-medium text-muted-foreground">
          The official ITS sheet holds no more than ten workers.
        </p>
        <Button
          className="mt-5 min-h-12"
          onClick={() => void navigateSafely(completedPath)}
        >
          Return to Completed
        </Button>
      </main>
    );
  }

  const feedback = (
    <>
      {fitIssues.length > 0 ? (
        <div
          className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-warning-foreground"
          role="alert"
        >
          {fitIssues.map((issue) => (
            <p key={issue.fieldPath} className="font-semibold">
              {issue.message}
            </p>
          ))}
        </div>
      ) : null}
      {error ? (
        <p
          className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 font-semibold text-warning-foreground"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </>
  );

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-card">
        <div className="mx-auto flex max-w-[834px] items-center gap-3 px-4 py-3">
          <button
            type="button"
            className="min-h-12 shrink-0 rounded-lg px-2 text-base font-semibold text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring"
            disabled={isSaving}
            onClick={requestBack}
          >
            ‹ Completed
          </button>
          <p className="min-w-0 flex-1 truncate text-center text-sm font-semibold text-muted-foreground sm:text-base">
            {name.trim() || "Add worker"}
          </p>
          <p className="min-w-[92px] text-right text-sm font-bold sm:min-w-[120px] sm:text-base">
            {aha.crew.length} signed
          </p>
        </div>
        <div className="bg-primary px-3 py-2.5 text-center text-xs font-bold leading-snug tracking-[0.07em] text-primary-foreground sm:px-4 sm:py-3 sm:text-[15px] sm:tracking-[0.08em]">
          SIGNING MODE — HAND THE DEVICE TO EACH CREW MEMBER
        </div>
      </header>

      <div className="mx-auto max-w-[748px] px-5 py-5 sm:px-6 sm:py-6">
        <WorkerReviewAndSign
          aha={aha}
          job={job}
          signerName={name}
          nameInput={{
            value: name,
            onChange: setName,
            helper: "joins today's crew",
          }}
          disabled={isSaving}
          confirmDisabled={!name.trim()}
          confirmLabel={isSaving ? "SAVING…" : "CONFIRM SIGNATURE"}
          feedback={feedback}
          onInkChange={setHasInk}
          onConfirm={confirm}
        />
      </div>

      <AlertDialog open={discardAsk} onOpenChange={setDiscardAsk}>
        <AlertDialogContent className="max-w-md rounded-2xl bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-bold">
              Discard this worker and signature?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base font-medium">
              The worker has not been added. Entered name and signature ink will
              be cleared.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="min-h-12 text-base">
              Keep signing
            </AlertDialogCancel>
            <AlertDialogAction
              className="min-h-12 bg-foreground px-6 text-base text-background"
              onClick={() => void navigateSafely(completedPath)}
            >
              Discard and return
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
