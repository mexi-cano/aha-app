import { useEffect, useMemo, useRef, useState } from "react";
import {
  MAX_CREW_MEMBERS,
  CREW_REVIEW_CONFIRMATION,
  addSignedCrewMember,
  canFinishAha,
  canStartSigning,
  confirmSigningCrewReview,
  completeAha,
  countSignedCrew,
  recordSignature,
  resolvePersonInChargeWorkerId,
} from "@workspace/aha-domain";

import { AhaSummary } from "@/components/aha/aha-summary";
import { ForemanBadge } from "@/components/aha/foreman-badge";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createLocalId } from "@/data/aha-repository";
import { useAhaEditor } from "@/features/aha-editor/editor-context";
import {
  describePdfFitIssue,
  pdfFitIssueEditorPath,
} from "@/features/aha-editor/pdf-fit-navigation";
import { runAhaPdfFitPreflight } from "@/features/aha-editor/pdf-fit-preflight";
import {
  getWorkerReviewCopy,
  type WorkerReviewErrorKey,
  type WorkerReviewLanguage,
} from "@/features/aha-editor/worker-review-copy";
import { formatEditorDate, formatTime } from "@/lib/date-format";
import {
  navigateAfterPersistedPdfOperation,
  saveAhaAndGeneratePdf,
  type PdfFitIssue,
} from "@/pdf";

