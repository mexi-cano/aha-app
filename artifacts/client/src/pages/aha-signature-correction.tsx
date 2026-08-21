import { useRef, useState } from "react";
import { useParams } from "react-router";
import {
  replaceCompletedSignature,
  type SignatureReplacementReason,
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
import { Textarea } from "@/components/ui/textarea";
import { useAhaEditor } from "@/features/aha-editor/editor-context";
import { runCompletedSignatureOperation } from "@/features/aha-editor/completed-signature-operation";
import { useAhaPdfState } from "@/hooks/use-aha-pdf-state";
import {
  getWorkerReviewCopy,
  type WorkerReviewLanguage,
} from "@/features/aha-editor/worker-review-copy";
import { navigateAfterPersistedPdfOperation, type PdfFitIssue } from "@/pdf";

const replacementReasons: Array<{
  value: SignatureReplacementReason;
  label: string;
  helper: string;
}> = [
  {
    value: "wrong_person_signed",
    label: "Wrong person signed",
    helper:
      "The correct worker will review the AHA and replace this signature.",
  },
  {
    value: "signature_unclear",
    label: "Signature unclear",
    helper: "This worker will review the AHA and provide a clearer signature.",
  },
];

export default function AhaSignatureCorrection() {
  const { workerId } = useParams();
  const { aha, job, commitAha, navigateSafely, isCompletedLocked } =
    useAhaEditor();
  const pdf = useAhaPdfState(aha);
  const member = aha.crew.find((candidate) => candidate.workerId === workerId);
  const [reason, setReason] = useState<SignatureReplacementReason | null>(null);
  const [note, setNote] = useState("");
  const [isReviewing, setIsReviewing] = useState(false);
  const [language, setLanguage] = useState<WorkerReviewLanguage>("en");
  const [hasInk, setHasInk] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [discardAsk, setDiscardAsk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fitIssues, setFitIssues] = useState<PdfFitIssue[]>([]);
  const saveInFlightRef = useRef(false);
  const copy = getWorkerReviewCopy(language);
  const crewPath = `/ahas/${aha.id}/crew`;
  const unavailable =
    !member?.signaturePng ||
    !member.signedAt ||
    aha.status !== "completed" ||
    isCompletedLocked ||
    pdf?.status !== "current" ||
    Boolean(aha.pendingCompletedUpdate);

  const requestBack = () => {
    if (isReviewing && hasInk) setDiscardAsk(true);
    else if (isReviewing) setIsReviewing(false);
    else void navigateSafely(crewPath);
  };

  const confirm = async (signaturePng: string) => {
    if (!member || !reason || isSaving || saveInFlightRef.current) return;
    saveInFlightRef.current = true;
    setIsSaving(true);
    setError(null);
    setFitIssues([]);
    const correctedAt = new Date();
    const update = (current: typeof aha) =>
      replaceCompletedSignature(
        current,
        member.workerId,
        signaturePng,
        reason,
        note,
        correctedAt,
      );
    try {
      const result = await runCompletedSignatureOperation({
        aha,
        job,
        commitAha,
        update,
      });
      if (result.status === "candidate_failed") {
        setError(copy.errors.pdf_check);
      } else if (result.status === "candidate_fit_failed") {
        setFitIssues(result.issues);
      } else if (result.status === "save_failed") {
        setError(copy.errors.save_signature);
      } else {
        await navigateAfterPersistedPdfOperation(result, navigateSafely);
      }
    } finally {
      saveInFlightRef.current = false;
      setIsSaving(false);
    }
  };

  if (unavailable) {
    return (
      <main className="min-h-screen bg-background px-5 py-12 text-center">
        <h1 className="text-2xl font-bold">
          This signature cannot be replaced
        </h1>
        <p className="mx-auto mt-3 max-w-md text-base font-medium text-muted-foreground">
          Finish the current PDF first, or return to the read-only completed AHA
          if a later shift has started.
        </p>
        <Button
          className="mt-6 min-h-12"
          onClick={() => void navigateSafely(crewPath)}
        >
          Return to crew
        </Button>
      </main>
    );
  }

  if (!isReviewing) {
    return (
      <main className="min-h-screen bg-background text-foreground">
        <header className="border-b border-border bg-card">
          <div className="mx-auto grid max-w-[834px] grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-3">
            <button
              type="button"
              className="min-h-12 justify-self-start rounded-lg px-2 text-base font-semibold text-primary"
              onClick={() => void navigateSafely(crewPath)}
            >
              ‹ Crew
            </button>
            <h1 className="text-center text-lg font-bold">Replace signature</h1>
            <span />
          </div>
        </header>
        <div className="mx-auto max-w-[700px] px-5 py-7 sm:px-7">
          <section className="rounded-2xl border border-card-border bg-card p-5 shadow-sm">
            <h2 className="text-2xl font-bold">{member.name}</h2>
            <p className="mt-2 text-base font-medium text-muted-foreground">
              The saved signature will not be transferred. This worker must
              review today's complete AHA and sign again.
            </p>
            <div className="mt-5 grid gap-3">
              {replacementReasons.map((option) => (
                <button
                  type="button"
                  key={option.value}
                  className={`min-h-16 rounded-xl border px-4 py-3 text-left ${
                    reason === option.value
                      ? "border-primary bg-secondary text-primary"
                      : "border-border bg-background"
                  }`}
                  onClick={() => setReason(option.value)}
                >
                  <span className="block text-base font-bold">
                    {option.label}
                  </span>
                  <span className="mt-1 block text-sm font-medium text-muted-foreground">
                    {option.helper}
                  </span>
                </button>
              ))}
            </div>
            <label
              className="mt-5 block text-sm font-bold"
              htmlFor="replacement-note"
            >
              Optional note
            </label>
            <Textarea
              id="replacement-note"
              className="mt-2 min-h-24 text-base"
              maxLength={250}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
            <p className="mt-1 text-right text-xs font-semibold text-muted-foreground">
              {note.length}/250
            </p>
            <Button
              className="mt-5 min-h-14 w-full text-lg font-bold"
              disabled={!reason}
              onClick={() => setIsReviewing(true)}
            >
              REVIEW AHA &amp; SIGN
            </Button>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-card">
        <div className="mx-auto flex max-w-[834px] items-center gap-3 px-4 py-3">
          <button
            type="button"
            className="min-h-12 shrink-0 rounded-lg px-2 text-base font-semibold text-primary"
            disabled={isSaving}
            onClick={requestBack}
          >
            {copy.backToCrew}
          </button>
          <p className="min-w-0 flex-1 truncate text-center text-sm font-semibold text-muted-foreground sm:text-base">
            {member.name}
          </p>
          <span className="min-w-[92px]" />
        </div>
        <div className="bg-primary px-3 py-2.5 text-center text-xs font-bold tracking-[0.07em] text-primary-foreground sm:text-[15px]">
          {copy.signingBanner}
        </div>
      </header>
      <div className="mx-auto max-w-[748px] px-5 py-5 sm:px-6 sm:py-6">
        <WorkerReviewAndSign
          aha={aha}
          job={job}
          signerName={member.name}
          disabled={isSaving}
          confirmLabel={isSaving ? copy.saving : copy.confirmSignature}
          language={language}
          onLanguageChange={setLanguage}
          onInkChange={setHasInk}
          onConfirm={confirm}
          feedback={
            <>
              {fitIssues.map((issue) => (
                <p
                  key={`${issue.fieldPath}-${issue.code}`}
                  className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 font-semibold text-warning-foreground"
                >
                  {language === "es" ? copy.errors.fit : issue.message}
                </p>
              ))}
              {error ? (
                <p className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 font-semibold text-warning-foreground">
                  {error}
                </p>
              ) : null}
            </>
          }
        />
      </div>

      <AlertDialog open={discardAsk} onOpenChange={setDiscardAsk}>
        <AlertDialogContent className="max-w-md rounded-2xl bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-bold">
              {copy.discardSignatureTitle}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base font-medium">
              {copy.discardSignatureBody}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="min-h-12">
              {copy.keepSigning}
            </AlertDialogCancel>
            <AlertDialogAction
              className="min-h-12 bg-foreground text-background"
              onClick={() => {
                setHasInk(false);
                setIsReviewing(false);
              }}
            >
              {copy.discard}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
