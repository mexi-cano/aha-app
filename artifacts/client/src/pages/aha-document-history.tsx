import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, Download, ExternalLink, History } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ahaDatabase, type AhaPdfRevisionRecord } from "@/data/database";
import {
  PdfVersionUnavailableOfflineError,
  openPdfRevision,
  refreshPdfVersionMetadata,
} from "@/data/pdf-version-repository";
import { useAhaEditor } from "@/features/aha-editor/editor-context";
import { useAhaPdfState } from "@/hooks/use-aha-pdf-state";
import { downloadPdf, getCurrentPdfOpenMode, usePdfObjectUrl } from "@/pdf";

const reasonLabels: Record<string, string> = {
  initial_completion: "Initial completion",
  late_arrival: "Late worker added",
  wrong_person_signed: "Wrong person signed",
  signature_unclear: "Signature replaced",
  worker_not_on_site: "Worker was not on site",
  duplicate_entry: "Duplicate worker removed",
  added_by_mistake: "Worker added by mistake",
  work_conditions_changed: "Work or safety information updated",
  administrative_correction: "Administrative information corrected",
};

function formatVersionTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function AhaDocumentHistory() {
  const { aha, navigateSafely } = useAhaEditor();
  const current = useAhaPdfState(aha);
  const revisions = useLiveQuery(
    async () =>
      (
        await ahaDatabase.ahaPdfRevisions
          .where("ahaId")
          .equals(aha.id)
          .toArray()
      ).sort(
        (left, right) =>
          right.sourceRevision - left.sourceRevision ||
          Date.parse(right.generatedAt) - Date.parse(left.generatedAt),
      ),
    [aha.id],
  );
  const [selected, setSelected] = useState<
    (AhaPdfRevisionRecord & { bytes: ArrayBuffer }) | null
  >(null);
  const [isOpening, setIsOpening] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const selectedUrl = usePdfObjectUrl(selected);
  const pdfOpenMode = getCurrentPdfOpenMode();

  useEffect(() => {
    if (!navigator.onLine) return;
    void refreshPdfVersionMetadata(aha.id).catch(() => {
      setMessage(
        "Document history could not be refreshed. Saved local versions are still available.",
      );
    });
  }, [aha.id]);

  const eventsByRevision = useMemo(
    () =>
      new Map(
        aha.documentEvents.map((event) => [event.toDocumentRevision, event]),
      ),
    [aha.documentEvents],
  );

  const openRevision = async (revision: AhaPdfRevisionRecord) => {
    if (isOpening) return;
    setIsOpening(revision.key);
    setMessage(null);
    try {
      const result = await openPdfRevision(revision);
      setSelected(result.record);
      if (!result.cached) {
        setMessage(
          "The PDF is ready to open, but this iPad did not have enough space to save an offline copy.",
        );
      }
    } catch (error) {
      setMessage(
        error instanceof PdfVersionUnavailableOfflineError
          ? error.message
          : "We couldn't open that older PDF. Its saved metadata was not removed.",
      );
    } finally {
      setIsOpening(null);
    }
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto grid max-w-[834px] grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-3">
          <button
            type="button"
            className="min-h-12 justify-self-start rounded-lg px-2 text-base font-semibold text-primary"
            onClick={() => void navigateSafely(`/ahas/${aha.id}/completed`)}
          >
            ‹ Completed
          </button>
          <h1 className="text-center text-lg font-bold">Document history</h1>
          <span />
        </div>
      </header>

      <div className="mx-auto flex max-w-[700px] flex-col gap-4 px-5 py-7 sm:px-7">
        <section className="rounded-2xl border border-card-border bg-card p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
              <History className="size-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-xl font-bold">Saved PDF versions</h2>
              <p className="mt-1 text-base font-medium text-muted-foreground">
                The current document and every superseded revision are retained.
              </p>
            </div>
          </div>
        </section>

        {message ? (
          <p
            className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-base font-semibold text-warning-foreground"
            role="status"
          >
            {message}
          </p>
        ) : null}

        {current?.record ? (
          <button
            type="button"
            className="min-h-24 rounded-2xl border border-success/30 bg-card p-5 text-left shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => void navigateSafely(`/ahas/${aha.id}/pdf`)}
          >
            <span className="flex items-center gap-2 text-sm font-bold text-success">
              <Check className="size-5" aria-hidden="true" /> CURRENT
            </span>
            <span className="mt-2 block text-lg font-bold">
              Revision {current.record.sourceRevision}
            </span>
            <span className="mt-1 block text-sm font-medium text-muted-foreground">
              Generated {formatVersionTime(current.record.generatedAt)}
            </span>
          </button>
        ) : null}

        {(revisions ?? []).map((revision) => {
          const event = eventsByRevision.get(revision.sourceRevision);
          return (
            <button
              type="button"
              key={revision.key}
              className="min-h-24 rounded-2xl border border-card-border bg-card p-5 text-left shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              disabled={Boolean(isOpening)}
              onClick={() => void openRevision(revision)}
            >
              <span className="flex items-center gap-2 text-sm font-bold text-muted-foreground">
                <History className="size-4" aria-hidden="true" /> SUPERSEDED
              </span>
              <span className="mt-2 block text-lg font-bold">
                Revision {revision.sourceRevision}
              </span>
              <span className="mt-1 block text-sm font-medium text-muted-foreground">
                {event
                  ? (reasonLabels[event.reason] ?? "Completed AHA update")
                  : "Earlier finalized PDF"}
                {" · "}
                {formatVersionTime(revision.generatedAt)}
                {revision.bytes
                  ? " · Saved on this iPad"
                  : " · Download when opened"}
              </span>
            </button>
          );
        })}

        {selected && selectedUrl ? (
          <section className="rounded-2xl border border-[#C6CDE8] bg-card p-5 shadow-sm">
            <h2 className="text-xl font-bold">Superseded PDF ready</h2>
            <p className="mt-1 text-base font-medium text-muted-foreground">
              Revision {selected.sourceRevision} · This is not the current AHA.
            </p>
            <Button asChild className="mt-4 min-h-14 w-full text-lg font-bold">
              <a href={selectedUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-2 size-5" aria-hidden="true" />
                {pdfOpenMode === "native" ? "OPEN FULL PDF" : "OPEN PDF"}
              </a>
            </Button>
            <Button
              variant="outline"
              className="mt-3 min-h-12 w-full"
              onClick={() => downloadPdf(selected)}
            >
              <Download className="mr-2 size-5" aria-hidden="true" /> Download
            </Button>
          </section>
        ) : null}
      </div>
    </main>
  );
}