type SigningView =
  | { kind: "list" }
  | { kind: "member"; workerId: string }
  | { kind: "add" }
  | { kind: "review" };

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
  const [isCommitting, setIsCommitting] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [workerError, setWorkerError] = useState<WorkerReviewErrorKey | null>(
    null,
  );
  const [workerLanguage, setWorkerLanguage] =
    useState<WorkerReviewLanguage>("en");
  const [savedNotice, setSavedNotice] = useState<"signature" | "ready" | null>(
    null,
  );
  const [exitAsk, setExitAsk] = useState(false);
  const [discardAsk, setDiscardAsk] = useState(false);
  const [limitMessage, setLimitMessage] = useState(false);
  const [fitIssues, setFitIssues] = useState<PdfFitIssue[]>([]);
  const [fitState, setFitState] = useState<"checking" | "ready" | "error">(
    "checking",
  );
  const [fitRevision, setFitRevision] = useState<number | null>(null);
  const [fitAttempt, setFitAttempt] = useState(0);
  const finishSectionRef = useRef<HTMLDivElement>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishInFlightRef = useRef(false);
  const signatureInFlightRef = useRef(false);
  const workerButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const pendingFocusWorkerIdRef = useRef<string | null>(null);

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
  const workerCopy = getWorkerReviewCopy(workerLanguage);
  const isWorkerView = view.kind === "member" || view.kind === "add";
  const canCollectSignatures =
    fitState === "ready" &&
    fitRevision === aha.documentRevision &&
    fitIssues.length === 0;
  const affectedWorkerIds = new Set(
    aha.pendingSigningUpdate?.affectedWorkers.map(({ workerId }) => workerId) ??
      [],
  );
  const headerTitle =
    view.kind === "member"
      ? (signingMember?.name ?? "Crew member")
      : view.kind === "add"
        ? addName.trim() || workerCopy.addWorkerTitle
        : view.kind === "review"
          ? "Today's AHA"
          : `${job.name} — ${formatEditorDate(aha.date)}`;

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
    let cancelled = false;
    setFitState("checking");
    setFitRevision(null);
    setFitIssues([]);
    void runAhaPdfFitPreflight(aha, job)
      .then((fit) => {
        if (cancelled) return;
        setFitIssues(fit.issues);
        setFitRevision(fit.documentRevision);
        setFitState("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setFitRevision(null);
        setFitState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [aha.documentRevision, aha.id, fitAttempt, job]);

  useEffect(() => {
    if (view.kind === "member" && !signingMember) {
      setView({ kind: "list" });
      setHasInk(false);
      setWorkerLanguage("en");
    }
  }, [signingMember, view.kind]);

  useEffect(() => {
    if (view.kind !== "list" || !pendingFocusWorkerIdRef.current) return;
    const workerId = pendingFocusWorkerIdRef.current;
    pendingFocusWorkerIdRef.current = null;
    requestAnimationFrame(() =>
      workerButtonRefs.current.get(workerId)?.focus(),
    );
  }, [view.kind]);

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

  const resetSigningDraft = () => {
    setHasInk(false);
    setOperationError(null);
    setWorkerError(null);
  };

  const openMember = (workerId: string) => {
    if (!canCollectSignatures) return;
    resetSigningDraft();
    setWorkerLanguage("en");
    setView({ kind: "member", workerId });
  };

  const openAddWorker = () => {
    if (!canCollectSignatures) return;
    if (aha.crew.length >= MAX_CREW_MEMBERS) {
      setLimitMessage(true);
      return;
    }
    resetSigningDraft();
    setLimitMessage(false);
    setAddName("");
    setWorkerLanguage("en");
    setAddWorkerId(createLocalId());
    setView({ kind: "add" });
  };

  const openReadOnlyReview = () => setView({ kind: "review" });

  const confirmSignature = async (signaturePng: string) => {
    if (isCommitting || signatureInFlightRef.current) return;
    if (view.kind === "add" && !addName.trim()) return;
    if (view.kind === "add" && aha.crew.length >= MAX_CREW_MEMBERS) {
      setLimitMessage(true);
      return;
    }
    if (view.kind !== "add" && view.kind !== "member") return;
    if (!canCollectSignatures) return;

    const signedWorkerId = view.kind === "add" ? addWorkerId : view.workerId;
    signatureInFlightRef.current = true;
    setIsCommitting(true);
    setOperationError(null);
    setWorkerError(null);
    try {
      if (view.kind === "add") {
        try {
          const candidate = addSignedCrewMember(
            aha,
            { id: addWorkerId, name: addName },
            signaturePng,
            new Date(),
          );
          const candidateFit = await runAhaPdfFitPreflight(candidate, job);
          if (candidateFit.issues.length > 0) {
            setFitIssues(candidateFit.issues);
            setFitRevision(candidateFit.documentRevision);
            setFitState("ready");
            setWorkerError("save_signature");
            return;
          }
        } catch {
          setWorkerError("save_signature");
          return;
        }
      }
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
      if (!saved) {
        setWorkerError("save_signature");
        return;
      }

      pendingFocusWorkerIdRef.current = signedWorkerId;
      setHasInk(false);
      setAddName("");
      setView({ kind: "list" });
      showSavedNotice(canFinishAha(saved));
    } finally {
      signatureInFlightRef.current = false;
      setIsCommitting(false);
    }
  };

  const requestBackToList = () => {
    if (hasStagedEntry) setDiscardAsk(true);
    else {
      resetSigningDraft();
      setWorkerLanguage("en");
      setView({ kind: "list" });
    }
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
        fit = await runAhaPdfFitPreflight(aha, job);
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
      const analyzedRevision = fit.documentRevision;

      const result = await saveAhaAndGeneratePdf({
        commitAha,
        update: (current) => {
          if (current.documentRevision !== analyzedRevision) {
            throw new Error("The AHA changed after PDF preflight");
          }
          return completeAha(current, new Date());
        },
        job,
      });
      if (result.status === "save_failed") {
        setOperationError(
          "We couldn't finish today's AHA. Your AHA and signatures are still saved. Try again.",
        );
        return;
      }
      await navigateAfterPersistedPdfOperation(result, navigateSafely);
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
            onClick={
              view.kind === "list"
                ? requestExit
                : view.kind === "review"
                  ? () => setView({ kind: "list" })
                  : requestBackToList
            }
          >
            {view.kind === "list"
              ? "‹ Exit signing"
              : isWorkerView
                ? workerCopy.backToCrew
                : "‹ Back to crew list"}
          </button>
          <p className="min-w-0 flex-1 truncate text-center text-sm font-semibold text-muted-foreground sm:text-base">
            {headerTitle}
          </p>
          <p className="min-w-[92px] text-right text-sm font-bold sm:min-w-[120px] sm:text-base">
            {isWorkerView
              ? workerCopy.signedCount(signedCount, aha.crew.length)
              : `${signedCount} of ${aha.crew.length} signed`}
          </p>
        </div>
        <div className="bg-primary px-3 py-2.5 text-center text-xs font-bold leading-snug tracking-[0.07em] text-primary-foreground sm:px-4 sm:py-3 sm:text-[15px] sm:tracking-[0.08em]">
          {isWorkerView
            ? workerCopy.signingBanner
            : "SIGNING MODE — HAND THE DEVICE TO EACH CREW MEMBER"}
        </div>
        {!isOnline ? (
          <p className="bg-secondary px-4 py-2 text-center text-sm font-semibold text-secondary-foreground">
            {isWorkerView
              ? workerCopy.offline
              : "You're offline. Your AHA is saved on this iPad and you can keep working."}
          </p>
        ) : null}
      </header>

      <div className="mx-auto max-w-[748px] px-5 py-5 sm:px-6 sm:py-6">
        {view.kind === "list" ? (
          <div className="flex flex-col gap-4">
            <header>
              <h1 className="text-[28px] font-bold">Sign today's AHA</h1>
              <p className="mt-1 text-base font-medium text-muted-foreground sm:text-[17px]">
                Select each worker to review today's AHA and sign.
              </p>
            </header>

            {savedNotice ? (
              <div
                className="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-center text-base font-bold text-success"
                role="status"
              >
                <p>✓ Signature saved</p>
                {savedNotice === "ready" ? (
                  <p className="mt-1 text-sm">
                    All signatures are in — finish today's AHA below.
                  </p>
                ) : null}
              </div>
            ) : null}

            <Button
              type="button"
              variant="outline"
              className="min-h-14 w-full border-[#C6CDE8] text-[17px] text-primary"
              disabled={isCommitting}
              onClick={openReadOnlyReview}
            >
              View today's AHA
            </Button>

            {fitState === "checking" ? (
              <p
                className="rounded-xl border border-[#C6CDE8] bg-secondary px-4 py-3 text-center text-base font-semibold text-secondary-foreground"
                role="status"
              >
                Checking the official sheet before signing…
              </p>
            ) : fitState === "error" ? (
              <div
                className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-base font-semibold text-warning-foreground"
                role="alert"
              >
                <p>
                  We couldn&apos;t check the official PDF. No additional
                  signatures can be collected until the check succeeds.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3 min-h-12 text-base text-primary"
                  onClick={() => setFitAttempt((current) => current + 1)}
                >
                  Try fit check again
                </Button>
              </div>
            ) : fitIssues.length > 0 ? (
              <div
                className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-4 text-warning-foreground"
                role="alert"
              >
                <p className="font-bold">
                  The official PDF must fit before anyone else signs.
                </p>
                <ul className="mt-3 space-y-3">
                  {fitIssues.map((issue) => (
                    <li
                      key={`${issue.fieldPath}-${issue.code}`}
                      className="rounded-lg bg-card/70 p-3 text-sm font-semibold"
                    >
                      <p>{describePdfFitIssue(issue, aha)}</p>
                      <Button
                        variant="outline"
                        className="mt-2 min-h-12 text-base text-primary"
                        onClick={() =>
                          void navigateSafely(
                            pdfFitIssueEditorPath(aha.id, issue),
                          )
                        }
                      >
                        Fix {issue.label.toLowerCase()}
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {aha.pendingSigningUpdate ? (
              <section className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-4">
                <p className="text-base font-bold text-warning-foreground">
                  Signed workers need to review the latest updates
                </p>
                <p className="mt-1 text-sm font-medium text-muted-foreground">
                  Ask the affected workers to choose Review updates and sign
                  again, or have{" "}
                  {aha.header.personInCharge || "the Person in charge"} confirm
                  the changes were reviewed with today&apos;s crew. The app
                  records the configured name and time, not who physically
                  tapped this button.
                </p>
                <ul className="mt-2 text-sm font-semibold">
                  {aha.pendingSigningUpdate.affectedWorkers.map(
                    ({ workerId, name }) => (
                      <li key={workerId}>{name}</li>
                    ),
                  )}
                </ul>
                <Button
                  type="button"
                  variant={
                    aha.pendingSigningUpdate.crewReviewConfirmation
                      ? "secondary"
                      : "outline"
                  }
                  className="mt-3 min-h-14 w-full whitespace-normal text-base font-bold"
                  disabled={
                    isCommitting ||
                    aha.safetyCheck !== "yes" ||
                    Boolean(aha.pendingSigningUpdate.crewReviewConfirmation)
                  }
                  onClick={() =>
                    void commitAha((current) =>
                      confirmSigningCrewReview(current, new Date()),
                    )
                  }
                >
                  {aha.pendingSigningUpdate.crewReviewConfirmation
                    ? "✓ Reviewed with today's crew"
                    : CREW_REVIEW_CONFIRMATION}
                </Button>
              </section>
            ) : null}

            <div className="flex flex-col gap-2.5 pt-1">
              {aha.crew.map((member) => {
                const signed = Boolean(member.signaturePng && member.signedAt);
                return (
                  <button
                    key={member.workerId}
                    ref={(node) => {
                      if (node)
                        workerButtonRefs.current.set(member.workerId, node);
                      else workerButtonRefs.current.delete(member.workerId);
                    }}
                    type="button"
                    className={`flex min-h-16 w-full items-center gap-3.5 rounded-xl bg-card px-5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      signed
                        ? "border border-card-border"
                        : "border-[1.5px] border-[#C6CDE8]"
                    }`}
                    disabled={isCommitting || !canCollectSignatures}
                    onClick={() =>
                      signed && affectedWorkerIds.has(member.workerId)
                        ? openMember(member.workerId)
                        : signed
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
                    {signed && affectedWorkerIds.has(member.workerId) ? (
                      <span className="shrink-0 text-sm font-semibold text-warning-foreground">
                        Review updates ›
                      </span>
                    ) : signed && member.signedAt ? (
                      <span className="shrink-0 text-base font-semibold text-success">
                        Signed {formatTime(member.signedAt)} ✓
                      </span>
                    ) : (
                      <span className="shrink-0 text-base font-semibold text-primary">
                        Review &amp; sign ›
                      </span>
                    )}
                  </button>
                );
              })}
              <Button
                type="button"
                variant="outline"
                className="min-h-14 w-full border-[1.5px] border-dashed border-[#C6CDE8] text-[17px] font-bold text-primary"
                disabled={isCommitting || !canCollectSignatures}
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
            <div ref={finishSectionRef} className="flex flex-col gap-2.5 pt-2">
              <Button
                className="min-h-[72px] w-full rounded-[14px] text-xl font-bold tracking-wide"
                disabled={!finishReady || isCommitting || !canCollectSignatures}
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
          <WorkerReviewAndSign
            aha={aha}
            job={job}
            signerName={
              view.kind === "add" ? addName : (signingMember?.name ?? "")
            }
            isForeman={
              view.kind === "member" && view.workerId === foremanWorkerId
            }
            nameInput={
              view.kind === "add"
                ? {
                    value: addName,
                    onChange: setAddName,
                  }
                : undefined
            }
            disabled={isCommitting || !canCollectSignatures}
            confirmDisabled={
              !canCollectSignatures || (view.kind === "add" && !addName.trim())
            }
            confirmLabel={
              isCommitting ? workerCopy.saving : workerCopy.confirmSignature
            }
            language={workerLanguage}
            onLanguageChange={setWorkerLanguage}
            feedback={
              workerError || limitMessage ? (
                <div className="flex flex-col gap-3">
                  {limitMessage ? (
                    <p
                      className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-base font-semibold text-warning-foreground"
                      role="alert"
                    >
                      {workerCopy.errors.capacity}
                    </p>
                  ) : null}
                  {workerError ? (
                    <p
                      className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-base font-semibold text-warning-foreground"
                      role="alert"
                    >
                      {workerCopy.errors[workerError]}
                    </p>
                  ) : null}
                </div>
              ) : null
            }
            onInkChange={setHasInk}
            onConfirm={confirmSignature}
          />
        ) : null}

        {view.kind === "review" ? (
          <div className="flex flex-col gap-4">
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
              {view.kind === "add"
                ? workerCopy.discardAddedTitle
                : workerCopy.discardSignatureTitle}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base font-medium">
              {view.kind === "add"
                ? workerCopy.discardAddedBody
                : workerCopy.discardSignatureBody}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="min-h-12 text-base">
              {workerCopy.cancel}
            </AlertDialogCancel>
            <AlertDialogAction
              className="min-h-12 bg-foreground px-6 text-base text-background"
              onClick={() => {
                resetSigningDraft();
                setAddName("");
                setWorkerLanguage("en");
                setView({ kind: "list" });
              }}
            >
              {workerCopy.discard}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
