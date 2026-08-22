import { useState } from "react";
import { Check, Home as HomeIcon } from "lucide-react";
import { useLocation } from "react-router";
import {
  finalizeCompletedUpdate,
  getReviewReport,
} from "@workspace/aha-domain";

import { Button } from "@/components/ui/button";
import {
  PdfShareButton,
  PdfShareFeedback,
  usePdfShare,
} from "@/components/aha/pdf-share";
import type { AhaPdfRecord } from "@/data/database";
import { useAhaEditor } from "@/features/aha-editor/editor-context";
import { useRecoveryState } from "@/features/restore/restore-gate";
import { useAhaPdfState } from "@/hooks/use-aha-pdf-state";
import { formatEditorDate, formatTime } from "@/lib/date-format";
import {
  PDF_FAILURE_MESSAGE,
  getCurrentPdfOpenMode,
  parseCompletedPdfRecoveryState,
  pdfFitIssueUpdatePath,
  saveAhaAndGeneratePdf,
  usePdfObjectUrl,
  type PdfFitIssue,
} from "@/pdf";

export default function AhaCompleted() {
  const { isPaused } = useRecoveryState();
  const { aha, job, commitAha, navigateSafely, isCompletedLocked } =
    useAhaEditor();
  const location = useLocation();
  const pdf = useAhaPdfState(aha);
  const [isGenerating, setIsGenerating] = useState(false);
  const [freshlyStoredPdf, setFreshlyStoredPdf] = useState<AhaPdfRecord | null>(
    null,
  );
  const [fitIssues, setFitIssues] = useState<PdfFitIssue[]>(
    () => parseCompletedPdfRecoveryState(location.state)?.issues ?? [],
  );
  const pdfOpenMode = getCurrentPdfOpenMode();
  const currentPdfRecord =
    pdf?.status === "current"
      ? pdf.record
      : freshlyStoredPdf?.sourceRevision === aha.documentRevision
        ? freshlyStoredPdf
        : null;
  const nativePdfUrl = usePdfObjectUrl(currentPdfRecord);
  const previousPdfRecord = pdf?.status === "stale" ? pdf.record : null;
  const previousPdfUrl = usePdfObjectUrl(previousPdfRecord);
  const shareController = usePdfShare(currentPdfRecord);

  const regenerate = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    try {
      const result = await saveAhaAndGeneratePdf({
        commitAha,
        update: (current) => finalizeCompletedUpdate(current, new Date()),
        job,
      });
      if (result.status === "fit_failed") {
        setFreshlyStoredPdf(null);
        setFitIssues(result.issues);
      } else if (result.status === "stored") {
        setFreshlyStoredPdf(result.record);
        setFitIssues([]);
      } else if (result.status === "generation_failed") {
        setFreshlyStoredPdf(null);
        setFitIssues([]);
      } else {
        // A failed save leaves the current recovery presentation intact.
      }
    } finally {
      setIsGenerating(false);
    }
  };

  if (aha.status !== "completed") {
    return (
      <main className="min-h-screen bg-background px-5 py-12 text-center">
        <p className="text-base font-semibold">
          This AHA is not completed yet.
        </p>
        <Button
          className="mt-5 min-h-12"
          onClick={() => void navigateSafely("/")}
        >
          Home
        </Button>
      </main>
    );
  }

  const pdfCurrent = currentPdfRecord !== null;
  const hasUpdatedChip = aha.updatedAfterCompletionAt.length > 0;
  const pendingUpdateNeedsReview = !getReviewReport(aha).canStartSigning;
  const pendingSafetyConfirmation =
    aha.pendingCompletedUpdate?.kind === "safety" &&
    !aha.pendingCompletedUpdate.crewReviewConfirmation;
  const needsUpdateReview =
    pendingUpdateNeedsReview || pendingSafetyConfirmation;
  const correctionActionsDisabled =
    isPaused ||
    isCompletedLocked ||
    !pdfCurrent ||
    Boolean(aha.pendingCompletedUpdate);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-[834px] items-center gap-3 px-5 py-4 sm:px-7">
          <button
            type="button"
            className="flex min-h-12 items-center gap-2 rounded-lg px-2 text-base font-semibold text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => void navigateSafely("/")}
          >
            <HomeIcon className="size-5" aria-hidden="true" /> Home
          </button>
          <p className="min-w-0 flex-1 truncate text-center text-sm font-semibold text-muted-foreground sm:text-base">
            {job.name} — {formatEditorDate(aha.date)}
          </p>
          <p className="min-w-[76px] text-right text-sm font-bold text-success sm:text-base">
            Saved ✓
          </p>
        </div>
      </header>

      <div className="mx-auto flex max-w-[700px] flex-col gap-4 px-5 py-7 sm:px-7 sm:py-9">
        {isPaused ? (
          <section className="rounded-xl border border-[#C6CDE8] bg-secondary px-4 py-4 text-center text-secondary-foreground">
            <p className="font-bold">Recovery is paused.</p>
            <p className="mt-1 text-sm font-medium">
              Current and historical documents remain available. Resume recovery
              before changing or recreating this AHA.
            </p>
          </section>
        ) : null}
        <section className="rounded-2xl border border-card-border bg-card px-6 py-7 text-center shadow-sm sm:px-10">
          <span className="mx-auto flex size-[72px] items-center justify-center rounded-full bg-success text-white">
            <Check className="size-10" strokeWidth={3.2} aria-hidden="true" />
          </span>
          <h1 className="mt-5 text-[28px] font-bold">
            Today's AHA — Completed
          </h1>
          <p className="mt-2 text-[17px] font-medium text-muted-foreground">
            All {aha.crew.length} crew signed
            {aha.completedAt
              ? ` · Finished ${formatTime(aha.completedAt)}`
              : ""}
          </p>
          {hasUpdatedChip ? (
            <span className="mt-4 inline-flex min-h-8 items-center rounded-lg bg-secondary px-3 text-sm font-bold text-primary">
              Updated after completion
            </span>
          ) : null}
        </section>

        {pdf === undefined ||
        (pdfCurrent && pdfOpenMode === "native" && !nativePdfUrl) ||
        (isGenerating && fitIssues.length === 0) ? (
          <section
            className="rounded-2xl border border-card-border bg-card p-5 text-center"
            role="status"
          >
            <p className="text-base font-semibold text-muted-foreground">
              {isGenerating
                ? "Creating the official PDF…"
                : "Opening the saved PDF…"}
            </p>
          </section>
        ) : pdfCurrent && currentPdfRecord ? (
          pdfOpenMode === "native" && nativePdfUrl ? (
            <Button
              asChild
              className="min-h-[72px] w-full rounded-[14px] text-xl font-bold tracking-wide"
            >
              <a href={nativePdfUrl} target="_blank" rel="noopener noreferrer">
                VIEW CURRENT PDF
              </a>
            </Button>
          ) : (
            <Button
              className="min-h-[72px] w-full rounded-[14px] text-xl font-bold tracking-wide"
              onClick={() => void navigateSafely(`/ahas/${aha.id}/pdf`)}
            >
              VIEW CURRENT PDF
            </Button>
          )
        ) : fitIssues.length === 0 ? (
          <section
            className="rounded-2xl border border-warning/30 bg-warning/10 p-5"
            role="alert"
          >
            <p className="text-base font-bold text-warning-foreground">
              {PDF_FAILURE_MESSAGE}
            </p>
            {pdf?.status === "unreadable" ? (
              <p className="mt-2 text-sm font-medium text-warning-foreground">
                The unreadable copy remains on this iPad and was not deleted.
              </p>
            ) : pdf?.status === "stale" ? (
              <p className="mt-2 text-sm font-medium text-warning-foreground">
                The previous PDF is preserved but does not include the saved
                update.
              </p>
            ) : null}
            <Button
              className="mt-4 min-h-14 w-full text-lg font-bold"
              disabled={isGenerating || isPaused}
              onClick={() =>
                needsUpdateReview
                  ? void navigateSafely(`/ahas/${aha.id}/update/review`)
                  : void regenerate()
              }
            >
              {isGenerating
                ? "CREATING PDF…"
                : needsUpdateReview
                  ? "FINISH SAVED UPDATE"
                  : "TRY AGAIN"}
            </Button>
            {previousPdfRecord && previousPdfUrl ? (
              <Button
                asChild
                variant="outline"
                className="mt-3 min-h-12 w-full border-warning/40 bg-card text-warning-foreground"
              >
                <a
                  href={previousPdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  VIEW PREVIOUS PDF
                </a>
              </Button>
            ) : null}
          </section>
        ) : null}

        {fitIssues.length > 0 ? (
          <div
            className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-warning-foreground"
            role="alert"
          >
            <p className="font-bold">The PDF needs shorter content.</p>
            <p className="mt-1 text-sm font-semibold">
              The completed AHA and every signature remain saved.
            </p>
            <ul className="mt-3 space-y-3 text-sm font-semibold">
              {fitIssues.map((issue) => {
                const updatePath = pdfFitIssueUpdatePath(aha.id, issue);
                return (
                  <li
                    className="rounded-lg border border-warning/30 bg-card/70 p-3"
                    key={`${issue.fieldPath}-${issue.code}`}
                  >
                    <p>{issue.message}</p>
                    {updatePath ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="mt-3 min-h-12 w-full border-warning/40 bg-card text-warning-foreground"
                        disabled={isPaused}
                        onClick={() => void navigateSafely(updatePath)}
                      >
                        Edit {issue.label}
                      </Button>
                    ) : (
                      <p className="mt-2 text-xs font-medium">
                        This field cannot be changed safely from the completed
                        workflow.
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
            <Button
              type="button"
              className="mt-4 min-h-12 w-full"
              disabled={isGenerating || isPaused}
              onClick={() => void regenerate()}
            >
              {isGenerating ? "CHECKING PDF…" : "CHECK PDF AGAIN"}
            </Button>
          </div>
        ) : null}

        <div>
          <PdfShareButton
            controller={shareController}
            disabled={!pdfCurrent}
            className="min-h-14 w-full border-[#C6CDE8] text-[17px] text-primary"
          />
          <p className="mt-2 text-center text-sm font-medium text-muted-foreground">
            Choose Mail, Messages, AirDrop, or another app.
          </p>
        </div>
        <PdfShareFeedback controller={shareController} />
        {isCompletedLocked ? (
          <section className="rounded-xl border border-card-border bg-card px-4 py-4 text-center">
            <p className="font-bold">This AHA is now read-only.</p>
            <p className="mt-1 text-sm font-medium text-muted-foreground">
              A later AHA has been started for this job. The PDF and document
              history remain available.
            </p>
          </section>
        ) : null}
        <Button
          variant="outline"
          className="min-h-14 w-full border-[#C6CDE8] text-[17px] text-primary"
          disabled={correctionActionsDisabled}
          onClick={() => void navigateSafely(`/ahas/${aha.id}/crew`)}
        >
          Manage crew &amp; signatures
        </Button>
        <Button
          variant="outline"
          className="min-h-14 w-full border-[#C6CDE8] text-[17px] text-primary"
          disabled={correctionActionsDisabled || aha.crew.length >= 10}
          onClick={() => void navigateSafely(`/ahas/${aha.id}/add-worker`)}
        >
          Add late worker
        </Button>
        <Button
          variant="outline"
          className="min-h-14 w-full border-[#C6CDE8] text-[17px] text-primary"
          disabled={correctionActionsDisabled}
          onClick={() => void navigateSafely(`/ahas/${aha.id}/update/details`)}
        >
          Update work or hazards
        </Button>
        <Button
          variant="outline"
          className="min-h-14 w-full border-[#C6CDE8] text-[17px] text-primary"
          onClick={() =>
            void navigateSafely(`/ahas/${aha.id}/document-history`)
          }
        >
          Document history
        </Button>
        {aha.crew.length >= 10 ? (
          <p className="text-center text-sm font-semibold text-muted-foreground">
            All ten ITS signature slots are in use.
          </p>
        ) : null}
      </div>
    </main>
  );
}
