import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import {
  beginSigning,
  CREW_REVIEW_CONFIRMATION,
  confirmSigningCrewReview,
  confirmCompletedCrewReview,
  finalizeCompletedUpdate,
  getReviewReport,
  resolvePersonInChargeWorkerId,
  type ReviewIssue,
} from "@workspace/aha-domain";

import { AhaSummary } from "@/components/aha/aha-summary";
import { ForemanBadge } from "@/components/aha/foreman-badge";
import { CrewEditor } from "@/components/aha/crew-editor";
import { EditorShell } from "@/components/aha/editor-shell";
import { Button } from "@/components/ui/button";
import { useAhaEditor } from "@/features/aha-editor/editor-context";
import { reviewTargetPath } from "@/features/aha-editor/editor-navigation";
import {
  describePdfFitIssue,
  pdfFitIssueEditorPath,
} from "@/features/aha-editor/pdf-fit-navigation";
import { runAhaPdfFitPreflight } from "@/features/aha-editor/pdf-fit-preflight";
import { saveAhaAndGeneratePdf, type PdfFitIssue } from "@/pdf";

export default function AhaReview() {
  const {
    aha,
    job,
    updateAha,
    commitAha,
    navigateSafely,
    editorMode,
    editorBasePath,
    flushSaves,
  } = useAhaEditor();
  const [searchParams] = useSearchParams();
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [fitIssues, setFitIssues] = useState<PdfFitIssue[]>([]);
  const [fitState, setFitState] = useState<
    "idle" | "checking" | "ready" | "error"
  >(editorMode === "initial" ? "checking" : "idle");
  const [fitRevision, setFitRevision] = useState<number | null>(null);
  const [fitAttempt, setFitAttempt] = useState(0);
  const report = useMemo(() => getReviewReport(aha), [aha]);
  const focusCrew = searchParams.get("focus") === "crew";
  const foremanWorkerId = resolvePersonInChargeWorkerId(aha);
  const pendingSafetyUpdate =
    editorMode === "completed_update" &&
    aha.pendingCompletedUpdate?.kind === "safety"
      ? aha.pendingCompletedUpdate
      : null;
  const crewReviewConfirmed = Boolean(
    pendingSafetyUpdate?.crewReviewConfirmation,
  );
  const hasPendingCompletedUpdate = Boolean(aha.pendingCompletedUpdate);
  const pendingSigningUpdate =
    editorMode === "initial" ? aha.pendingSigningUpdate : null;
  const signingCrewReviewConfirmed = Boolean(
    pendingSigningUpdate?.crewReviewConfirmation,
  );

  useEffect(() => {
    if (editorMode !== "initial") return;
    let cancelled = false;
    setFitState("checking");
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
        setFitState("error");
        setFitRevision(null);
      });
    return () => {
      cancelled = true;
    };
  }, [aha.documentRevision, aha.id, editorMode, fitAttempt, job]);

  const fixIssue = (issue: ReviewIssue) => {
    const initialPath = reviewTargetPath(aha.id, issue.target);
    void navigateSafely(
      editorMode === "completed_update"
        ? initialPath.replace(`/ahas/${aha.id}`, editorBasePath)
        : initialPath,
    );
  };

  const markNotApplicable = (
    issue: Extract<ReviewIssue, { tier: "warning" }>,
  ) => {
    const field =
      issue.code === "work_order_permit"
        ? "workOrderPermit"
        : issue.code === "jha_procedures"
          ? "jhaProcedureNumbers"
          : issue.code === "meeting_notes"
            ? "meetingNotes"
            : null;
    if (!field) return;
    updateAha((current) => ({
      ...current,
      notApplicable: { ...current.notApplicable, [field]: true },
    }));
  };

  const startSigning = async () => {
    if (!report.canStartSigning || isStarting) return;
    if (editorMode === "completed_update" && !hasPendingCompletedUpdate) {
      setStartError("Make a saved change before creating a replacement PDF.");
      return;
    }
    setIsStarting(true);
    setStartError(null);
    setFitIssues([]);
    if (editorMode === "completed_update") {
      try {
        const finalizedAt = new Date();
        const result = await saveAhaAndGeneratePdf({
          commitAha,
          update: (current) => finalizeCompletedUpdate(current, finalizedAt),
          job,
        });
        if (result.status === "save_failed") {
          setStartError(
            "We couldn't save these updates. The last saved PDF is unchanged. Try again.",
          );
        } else if (result.status === "fit_failed") {
          setFitIssues(result.issues);
        } else {
          await navigateSafely(`/ahas/${result.savedAha.id}/completed`);
        }
      } finally {
        setIsStarting(false);
      }
      return;
    }
    if (!(await flushSaves())) {
      setIsStarting(false);
      setStartError("We couldn't confirm the latest saved AHA. Try again.");
      return;
    }
    let preflight;
    try {
      preflight = await runAhaPdfFitPreflight(aha, job);
    } catch {
      setFitState("error");
      setIsStarting(false);
      setStartError(
        "We couldn't check the official PDF. Your AHA is still saved. Try again.",
      );
      return;
    }
    setFitIssues(preflight.issues);
    setFitRevision(preflight.documentRevision);
    setFitState("ready");
    if (preflight.issues.length > 0) {
      setIsStarting(false);
      return;
    }
    const analyzedRevision = preflight.documentRevision;
    const saved = await commitAha((current) => {
      if (current.documentRevision !== analyzedRevision) {
        throw new Error("The AHA changed after PDF preflight");
      }
      return beginSigning(current);
    });
    setIsStarting(false);
    if (saved) {
      await navigateSafely(`/ahas/${aha.id}/sign`);
    } else {
      setStartError(
        "We couldn't start signing. Your AHA is still saved. Try again.",
      );
    }
  };

  const editSection = (section: "details" | "work" | "energy") => {
    void navigateSafely(`${editorBasePath}/${section}`);
  };

  return (
    <EditorShell>
      <div className="flex flex-col gap-[18px]">
        <header>
          <h1 className="text-[28px] font-bold">Review</h1>
          <p className="mt-1 text-base font-medium text-muted-foreground sm:text-[17px]">
            {editorMode === "completed_update"
              ? "Confirm the updates before replacing the saved PDF"
              : "Read the full AHA before anyone signs"}
          </p>
        </header>

        <AhaSummary
          aha={aha}
          job={job}
          mode="review"
          report={report}
          onEdit={editSection}
          onFix={fixIssue}
          onNotApplicable={markNotApplicable}
          disabled={isStarting}
          crewContent={
            editorMode === "completed_update" ? (
              <div className="flex flex-col gap-2">
                <p className="text-[13px] font-bold tracking-[0.1em] text-muted-foreground">
                  SAVED CREW — SIGNATURES REMAIN SAVED
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {aha.crew.map((member) => (
                    <p
                      key={member.workerId}
                      className="flex min-h-10 items-center gap-2 text-base font-medium"
                    >
                      {member.name}
                      {member.workerId === foremanWorkerId ? (
                        <ForemanBadge />
                      ) : null}
                      {member.signaturePng ? (
                        <span className="font-bold text-success">✓</span>
                      ) : null}
                    </p>
                  ))}
                </div>
              </div>
            ) : (
              <CrewEditor
                aha={aha}
                job={job}
                updateAha={updateAha}
                commitAha={commitAha}
                focusCrew={focusCrew}
                disabled={isStarting}
              />
            )
          }
        />

        <div className="flex flex-col gap-2.5 pt-1">
          {report.mustFix.length > 0 ? (
            <p className="text-center text-base font-semibold text-warning-foreground">
              {report.mustFix.length}{" "}
              {report.mustFix.length === 1 ? "item needs" : "items need"}{" "}
              attention before signing
            </p>
          ) : report.warnings.length > 0 ? (
            <p className="text-center text-base font-medium text-warning-foreground">
              {report.warnings.length}{" "}
              {report.warnings.length === 1
                ? "warning remains"
                : "warnings remain"}
              ; signing can still start
            </p>
          ) : null}
          {startError ? (
            <div
              className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-base font-semibold text-warning-foreground"
              role="alert"
            >
              {startError}
            </div>
          ) : null}
          {fitIssues.length > 0 ? (
            <div
              className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-warning-foreground"
              role="alert"
            >
              <p className="font-bold">
                {editorMode === "initial"
                  ? "The official PDF needs shorter content before signing:"
                  : "The official PDF needs shorter content before it can be regenerated:"}
              </p>
              <ul className="mt-3 space-y-3 text-sm font-semibold">
                {fitIssues.map((issue) => (
                  <li
                    key={`${issue.fieldPath}-${issue.code}`}
                    className="rounded-lg bg-card/70 p-3"
                  >
                    <p>{describePdfFitIssue(issue, aha)}</p>
                    <Button
                      variant="outline"
                      className="mt-2 min-h-12 text-base text-primary"
                      onClick={() => {
                        const initialPath = pdfFitIssueEditorPath(
                          aha.id,
                          issue,
                        );
                        void navigateSafely(
                          editorMode === "completed_update"
                            ? initialPath.replace(
                                `/ahas/${aha.id}`,
                                editorBasePath,
                              )
                            : initialPath,
                        );
                      }}
                    >
                      Fix {issue.label.toLowerCase()}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {editorMode === "initial" && fitState === "checking" ? (
            <p
              className="text-center text-sm font-semibold text-muted-foreground"
              role="status"
            >
              Checking the official sheet…
            </p>
          ) : null}
          {editorMode === "initial" && fitState === "error" ? (
            <div
              className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-base font-semibold text-warning-foreground"
              role="alert"
            >
              <p>
                We couldn&apos;t check the official PDF. Your AHA is still
                saved.
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
          ) : null}
          {pendingSigningUpdate ? (
            <section className="rounded-2xl border border-warning/30 bg-warning/10 p-5 text-left">
              <p className="text-sm font-bold tracking-[0.08em] text-warning-foreground">
                SIGNED CONTENT WAS UPDATED
              </p>
              <p className="mt-2 text-base font-semibold">
                {pendingSigningUpdate.affectedWorkers.length} signed{" "}
                {pendingSigningUpdate.affectedWorkers.length === 1
                  ? "worker needs"
                  : "workers need"}{" "}
                to review the latest changes again.
              </p>
              <p className="mt-2 text-sm font-medium text-muted-foreground">
                They may sign again individually. If their existing signatures
                remain, {aha.header.personInCharge || "the Person in charge"}{" "}
                should confirm the update was reviewed with today&apos;s crew.
                The app records the configured name and time, not who physically
                tapped this button.
              </p>
              <Button
                type="button"
                variant={signingCrewReviewConfirmed ? "secondary" : "outline"}
                className="mt-4 min-h-14 w-full whitespace-normal px-4 text-base font-bold"
                disabled={
                  isStarting ||
                  aha.safetyCheck !== "yes" ||
                  signingCrewReviewConfirmed
                }
                onClick={() =>
                  updateAha((current) =>
                    confirmSigningCrewReview(current, new Date()),
                  )
                }
              >
                {signingCrewReviewConfirmed
                  ? "✓ Reviewed with today's crew"
                  : CREW_REVIEW_CONFIRMATION}
              </Button>
            </section>
          ) : null}
          {pendingSafetyUpdate ? (
            <section className="rounded-2xl border border-[#C6CDE8] bg-card p-5 text-left shadow-sm">
              <p className="text-sm font-bold tracking-[0.08em] text-muted-foreground">
                PERSON IN CHARGE CONFIRMATION
              </p>
              <p className="mt-2 text-base font-semibold">
                {aha.header.personInCharge || "The Person in charge"} should
                confirm the updated safety information was reviewed with today's
                crew.
              </p>
              <Button
                type="button"
                variant={crewReviewConfirmed ? "secondary" : "outline"}
                className="mt-4 min-h-14 w-full whitespace-normal px-4 text-base font-bold"
                disabled={
                  isStarting || aha.safetyCheck !== "yes" || crewReviewConfirmed
                }
                onClick={() =>
                  updateAha((current) =>
                    confirmCompletedCrewReview(current, new Date()),
                  )
                }
              >
                {crewReviewConfirmed
                  ? "✓ Reviewed with today's crew"
                  : CREW_REVIEW_CONFIRMATION}
              </Button>
              {aha.safetyCheck !== "yes" ? (
                <p className="mt-2 text-sm font-semibold text-warning-foreground">
                  Answer the Energy Wheel safety check Yes first.
                </p>
              ) : null}
            </section>
          ) : null}
          {editorMode === "completed_update" && !hasPendingCompletedUpdate ? (
            <p className="text-center text-sm font-semibold text-muted-foreground">
              No correction is saved yet. Edit a section before creating a
              replacement PDF.
            </p>
          ) : null}
          <Button
            className="min-h-[72px] w-full rounded-[14px] text-xl font-bold tracking-wide"
            disabled={
              !report.canStartSigning ||
              isStarting ||
              (editorMode === "initial" &&
                (fitState !== "ready" ||
                  fitRevision !== aha.documentRevision ||
                  fitIssues.length > 0)) ||
              Boolean(pendingSafetyUpdate && !crewReviewConfirmed) ||
              (editorMode === "completed_update" && !hasPendingCompletedUpdate)
            }
            onClick={() => void startSigning()}
          >
            {isStarting
              ? editorMode === "completed_update"
                ? "CREATING PDF…"
                : "STARTING…"
              : editorMode === "completed_update"
                ? hasPendingCompletedUpdate
                  ? "REGENERATE PDF"
                  : "NO CHANGES TO SAVE"
                : aha.status === "in_progress"
                  ? "CONTINUE SIGNING"
                  : "START SIGNING"}
          </Button>
          {report.canStartSigning && editorMode === "initial" ? (
            <p className="text-center text-[15px] font-medium text-muted-foreground">
              Next: 5 Sign — the whole crew signs on this device
            </p>
          ) : null}
        </div>
      </div>
    </EditorShell>
  );
}
