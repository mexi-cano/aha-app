import { useEffect, useMemo, useRef, useState } from "react";
import type { PointGroup } from "signature_pad";
import {
  MAX_CREW_MEMBERS,
  WORKER_ACKNOWLEDGMENT,
  addSignedCrewMember,
  canFinishAha,
  canStartSigning,
  completeAha,
  countSignedCrew,
  recordSignature,
  resolvePersonInChargeWorkerId,
} from "@workspace/aha-domain";

import { AhaSummary } from "@/components/aha/aha-summary";
import { ForemanBadge } from "@/components/aha/foreman-badge";
import {
  SignatureCanvas,
  type SignatureCanvasHandle,
} from "@/components/aha/signature-canvas";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { createLocalId } from "@/data/aha-repository";
import { useAhaEditor } from "@/features/aha-editor/editor-context";
import {
  formatEditorDate,
  formatLongDate,
  formatTime,
} from "@/lib/date-format";
import {
  analyzeAhaPdfFit,
  saveAhaAndGeneratePdf,
  type PdfFitIssue,
} from "@/pdf";

type SigningOrigin =
  { kind: "list" } | { kind: "member"; workerId: string } | { kind: "add" };
type SigningView = SigningOrigin | { kind: "review"; returnTo: SigningOrigin };

