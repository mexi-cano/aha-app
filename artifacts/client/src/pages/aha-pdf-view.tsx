import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getAhaPdfState } from "@/data/aha-repository";
import { useAhaEditor } from "@/features/aha-editor/editor-context";
import { downloadPdf, pdfBlob } from "@/pdf";

export default function AhaPdfView() {
  const { aha, navigateSafely } = useAhaEditor();
  const pdf = useLiveQuery(
    () => getAhaPdfState(aha),
    [aha.id, aha.documentRevision],
  );
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (pdf?.status !== "current" || !pdf.record) {
      setUrl(null);
      return;
    }
    const nextUrl = URL.createObjectURL(pdfBlob(pdf.record));
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [pdf]);

  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b border-border bg-card px-4 py-3">
        <div className="mx-auto flex max-w-[834px] items-center gap-3">
          <button
            type="button"
            className="min-h-12 rounded-lg px-2 text-base font-semibold text-primary"
            onClick={() => void navigateSafely(`/ahas/${aha.id}/completed`)}
          >
            ‹ Completed
          </button>
          <h1 className="min-w-0 flex-1 truncate text-center text-lg font-bold">
            Completed AHA PDF
          </h1>
          {pdf?.status === "current" && pdf.record ? (
            <Button
              variant="outline"
              className="min-h-12"
              onClick={() => downloadPdf(pdf.record!)}
            >
              <Download className="size-5 sm:mr-2" aria-hidden="true" />
              <span className="hidden sm:inline">Download</span>
            </Button>
          ) : (
            <span className="w-12" />
          )}
        </div>
      </header>
      {url ? (
        <iframe
          src={url}
          title="Completed Activity Hazard Analysis PDF"
          className="min-h-[calc(100vh-73px)] w-full flex-1 border-0"
        />
      ) : (
        <section className="mx-auto my-10 max-w-lg px-5 text-center">
          <h2 className="text-xl font-bold">
            The current PDF is not available.
          </h2>
          <p className="mt-2 text-base font-medium text-muted-foreground">
            Return to Completed to create it again. Any older or unreadable copy
            remains saved.
          </p>
          <Button
            className="mt-5 min-h-12"
            onClick={() => void navigateSafely(`/ahas/${aha.id}/completed`)}
          >
            Return to Completed
          </Button>
        </section>
      )}
    </main>
  );
}
