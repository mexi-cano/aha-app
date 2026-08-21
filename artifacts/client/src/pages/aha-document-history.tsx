import { useCallback, useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  AlertTriangle,
  Check,
  Download,
  ExternalLink,
  History,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ahaDatabase, type AhaPdfRevisionRecord } from "@/data/database";
import {
  PdfVersionOpenError,
  getPdfVersionIntegrityState,
  isPdfRevisionAffectedByIntegrityConflict,
  openPdfRevision,
  refreshPdfVersionMetadata,
} from "@/data/pdf-version-repository";
import { useAhaEditor } from "@/features/aha-editor/editor-context";
import { useAhaPdfState } from "@/hooks/use-aha-pdf-state";
import { useOnlineStatus } from "@/hooks/use-online-status";
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

function formatVersionTime(value: string, includeSeconds = false): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...(includeSeconds ? { second: "2-digit" } : {}),
  }).format(new Date(value));
}

function historyRefreshErrorMessage(error: unknown, isOnline: boolean): string {
  if (!isOnline) {
    return "Connect to refresh document history. Saved offline versions are still available.";
  }
  return error instanceof PdfVersionOpenError
    ? error.message
    : "Document history could not be refreshed. Saved offline versions are still available.";
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
  const integrityState = useLiveQuery(
    () => getPdfVersionIntegrityState(aha.id),
    [aha.id],
  );
  const [selected, setSelected] = useState<
    (AhaPdfRevisionRecord & { bytes: ArrayBuffer }) | null
  >(null);
  const [isOpening, setIsOpening] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [failedRevision, setFailedRevision] =
    useState<AhaPdfRevisionRecord | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const isOnline = useOnlineStatus();
  const selectedUrl = usePdfObjectUrl(selected);
  const pdfOpenMode = getCurrentPdfOpenMode();

  const refreshHistory = useCallback(async () => {
    if (!isOnline) return;
    setIsRefreshing(true);
    setRefreshError(null);
    try {
      await refreshPdfVersionMetadata(aha.id);
    } catch (error) {
      setRefreshError(historyRefreshErrorMessage(error, navigator.onLine));
    } finally {
      setIsRefreshing(false);
    }
  }, [aha.id, isOnline]);

  useEffect(() => {
    if (!isOnline) return;
    void refreshHistory();
  }, [isOnline, refreshHistory]);

  const revisionCounts = useMemo(() => {
    const counts = new Map<number, number>();
    const sourceRevisions = [
      ...(current?.record ? [current.record.sourceRevision] : []),
      ...(revisions ?? []).map((revision) => revision.sourceRevision),
    ];
    for (const sourceRevision of sourceRevisions) {
      counts.set(sourceRevision, (counts.get(sourceRevision) ?? 0) + 1);
    }
    return counts;
  }, [current?.record, revisions]);

  const eventsByVersionKey = useMemo(() => {
    const matches = new Map<string, (typeof aha.documentEvents)[number]>();
    const candidates = [
      ...(current?.record
        ? [
            {
              key: `current:${current.record.generatedAt}`,
              sourceRevision: current.record.sourceRevision,
              generatedAt: current.record.generatedAt,
              isCurrent: true,
            },
          ]
        : []),
      ...(revisions ?? []).map((revision) => ({
        key: revision.key,
        sourceRevision: revision.sourceRevision,
        generatedAt: revision.generatedAt,
        isCurrent: false,
      })),
    ];
    for (const event of aha.documentEvents) {
      const match = candidates
        .filter(
          (candidate) =>
            candidate.sourceRevision === event.toDocumentRevision &&
            Date.parse(candidate.generatedAt) >= Date.parse(event.occurredAt),
        )
        .sort(
          (left, right) =>
            Date.parse(left.generatedAt) - Date.parse(right.generatedAt),
        )[0];
      if (match && !match.isCurrent) matches.set(match.key, event);
    }
    return matches;
  }, [aha.documentEvents, current?.record, revisions]);

  const openRevision = async (revision: AhaPdfRevisionRecord) => {
    if (isOpening) return;
    setIsOpening(revision.key);
    setMessage(null);
    setFailedRevision(null);
    try {
      const result = await openPdfRevision(revision);
      setSelected(result.record);
      if (!result.cached) {
        setMessage(
          "The PDF is ready to open, but this iPad did not have enough space to save an offline copy.",
        );
      }
    } catch (error) {
      setFailedRevision(revision);
      setMessage(
        error instanceof PdfVersionOpenError
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
          <div className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-warning-foreground">
            <p className="text-base font-semibold" role="status">
              {message}
            </p>
            {failedRevision ? (
              <Button
                type="button"
                variant="outline"
                className="mt-3 min-h-12 border-warning/40 bg-card px-5"
                disabled={Boolean(isOpening)}
                onClick={() => void openRevision(failedRevision)}
              >
                TRY AGAIN
              </Button>
            ) : null}
          </div>
        ) : null}

        {refreshError ? (
          <div className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-warning-foreground">
            <p className="text-base font-semibold" role="status">
              {refreshError}
            </p>
            {!integrityState?.conflicts.length ? (
              <Button
                type="button"
                variant="outline"
                className="mt-3 min-h-12 w-full border-warning/40 bg-card text-warning-foreground"
                disabled={!isOnline || isRefreshing}
                onClick={() => void refreshHistory()}
              >
                {isRefreshing ? "TRYING AGAIN…" : "TRY AGAIN"}
              </Button>
            ) : null}
          </div>
        ) : null}

        {integrityState?.conflicts.length ? (
          <section
            className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-4 text-warning-foreground"
            role="alert"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle
                className="mt-0.5 size-5 shrink-0"
                aria-hidden="true"
              />
              <div>
                <h2 className="font-bold">PDF history needs verification</h2>
                <p className="mt-1 text-sm font-semibold leading-relaxed">
                  Conflicting checksum details were found for the saved
                  {integrityState.conflicts.length === 1
                    ? " version below"
                    : " versions below"}
                  . Nothing was removed, and other documents remain available.
                </p>
                <ul className="mt-2 text-sm font-semibold">
                  {integrityState.conflicts.map((conflict) => (
                    <li key={conflict.key}>
                      Revision {conflict.sourceRevision} · Generated{" "}
                      {formatVersionTime(conflict.generatedAt, true)}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              className="mt-3 min-h-12 w-full border-warning/40 bg-card text-warning-foreground"
              disabled={!isOnline || isRefreshing}
              onClick={() => void refreshHistory()}
            >
              {isRefreshing ? "CHECKING…" : "CHECK AGAIN"}
            </Button>
            {!isOnline ? (
              <p className="mt-2 text-center text-sm font-semibold">
                Connect to check this saved version again.
              </p>
            ) : null}
          </section>
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
          const event = eventsByVersionKey.get(revision.key);
          const hasIntegrityConflict = isPdfRevisionAffectedByIntegrityConflict(
            revision,
            integrityState ?? null,
          );
          const hasSameRevisionVersions =
            (revisionCounts.get(revision.sourceRevision) ?? 0) > 1;
          return (
            <button
              type="button"
              key={revision.key}
              className="min-h-24 rounded-2xl border border-card-border bg-card p-5 text-left shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              disabled={Boolean(isOpening) || hasIntegrityConflict}
              onClick={() => void openRevision(revision)}
            >
              <span className="flex items-center gap-2 text-sm font-bold text-muted-foreground">
                <History className="size-4" aria-hidden="true" /> SUPERSEDED
              </span>
              <span className="mt-2 block text-lg font-bold">
                Revision {revision.sourceRevision}
              </span>
              <span className="mt-1 block text-sm font-medium text-muted-foreground">
                {hasIntegrityConflict
                  ? "Integrity conflict"
                  : event
                    ? (reasonLabels[event.reason] ?? "Completed AHA update")
                    : hasSameRevisionVersions
                      ? "Regenerated PDF"
                      : "Earlier finalized PDF"}
                {" · "}
                {formatVersionTime(
                  revision.generatedAt,
                  hasSameRevisionVersions,
                )}
                {revision.bytes ? " · Saved offline" : " · Available online"}
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
