import { useLiveQuery } from "dexie-react-hooks";
import { Download, ExternalLink } from "lucide-react";
import { useLocation } from "react-router";

import {
  PdfShareButton,
  PdfShareFeedback,
  usePdfShare,
} from "@/components/aha/pdf-share";
import { Button } from "@/components/ui/button";
import { getAhaPdfState } from "@/data/aha-repository";
import { useAhaEditor } from "@/features/aha-editor/editor-context";
import { resolvePdfReturnNavigation } from "@/features/aha-editor/pdf-navigation";
import { useToday } from "@/hooks/use-today";
import { downloadPdf, getCurrentPdfOpenMode, usePdfObjectUrl } from "@/pdf";

export default function AhaPdfView() {
  const { aha, navigateSafely } = useAhaEditor();
  const location = useLocation();
  const today = useToday();
  const pdf = useLiveQuery(
    () => getAhaPdfState(aha),
    [aha.id, aha.documentRevision],
  );
  const url = usePdfObjectUrl(pdf?.status === "current" ? pdf.record : null);
  const pdfOpenMode = getCurrentPdfOpenMode();
  const currentRecord = pdf?.status === "current" ? pdf.record : null;
  const shareController = usePdfShare(currentRecord);
  const returnNavigation = resolvePdfReturnNavigation(
    location.state,
    aha.id,
    aha.date,
    today,
  );

  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b border-border bg-card px-4 py-3">
        <div className="mx-auto grid max-w-[834px] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
          <button
            type="button"
            className="min-h-12 justify-self-start rounded-lg px-2 text-base font-semibold text-primary"
            onClick={() => void navigateSafely(returnNavigation.path)}
          >
            ‹ {returnNavigation.label}
          </button>
          <h1 className="min-w-0 truncate text-center text-lg font-bold">
            <span className="sm:hidden">AHA PDF</span>
            <span className="hidden sm:inline">Completed AHA PDF</span>
          </h1>
          {currentRecord ? (
            <div className="flex shrink-0 items-center justify-self-end gap-2">
              <PdfShareButton
                controller={shareController}
                responsiveLabel
                className="text-primary"
              />
              <Button
                variant="outline"
                className="min-h-12 min-w-12"
                aria-label="Download PDF"
                onClick={() => downloadPdf(currentRecord)}
              >
                <Download className="size-5 sm:mr-2" aria-hidden="true" />
                <span className="hidden sm:inline">Download</span>
              </Button>
            </div>
          ) : (
            <span className="w-12 justify-self-end" />
          )}
        </div>
      </header>
      <PdfShareFeedback
        controller={shareController}
        className="mx-5 mt-4 sm:mx-auto sm:w-full sm:max-w-[700px]"
      />
      {pdf === undefined || (pdf?.status === "current" && !url) ? (
        <section
          className="mx-auto my-10 max-w-lg px-5 text-center"
          role="status"
        >
          <p className="text-base font-semibold text-muted-foreground">
            Opening the saved PDF…
          </p>
        </section>
      ) : url && pdf?.status === "current" && pdf.record ? (
        pdfOpenMode === "native" ? (
          <section className="mx-auto my-10 w-full max-w-lg px-5 text-center">
            <div className="rounded-2xl border border-card-border bg-card p-6 shadow-sm sm:p-8">
              <h2 className="text-2xl font-bold">Open the complete PDF</h2>
              <p className="mt-3 text-base font-medium leading-relaxed text-muted-foreground">
                Safari will open the complete two-page AHA in its PDF viewer.
              </p>
              <Button
                asChild
                className="mt-6 min-h-14 w-full text-lg font-bold"
              >
                <a href={url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-2 size-5" aria-hidden="true" />
                  OPEN FULL PDF
                </a>
              </Button>
              <Button
                variant="outline"
                className="mt-3 min-h-12 w-full text-base"
                onClick={() => downloadPdf(pdf.record)}
              >
                <Download className="mr-2 size-5" aria-hidden="true" />
                Download PDF
              </Button>
              <Button
                variant="ghost"
                className="mt-3 min-h-12 w-full text-base text-primary"
                onClick={() => void navigateSafely(returnNavigation.path)}
              >
                Back to {returnNavigation.label}
              </Button>
            </div>
          </section>
        ) : (
          <div className="flex flex-1 justify-center bg-[#E4E7EE] p-3 sm:p-6">
            <iframe
              src={url}
              title="Completed Activity Hazard Analysis PDF"
              className="min-h-[calc(100vh-121px)] w-full max-w-[1100px] border-0 bg-card shadow-sm"
            />
          </div>
        )
      ) : (
        <section className="mx-auto my-10 max-w-lg px-5 text-center">
          <h2 className="text-xl font-bold">
            The current PDF is not available.
          </h2>
          <p className="mt-2 text-base font-medium text-muted-foreground">
            Return to {returnNavigation.label} to create it again. Any older or
            unreadable copy remains saved.
          </p>
          <Button
            className="mt-5 min-h-12"
            onClick={() => void navigateSafely(returnNavigation.path)}
          >
            Return to {returnNavigation.label}
          </Button>
        </section>
      )}
    </main>
  );
}
