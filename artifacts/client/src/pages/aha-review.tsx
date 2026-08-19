import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import {
  beginSigning,
  getReviewReport,
  type ReviewIssue,
} from "@workspace/aha-domain";

import { AhaSummary } from "@/components/aha/aha-summary";
import { CrewEditor } from "@/components/aha/crew-editor";
import { EditorShell } from "@/components/aha/editor-shell";
import { Button } from "@/components/ui/button";
import { useAhaEditor } from "@/features/aha-editor/editor-context";
import { reviewTargetPath } from "@/features/aha-editor/editor-navigation";
import { generateAndStoreAhaPdf, type PdfFitIssue } from "@/pdf";

export default function AhaReview() {
  const {
    aha,
    job,
    updateAha,
    commitAha,
    navigateSafely,
    editorMode,
    editorBasePath,
  } = useAhaEditor();
  const [searchParams] = useSearchParams();
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [fitIssues, setFitIssues] = useState<PdfFitIssue[]>([]);
  const report = useMemo(() => getReviewReport(aha), [aha]);
  const focusCrew = searchParams.get("focus") === "crew";

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
    const field = issue.target.field;
    updateAha((current) => ({
      ...current,
      notApplicable: { ...current.notApplicable, [field]: true },
    }));
  };

  const startSigning = async () => {
    if (!report.canStartSigning || isStarting) return;
    setIsStarting(true);
    setStartError(null);
    setFitIssues([]);
    if (editorMode === "completed_update") {
      const saved = await commitAha((current) => current);
      if (!saved) {
        setStartError(
          "We couldn't save these updates. The last saved PDF is unchanged. Try again.",
        );
      } else {
        const result = await generateAndStoreAhaPdf(saved, job);
        if (result.status === "stored") {
          await navigateSafely(`/ahas/${aha.id}/completed`);
        } else if (result.status === "fit_failed") {
          setFitIssues(result.issues);
        } else {
          await navigateSafely(`/ahas/${aha.id}/completed`);
        }
      }
      setIsStarting(false);
      return;
    }
    const saved = await commitAha((current) => beginSigning(current));
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
                      className="min-h-10 text-base font-medium"
                    >
                      {member.name}{" "}
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
                The updated PDF needs shorter content:
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
          <Button
            className="min-h-[72px] w-full rounded-[14px] text-xl font-bold tracking-wide"
            disabled={!report.canStartSigning || isStarting}
            onClick={() => void startSigning()}
          >
            {isStarting
              ? editorMode === "completed_update"
                ? "CREATING PDF…"
                : "STARTING…"
              : editorMode === "completed_update"
                ? "REGENERATE PDF"
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
