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
  getWorkerReviewCopy,
  type WorkerReviewErrorKey,
  type WorkerReviewLanguage,
} from "@/features/aha-editor/worker-review-copy";
import {
  analyzeAhaPdfFit,
  navigateAfterPersistedPdfOperation,
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
  const [error, setError] = useState<WorkerReviewErrorKey | null>(null);
  const [language, setLanguage] = useState<WorkerReviewLanguage>("en");
  const [fitIssues, setFitIssues] = useState<PdfFitIssue[]>([]);
  const saveInFlightRef = useRef(false);

  const completedPath = `/ahas/${aha.id}/completed`;
  const copy = getWorkerReviewCopy(language);
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
        if (import.meta.env.DEV) {
          console.error("Late worker domain operation failed", cause);
        }
        setError("worker_add");
        return;
      }
      let fit;
      try {
        fit = await analyzeAhaPdfFit(candidate, job);
      } catch {
        setError("pdf_check");
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
        setError("save_signature");
        return;
      }
      await navigateAfterPersistedPdfOperation(result, navigateSafely);
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
          {language === "es" ? (
            <p className="font-semibold">{copy.errors.fit}</p>
          ) : (
            fitIssues.map((issue) => (
              <p key={issue.fieldPath} className="font-semibold">
                {issue.message}
              </p>
            ))
          )}
        </div>
      ) : null}
      {error ? (
        <p
          className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 font-semibold text-warning-foreground"
          role="alert"
        >
          {copy.errors[error]}
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
            {copy.backToCompleted}
          </button>
          <p className="min-w-0 flex-1 truncate text-center text-sm font-semibold text-muted-foreground sm:text-base">
            {name.trim() || copy.addWorkerTitle}
          </p>
          <p className="min-w-[92px] text-right text-sm font-bold sm:min-w-[120px] sm:text-base">
            {copy.signedCount(aha.crew.length)}
          </p>
        </div>
        <div className="bg-primary px-3 py-2.5 text-center text-xs font-bold leading-snug tracking-[0.07em] text-primary-foreground sm:px-4 sm:py-3 sm:text-[15px] sm:tracking-[0.08em]">
          {copy.signingBanner}
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
          }}
          disabled={isSaving}
          confirmDisabled={!name.trim()}
          confirmLabel={isSaving ? copy.saving : copy.confirmSignature}
          language={language}
          onLanguageChange={setLanguage}
          feedback={feedback}
          onInkChange={setHasInk}
          onConfirm={confirm}
        />
      </div>

      <AlertDialog open={discardAsk} onOpenChange={setDiscardAsk}>
        <AlertDialogContent className="max-w-md rounded-2xl bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-bold">
              {copy.discardAddedTitle}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base font-medium">
              {copy.discardAddedBody}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="min-h-12 text-base">
              {copy.keepSigning}
            </AlertDialogCancel>
            <AlertDialogAction
              className="min-h-12 bg-foreground px-6 text-base text-background"
              onClick={() => void navigateSafely(completedPath)}
            >
              {copy.discardAndReturn}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
