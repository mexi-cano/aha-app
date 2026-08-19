import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, Download, Home as HomeIcon, Printer } from "lucide-react";
import { getReviewReport } from "@workspace/aha-domain";

import { Button } from "@/components/ui/button";
import { getAhaPdfState } from "@/data/aha-repository";
import { useAhaEditor } from "@/features/aha-editor/editor-context";
import { formatEditorDate, formatTime } from "@/lib/date-format";
import {
  PDF_FAILURE_MESSAGE,
  downloadPdf,
  getCurrentPdfOpenMode,
  saveAhaAndGeneratePdf,
  shareOrDownloadPdf,
  usePdfObjectUrl,
  type PdfFitIssue,
} from "@/pdf";

export default function AhaCompleted() {
  const { aha, job, commitAha, navigateSafely } = useAhaEditor();
  const pdf = useLiveQuery(
    () => getAhaPdfState(aha),
    [aha.id, aha.documentRevision],
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [fitIssues, setFitIssues] = useState<PdfFitIssue[]>([]);
  const [shareFailed, setShareFailed] = useState(false);
  const [downloadStarted, setDownloadStarted] = useState(false);
  const [shareIsTakingLong, setShareIsTakingLong] = useState(false);
  const pdfOpenMode = getCurrentPdfOpenMode();
  const nativePdfUrl = usePdfObjectUrl(
    pdf?.status === "current" ? pdf.record : null,
  );

  const regenerate = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    setFitIssues([]);
    try {
      const result = await saveAhaAndGeneratePdf({
        commitAha,
        update: (current) => current,
        job,
      });
      if (result.status === "fit_failed") setFitIssues(result.issues);
    } finally {
      setIsGenerating(false);
    }
  };

  const share = async () => {
    if (!pdf?.record || isSharing) return;
    setIsSharing(true);
    setShareFailed(false);
    setDownloadStarted(false);
    setShareIsTakingLong(false);
    const takingLongTimer = window.setTimeout(
      () => setShareIsTakingLong(true),
      1_500,
    );
    try {
      const result = await shareOrDownloadPdf(pdf.record);
      if (result.status === "failed") setShareFailed(true);
      if (result.status === "downloaded") setDownloadStarted(true);
    } finally {
      window.clearTimeout(takingLongTimer);
      setShareIsTakingLong(false);
      setIsSharing(false);
    }
  };

  const downloadStoredPdf = () => {
    if (!pdf?.record) return;
    downloadPdf(pdf.record);
    setShareFailed(false);
    setDownloadStarted(true);
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

  const pdfCurrent = pdf?.status === "current";
  const hasUpdatedChip = aha.updatedAfterCompletionAt.length > 0;
  const pendingUpdateNeedsReview = !getReviewReport(aha).canStartSigning;

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
        (pdfCurrent && pdfOpenMode === "native" && !nativePdfUrl) ? (
          <section
            className="rounded-2xl border border-card-border bg-card p-5 text-center"
            role="status"
          >
            <p className="text-base font-semibold text-muted-foreground">
              Opening the saved PDF…
            </p>
          </section>
        ) : pdfCurrent && pdf.record ? (
          pdfOpenMode === "native" && nativePdfUrl ? (
            <Button
              asChild
              className="min-h-[72px] w-full rounded-[14px] text-xl font-bold tracking-wide"
            >
              <a href={nativePdfUrl} target="_blank" rel="noopener noreferrer">
                VIEW PDF
              </a>
            </Button>
          ) : (
            <Button
              className="min-h-[72px] w-full rounded-[14px] text-xl font-bold tracking-wide"
              onClick={() => void navigateSafely(`/ahas/${aha.id}/pdf`)}
            >
              VIEW PDF
            </Button>
          )
        ) : (
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
                The saved PDF is out of date and will not be shown as current.
              </p>
            ) : null}
            <Button
              className="mt-4 min-h-14 w-full text-lg font-bold"
              disabled={isGenerating}
              onClick={() =>
                pendingUpdateNeedsReview
                  ? void navigateSafely(`/ahas/${aha.id}/update/review`)
                  : void regenerate()
              }
            >
              {isGenerating
                ? "CREATING PDF…"
                : pendingUpdateNeedsReview
                  ? "REVIEW UPDATE"
                  : "TRY AGAIN"}
            </Button>
          </section>
        )}

        {fitIssues.length > 0 ? (
          <div
            className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-warning-foreground"
            role="alert"
          >
            <p className="font-bold">The PDF needs shorter content:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm font-semibold">
              {fitIssues.map((issue) => (
                <li key={`${issue.fieldPath}-${issue.code}`}>
                  {issue.message}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <Button
          variant="outline"
          className="min-h-14 w-full border-[#C6CDE8] text-[17px] text-primary"
          disabled={!pdfCurrent || isSharing}
          onClick={() => void share()}
        >
          <Printer className="mr-2 size-5" aria-hidden="true" />
          {isSharing ? "OPENING…" : "Print / Share"}
        </Button>
        {downloadStarted ? (
          <p
            className="rounded-xl border border-card-border bg-card px-4 py-3 text-center text-sm font-semibold text-muted-foreground"
            role="status"
          >
            Sharing is not available here, so the PDF download was started.
          </p>
        ) : null}
        {isSharing && shareIsTakingLong && pdf?.record ? (
          <div
            className="rounded-xl border border-card-border bg-card p-4"
            role="status"
          >
            <p className="text-sm font-semibold text-muted-foreground">
              If the share window did not open, download the saved PDF instead.
            </p>
            <Button
              variant="outline"
              className="mt-3 min-h-12 w-full"
              onClick={downloadStoredPdf}
            >
              <Download className="mr-2 size-5" aria-hidden="true" /> Download
              PDF
            </Button>
          </div>
        ) : null}
        {shareFailed && pdf?.record ? (
          <div
            className="rounded-xl border border-warning/30 bg-warning/10 p-4"
            role="alert"
          >
            <p className="text-sm font-semibold text-warning-foreground">
              We couldn't open sharing. The PDF is still saved.
            </p>
            <Button
              variant="outline"
              className="mt-3 min-h-12 w-full"
              onClick={downloadStoredPdf}
            >
              <Download className="mr-2 size-5" aria-hidden="true" /> Download
              PDF
            </Button>
          </div>
        ) : null}
        <Button
          variant="outline"
          className="min-h-14 w-full border-[#C6CDE8] text-[17px] text-primary"
          onClick={() => void navigateSafely(`/ahas/${aha.id}/update/details`)}
        >
          Update today's AHA
        </Button>
        <Button
          variant="outline"
          className="min-h-14 w-full border-[#C6CDE8] text-[17px] text-primary"
          disabled={aha.crew.length >= 10}
          onClick={() => void navigateSafely(`/ahas/${aha.id}/add-worker`)}
        >
          + Add worker &amp; sign
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
