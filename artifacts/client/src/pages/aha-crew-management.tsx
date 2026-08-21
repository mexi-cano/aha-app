import { useMemo, useState } from "react";
import { Check, Eye, PenLine, Trash2 } from "lucide-react";
import {
  removeCompletedCrewMember,
  type CompletedWorkerRemovalReason,
} from "@workspace/aha-domain";

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
import { useAhaPdfState } from "@/hooks/use-aha-pdf-state";
import { formatTime } from "@/lib/date-format";
import {
  navigateAfterPersistedPdfOperation,
  saveAhaAndGeneratePdf,
} from "@/pdf";

const removalReasons: Array<{
  value: CompletedWorkerRemovalReason;
  label: string;
}> = [
  { value: "worker_not_on_site", label: "Worker was not on site" },
  { value: "duplicate_entry", label: "Duplicate entry" },
  { value: "added_by_mistake", label: "Added by mistake" },
];

interface PendingRemoval {
  workerId: string;
  reason: CompletedWorkerRemovalReason | null;
  note: string;
}

export default function AhaCrewManagement() {
  const { aha, job, commitAha, navigateSafely, isCompletedLocked } =
    useAhaEditor();
  const pdf = useAhaPdfState(aha);
  const [viewingSignatureId, setViewingSignatureId] = useState<string | null>(
    null,
  );
  const [pendingRemoval, setPendingRemoval] = useState<PendingRemoval | null>(
    null,
  );
  const [confirmRemoval, setConfirmRemoval] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const duplicateQualifiers = useMemo(() => {
    const counts = new Map<string, number>();
    const positions = new Map<string, number>();
    for (const member of aha.crew) {
      const key = member.name.trim().toLocaleLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return new Map(
      aha.crew.map((member) => {
        const key = member.name.trim().toLocaleLowerCase();
        const position = (positions.get(key) ?? 0) + 1;
        positions.set(key, position);
        const count = counts.get(key) ?? 1;
        return [member.workerId, count > 1 ? `${position} of ${count}` : null];
      }),
    );
  }, [aha.crew]);

  const unavailable =
    aha.status !== "completed" ||
    isCompletedLocked ||
    pdf?.status !== "current" ||
    Boolean(aha.pendingCompletedUpdate);
  const viewedMember = aha.crew.find(
    ({ workerId }) => workerId === viewingSignatureId,
  );
  const removalMember = aha.crew.find(
    ({ workerId }) => workerId === pendingRemoval?.workerId,
  );

  const removeWorker = async () => {
    if (!pendingRemoval?.reason || !removalMember || isSaving || unavailable) {
      return;
    }
    setConfirmRemoval(false);
    setIsSaving(true);
    setError(null);
    const correctedAt = new Date();
    const result = await saveAhaAndGeneratePdf({
      commitAha,
      update: (current) =>
        removeCompletedCrewMember(
          current,
          removalMember.workerId,
          pendingRemoval.reason!,
          pendingRemoval.note,
          correctedAt,
        ),
      job,
    });
    setIsSaving(false);
    if (result.status === "save_failed") {
      setError(
        "We couldn't save this correction. The worker and current PDF are unchanged.",
      );
      return;
    }
    await navigateAfterPersistedPdfOperation(result, navigateSafely);
  };

  if (unavailable) {
    return (
      <main className="min-h-screen bg-background px-5 py-12 text-center">
        <h1 className="text-2xl font-bold">Crew corrections are unavailable</h1>
        <p className="mx-auto mt-3 max-w-md text-base font-medium text-muted-foreground">
          {isCompletedLocked
            ? "A later AHA has started for this job, so this signed checkpoint is read-only."
            : "Finish or repair the current PDF before starting another correction."}
        </p>
        <Button
          className="mt-6 min-h-12"
          onClick={() => void navigateSafely(`/ahas/${aha.id}/completed`)}
        >
          Return to Completed
        </Button>
      </main>
    );
  }

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
          <h1 className="text-center text-lg font-bold">
            Crew &amp; signatures
          </h1>
          <span />
        </div>
      </header>

      <div className="mx-auto flex max-w-[700px] flex-col gap-4 px-5 py-7 sm:px-7">
        <section className="rounded-2xl border border-card-border bg-card p-5 shadow-sm">
          <h2 className="text-2xl font-bold">Manage signed crew</h2>
          <p className="mt-2 text-base font-medium text-muted-foreground">
            Replace only the affected signature, or remove a worker entered by
            mistake. All other signatures stay saved.
          </p>
        </section>

        {error ? (
          <p
            className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 font-semibold text-warning-foreground"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        {aha.crew.map((member) => (
          <section
            key={member.workerId}
            className="rounded-2xl border border-card-border bg-card p-5 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">
                  {member.name}
                  {duplicateQualifiers.get(member.workerId) ? (
                    <span className="ml-2 rounded-md bg-secondary px-2 py-1 text-xs font-bold text-primary">
                      {duplicateQualifiers.get(member.workerId)}
                    </span>
                  ) : null}
                </h2>
                <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-success">
                  <Check className="size-4" aria-hidden="true" />
                  {member.signedAt
                    ? `Signed ${formatTime(member.signedAt)}`
                    : "Signature missing"}
                </p>
              </div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <Button
                variant="outline"
                className="min-h-12"
                disabled={!member.signaturePng || isSaving}
                onClick={() => setViewingSignatureId(member.workerId)}
              >
                <Eye className="mr-2 size-4" aria-hidden="true" /> View
              </Button>
              <Button
                variant="outline"
                className="min-h-12"
                disabled={!member.signaturePng || isSaving}
                onClick={() =>
                  void navigateSafely(
                    `/ahas/${aha.id}/crew/${encodeURIComponent(member.workerId)}/replace-signature`,
                  )
                }
              >
                <PenLine className="mr-2 size-4" aria-hidden="true" /> Replace
              </Button>
              <Button
                variant="outline"
                className="min-h-12 border-destructive/30 text-destructive"
                disabled={aha.crew.length <= 1 || isSaving}
                onClick={() =>
                  setPendingRemoval({
                    workerId: member.workerId,
                    reason: null,
                    note: "",
                  })
                }
              >
                <Trash2 className="mr-2 size-4" aria-hidden="true" /> Remove
              </Button>
            </div>
          </section>
        ))}

        {viewedMember?.signaturePng ? (
          <section className="rounded-2xl border border-[#C6CDE8] bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold">
                {viewedMember.name}'s saved signature
              </h2>
              <Button
                variant="ghost"
                className="min-h-12"
                onClick={() => setViewingSignatureId(null)}
              >
                Close
              </Button>
            </div>
            <div className="mt-3 rounded-xl border border-border bg-white p-4">
              <img
                src={viewedMember.signaturePng}
                alt={`${viewedMember.name}'s saved signature`}
                className="mx-auto max-h-40 max-w-full"
              />
            </div>
          </section>
        ) : null}

        {pendingRemoval && removalMember ? (
          <section className="rounded-2xl border border-destructive/25 bg-card p-5 shadow-sm">
            <h2 className="text-xl font-bold">Remove {removalMember.name}?</h2>
            <p className="mt-2 text-base font-medium text-muted-foreground">
              Choose the audit reason. The current PDF remains preserved as a
              superseded version.
            </p>
            <div className="mt-4 grid gap-2">
              {removalReasons.map((reason) => (
                <button
                  type="button"
                  key={reason.value}
                  className={`min-h-12 rounded-xl border px-4 text-left text-base font-semibold ${
                    pendingRemoval.reason === reason.value
                      ? "border-primary bg-secondary text-primary"
                      : "border-border bg-background"
                  }`}
                  onClick={() =>
                    setPendingRemoval((current) =>
                      current ? { ...current, reason: reason.value } : current,
                    )
                  }
                >
                  {reason.label}
                </button>
              ))}
            </div>
            <label
              className="mt-4 block text-sm font-bold"
              htmlFor="removal-note"
            >
              Optional note
            </label>
            <Textarea
              id="removal-note"
              className="mt-2 min-h-24 text-base"
              maxLength={250}
              value={pendingRemoval.note}
              onChange={(event) =>
                setPendingRemoval((current) =>
                  current ? { ...current, note: event.target.value } : current,
                )
              }
            />
            <p className="mt-1 text-right text-xs font-semibold text-muted-foreground">
              {pendingRemoval.note.length}/250
            </p>
            {aha.personInChargeWorkerId === removalMember.workerId ? (
              <p className="mt-3 rounded-lg bg-secondary px-3 py-2 text-sm font-semibold text-primary">
                {aha.header.personInCharge} remains the printed Person in charge
                but will no longer be associated with today's signing crew.
              </p>
            ) : null}
            <div className="mt-4 flex flex-col gap-2 sm:flex-row-reverse">
              <Button
                className="min-h-12 bg-destructive text-white sm:flex-1"
                disabled={!pendingRemoval.reason || isSaving}
                onClick={() => setConfirmRemoval(true)}
              >
                {isSaving ? "SAVING…" : "REMOVE WORKER"}
              </Button>
              <Button
                variant="outline"
                className="min-h-12 sm:flex-1"
                disabled={isSaving}
                onClick={() => setPendingRemoval(null)}
              >
                Cancel
              </Button>
            </div>
          </section>
        ) : null}
      </div>

      <AlertDialog open={confirmRemoval} onOpenChange={setConfirmRemoval}>
        <AlertDialogContent className="max-w-md rounded-2xl bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-bold">
              Remove this signed worker?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base font-medium">
              Their row and signature will leave the current AHA. The prior PDF
              and correction reason remain preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="min-h-12">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-12 bg-destructive text-white"
              onClick={() => void removeWorker()}
            >
              Remove worker
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