export default function AhaSigning() {
  const { aha, job, commitAha, navigateSafely, isOnline } = useAhaEditor();
  const [view, setView] = useState<SigningView>({ kind: "list" });
  const [resignWorkerId, setResignWorkerId] = useState<string | null>(null);
  const [signatureToViewId, setSignatureToViewId] = useState<string | null>(
    null,
  );
  const [addName, setAddName] = useState("");
  const [addWorkerId, setAddWorkerId] = useState(() => createLocalId());
  const [hasInk, setHasInk] = useState(false);
  const [stagedData, setStagedData] = useState<PointGroup[]>([]);
  const [isCommitting, setIsCommitting] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<"signature" | "ready" | null>(
    null,
  );
  const [exitAsk, setExitAsk] = useState(false);
  const [discardAsk, setDiscardAsk] = useState(false);
  const [limitMessage, setLimitMessage] = useState(false);
  const [fitIssues, setFitIssues] = useState<PdfFitIssue[]>([]);
  const signatureRef = useRef<SignatureCanvasHandle>(null);
  const finishSectionRef = useRef<HTMLDivElement>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishInFlightRef = useRef(false);

  const signedCount = countSignedCrew(aha);
  const unsignedCount = aha.crew.length - signedCount;
  const resignMember = aha.crew.find(
    ({ workerId }) => workerId === resignWorkerId,
  );
  const signatureToView = aha.crew.find(
    ({ workerId }) => workerId === signatureToViewId,
  );
  const signingMember =
    view.kind === "member"
      ? aha.crew.find(({ workerId }) => workerId === view.workerId)
      : null;
  const finishReady = useMemo(() => canFinishAha(aha), [aha]);
  const hasStagedEntry =
    hasInk || (view.kind === "add" && addName.trim().length > 0);
  const foremanWorkerId = resolvePersonInChargeWorkerId(aha);

  useEffect(() => {
    if (aha.status === "completed") {
      if (!finishInFlightRef.current) {
        void navigateSafely(`/ahas/${aha.id}/completed`);
      }
    } else if (aha.status !== "in_progress" || !canStartSigning(aha)) {
      void navigateSafely(`/ahas/${aha.id}/review`);
    }
  }, [aha, navigateSafely]);

  useEffect(() => {
    if (view.kind === "member" && !signingMember) {
      setView({ kind: "list" });
      setStagedData([]);
      setHasInk(false);
    }
  }, [signingMember, view.kind]);

  useEffect(
    () => () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    },
    [],
  );

  const showSavedNotice = (readyToFinish: boolean) => {
    setSavedNotice(readyToFinish ? "ready" : "signature");
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setSavedNotice(null), 4_000);
  };

  useEffect(() => {
    if (view.kind === "list" && savedNotice === "ready") {
      finishSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [savedNotice, view.kind]);

  const resetStagedSignature = () => {
    signatureRef.current?.clear();
    setHasInk(false);
    setStagedData([]);
    setOperationError(null);
  };

  const openMember = (workerId: string) => {
    resetStagedSignature();
    setView({ kind: "member", workerId });
  };

  const openAddWorker = () => {
    if (aha.crew.length >= MAX_CREW_MEMBERS) {
      setLimitMessage(true);
      return;
    }
    resetStagedSignature();
    setLimitMessage(false);
    setAddName("");
    setAddWorkerId(createLocalId());
    setView({ kind: "add" });
  };

  const openReadOnlyReview = (returnTo: SigningOrigin) => {
    if (returnTo.kind !== "list") {
      setStagedData(signatureRef.current?.toData() ?? []);
    }
    setView({ kind: "review", returnTo });
  };

  const confirmSignature = async () => {
    if (isCommitting) return;
    const signaturePng = signatureRef.current?.toPng();
    if (!signaturePng) return;
    if (view.kind === "add" && !addName.trim()) return;
    if (view.kind === "add" && aha.crew.length >= MAX_CREW_MEMBERS) {
      setLimitMessage(true);
      return;
    }
    if (view.kind !== "add" && view.kind !== "member") return;

    setIsCommitting(true);
    setOperationError(null);
    const saved = await commitAha((current) =>
      view.kind === "add"
        ? addSignedCrewMember(
            current,
            { id: addWorkerId, name: addName },
            signaturePng,
            new Date(),
          )
        : recordSignature(current, view.workerId, signaturePng, new Date()),
    );
    setIsCommitting(false);
    if (!saved) {
      setOperationError(
        "We couldn't save this signature. It is still on this screen. Try again.",
      );
      return;
    }

    resetStagedSignature();
    setAddName("");
    setView({ kind: "list" });
    showSavedNotice(canFinishAha(saved));
  };

  const requestBackToList = () => {
    if (hasStagedEntry) setDiscardAsk(true);
    else setView({ kind: "list" });
  };

  const requestExit = () => {
    if (unsignedCount > 0 || hasStagedEntry) setExitAsk(true);
    else void navigateSafely("/");
  };

  const finish = async () => {
    if (!finishReady || isCommitting || finishInFlightRef.current) return;
    finishInFlightRef.current = true;
    setIsCommitting(true);
    setOperationError(null);
    setFitIssues([]);
    try {
      let fit;
      try {
        fit = await analyzeAhaPdfFit(aha, job);
      } catch {
        setOperationError(
          "We couldn't check the official PDF. Your AHA and signatures are still saved. Try again.",
        );
        return;
      }
      if (fit.issues.length > 0) {
        setFitIssues(fit.issues);
        return;
      }

      const result = await saveAhaAndGeneratePdf({
        commitAha,
        update: (current) => completeAha(current, new Date()),
        job,
      });
      if (result.status === "save_failed") {
        setOperationError(
          "We couldn't finish today's AHA. Your AHA and signatures are still saved. Try again.",
        );
        return;
      }
      if (result.status === "fit_failed") {
        setFitIssues(result.issues);
      }
      await navigateSafely(`/ahas/${result.savedAha.id}/completed`);
    } finally {
      finishInFlightRef.current = false;
      setIsCommitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-card">
        <div className="mx-auto flex max-w-[834px] items-center gap-3 px-4 py-3 sm:px-7">
          <button
            type="button"
            className="min-h-12 shrink-0 rounded-lg px-2 text-base font-semibold text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring"
            disabled={isCommitting}
            onClick={requestExit}
          >
            ‹ Exit signing
          </button>
          <p className="min-w-0 flex-1 truncate text-center text-sm font-semibold text-muted-foreground sm:text-base">
            {job.name} — {formatEditorDate(aha.date)}
          </p>
          <p className="min-w-[92px] text-right text-sm font-bold sm:min-w-[120px] sm:text-base">
            {signedCount} of {aha.crew.length} signed
          </p>
        </div>
        <div className="bg-primary px-4 py-3 text-center text-sm font-bold tracking-[0.08em] text-primary-foreground sm:text-[15px]">
          SIGNING MODE — HAND THE DEVICE TO EACH CREW MEMBER
        </div>
        {!isOnline ? (
          <p className="bg-secondary px-4 py-2 text-center text-sm font-semibold text-secondary-foreground">
            You're offline. Your AHA is saved on this iPad and you can keep
            working.
          </p>
        ) : null}
      </header>

      <div className="mx-auto max-w-[748px] px-5 py-5 sm:px-6 sm:py-6">
        {view.kind === "list" ? (
          <div className="flex flex-col gap-4">
            <header>
              <h1 className="text-[28px] font-bold">Sign today's AHA</h1>
              <p className="mt-1 text-base font-medium text-muted-foreground sm:text-[17px]">
                Each crew member reads the AHA, then signs on this device
              </p>
            </header>

            {savedNotice ? (
              <div
                className="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-center text-base font-bold text-success"
                role="status"
              >
                {savedNotice === "ready"
                  ? "✓ All signatures saved — finish today's AHA below"
                  : "✓ Signature saved"}
              </div>
            ) : null}

            <Button
              type="button"
              variant="outline"
              className="min-h-14 w-full border-[#C6CDE8] text-[17px] text-primary"
              disabled={isCommitting}
              onClick={() => openReadOnlyReview({ kind: "list" })}
            >
              View today's AHA
            </Button>

            <div className="flex flex-col gap-2.5 pt-1">
              {aha.crew.map((member) => {
                const signed = Boolean(member.signaturePng && member.signedAt);
                return (
                  <button
                    key={member.workerId}
                    type="button"
                    className={`flex min-h-16 w-full items-center gap-3.5 rounded-xl bg-card px-5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      signed
                        ? "border border-card-border"
                        : "border-[1.5px] border-[#C6CDE8]"
                    }`}
                    disabled={isCommitting}
                    onClick={() =>
                      signed
                        ? setResignWorkerId(member.workerId)
                        : openMember(member.workerId)
                    }
                  >
                    <span className="min-w-0 flex-1 text-lg font-semibold">
                      {member.name}
                      {member.workerId === foremanWorkerId ? (
                        <ForemanBadge className="ml-2 align-middle" />
                      ) : null}
                    </span>
                    {signed && member.signedAt ? (
                      <span className="shrink-0 text-base font-semibold text-success">
                        Signed {formatTime(member.signedAt)} ✓
                      </span>
                    ) : (
                      <span className="shrink-0 text-base font-semibold text-primary">
                        Tap to sign ›
                      </span>
                    )}
                  </button>
                );
              })}
              <Button
                type="button"
                variant="outline"
                className="min-h-14 w-full border-[1.5px] border-dashed border-[#C6CDE8] text-[17px] font-bold text-primary"
                disabled={isCommitting}
                onClick={openAddWorker}
              >
                + Add Worker
              </Button>
            </div>

            {limitMessage ? (
              <p
                className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-base font-semibold text-warning-foreground"
                role="status"
              >
                This won't fit on the ITS sheet. Remove an absent worker before
                adding someone else.
              </p>
            ) : null}
            {operationError ? (
              <p
                className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-base font-semibold text-warning-foreground"
                role="alert"
              >
                {operationError}
              </p>
            ) : null}
            {fitIssues.length > 0 ? (
              <div
                className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-warning-foreground"
                role="alert"
              >
                <p className="font-bold">
                  The official PDF needs shorter content before completion:
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm font-semibold">
                  {fitIssues.map((issue) => (
                    <li key={`${issue.fieldPath}-${issue.code}`}>
                      {issue.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div ref={finishSectionRef} className="flex flex-col gap-2.5 pt-2">
              <Button
                className="min-h-[72px] w-full rounded-[14px] text-xl font-bold tracking-wide"
                disabled={!finishReady || isCommitting}
                onClick={() => void finish()}
              >
                {isCommitting ? "FINISHING…" : "FINISH TODAY'S AHA"}
              </Button>
              <p className="text-center text-[15px] font-medium text-muted-foreground">
                {finishReady
                  ? "All signatures in — this completes today's AHA"
                  : "Enables when everyone has signed"}
              </p>
            </div>
          </div>
        ) : null}

        {view.kind === "member" || view.kind === "add" ? (
          <div className="flex flex-col gap-4">
            <button
              type="button"
              className="min-h-12 self-start rounded-lg px-1 text-[17px] font-semibold text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={requestBackToList}
            >
              ‹ Back to crew list
            </button>

            {view.kind === "add" ? (
              <label className="flex flex-col gap-2 text-base font-bold">
                <span>
                  Worker name{" "}
                  <span className="font-medium text-muted-foreground">
                    — joins today's crew
                  </span>
                </span>
                <Input
                  value={addName}
                  className="min-h-14 text-xl font-semibold"
                  placeholder="First and last name"
                  autoComplete="name"
                  onChange={(event) => setAddName(event.target.value)}
                />
                <span className="text-[17px] font-medium text-muted-foreground">
                  Signing for {formatLongDate(aha.date)}
                </span>
              </label>
            ) : (
              <header>
                <h1 className="text-3xl font-bold">
                  {signingMember?.name ?? "Crew member"}
                </h1>
                <p className="mt-1 text-[17px] font-medium text-muted-foreground">
                  Signing for {formatLongDate(aha.date)}
                </p>
              </header>
            )}

            <button
              type="button"
              className="min-h-12 self-start rounded-lg px-1 text-[17px] font-semibold text-primary underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() =>
                openReadOnlyReview(
                  view.kind === "add"
                    ? { kind: "add" }
                    : { kind: "member", workerId: view.workerId },
                )
              }
            >
              Review the AHA ›
            </button>

            <p className="rounded-xl border border-[#C6CDE8] bg-secondary px-5 py-[18px] text-[17px] font-medium leading-[1.5]">
              {WORKER_ACKNOWLEDGMENT}
            </p>

            <SignatureCanvas
              ref={signatureRef}
              disabled={isCommitting}
              initialData={stagedData}
              onInkChange={setHasInk}
            />
            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                className="min-h-16 px-6 text-[17px] text-primary"
                disabled={!hasInk || isCommitting}
                onClick={resetStagedSignature}
              >
                Clear
              </Button>
              <Button
                type="button"
                className="min-h-16 flex-1 text-[19px] font-bold tracking-wide"
                disabled={
                  !hasInk ||
                  isCommitting ||
                  (view.kind === "add" && !addName.trim())
                }
                onClick={() => void confirmSignature()}
              >
                {isCommitting ? "SAVING…" : "CONFIRM SIGNATURE"}
              </Button>
            </div>
            {operationError ? (
              <p
                className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-base font-semibold text-warning-foreground"
                role="alert"
              >
                {operationError}
              </p>
            ) : null}
          </div>
        ) : null}

        {view.kind === "review" ? (
          <div className="flex flex-col gap-4">
            <button
              type="button"
              className="min-h-12 self-start rounded-lg px-1 text-[17px] font-semibold text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setView(view.returnTo)}
            >
              ‹ Back to signing
            </button>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-[28px] font-bold">Today's AHA</h1>
              <span className="inline-flex min-h-8 items-center rounded-lg border-[1.5px] border-[#C6CDE8] px-3 text-[13px] font-bold tracking-[0.08em] text-primary">
                READ ONLY
              </span>
            </div>
            <AhaSummary aha={aha} job={job} mode="signing" />
          </div>
        ) : null}
      </div>

      <AlertDialog
        open={resignWorkerId !== null}
        onOpenChange={(open) => !open && setResignWorkerId(null)}
      >
        <AlertDialogContent className="max-w-md rounded-2xl bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-bold">
              {resignMember?.name} has already signed.
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base font-medium">
              Sign again? A successfully saved signature replaces the earlier
              one.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:flex-wrap">
            <AlertDialogCancel className="min-h-12 text-base">
              Cancel
            </AlertDialogCancel>
            <Button
              type="button"
              variant="outline"
              className="min-h-12 text-base text-primary"
              onClick={() => {
                setSignatureToViewId(resignWorkerId);
                setResignWorkerId(null);
              }}
            >
              View signature
            </Button>
            <AlertDialogAction
              className="min-h-12 px-6 text-base"
              onClick={() => {
                if (resignWorkerId) openMember(resignWorkerId);
                setResignWorkerId(null);
              }}
            >
              Sign again
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={signatureToViewId !== null}
        onOpenChange={(open) => !open && setSignatureToViewId(null)}
      >
        <DialogContent className="max-w-lg rounded-2xl bg-card">
          <DialogHeader>
            <DialogTitle className="text-xl">
              {signatureToView?.name}'s signature
            </DialogTitle>
            <DialogDescription className="text-base">
              Signed{" "}
              {signatureToView?.signedAt
                ? formatTime(signatureToView.signedAt)
                : "today"}
            </DialogDescription>
          </DialogHeader>
          {signatureToView?.signaturePng ? (
            <div className="rounded-xl border border-border bg-white p-4">
              <img
                src={signatureToView.signaturePng}
                alt={`${signatureToView.name}'s saved signature`}
                className="mx-auto max-h-64 w-full object-contain"
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={exitAsk} onOpenChange={setExitAsk}>
        <AlertDialogContent className="max-w-md rounded-2xl bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-bold">
              {unsignedCount > 0
                ? unsignedCount === 1
                  ? "1 worker still hasn't signed."
                  : `${unsignedCount} workers still haven't signed.`
                : "This signature hasn't been saved."}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base font-medium">
              The AHA stays In progress — continue signing anytime from Home.
              {hasStagedEntry
                ? " The signature currently on screen will not be saved."
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogAction
              className="min-h-12 bg-card px-5 text-base text-muted-foreground ring-1 ring-border hover:bg-secondary"
              onClick={() => void navigateSafely("/")}
            >
              Exit anyway
            </AlertDialogAction>
            <AlertDialogCancel className="min-h-12 bg-primary px-6 text-base text-primary-foreground hover:bg-primary/90">
              Keep signing
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={discardAsk} onOpenChange={setDiscardAsk}>
        <AlertDialogContent className="max-w-md rounded-2xl bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-bold">
              Discard this unsigned signature?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base font-medium">
              This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="min-h-12 text-base">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="min-h-12 bg-foreground px-6 text-base text-background"
              onClick={() => {
                resetStagedSignature();
                setAddName("");
                setView({ kind: "list" });
              }}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
