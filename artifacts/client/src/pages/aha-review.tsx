import { useEffect, useMemo, useState } from "react";
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

export default function AhaReview() {
  const { aha, job, updateAha, commitAha, navigateSafely } = useAhaEditor();
  const [searchParams] = useSearchParams();
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const report = useMemo(() => getReviewReport(aha), [aha]);
  const focusCrew = searchParams.get("focus") === "crew";

  useEffect(() => {
    if (aha.status === "completed") void navigateSafely("/");
  }, [aha.status, navigateSafely]);

  const fixIssue = (issue: ReviewIssue) => {
    void navigateSafely(reviewTargetPath(aha.id, issue.target));
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
    void navigateSafely(`/ahas/${aha.id}/${section}`);
  };

  return (
    <EditorShell>
      <div className="flex flex-col gap-[18px]">
        <header>
          <h1 className="text-[28px] font-bold">Review</h1>
          <p className="mt-1 text-base font-medium text-muted-foreground sm:text-[17px]">
            Read the full AHA before anyone signs
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
            <CrewEditor
              aha={aha}
              job={job}
              updateAha={updateAha}
              commitAha={commitAha}
              focusCrew={focusCrew}
              disabled={isStarting}
            />
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
          <Button
            className="min-h-[72px] w-full rounded-[14px] text-xl font-bold tracking-wide"
            disabled={!report.canStartSigning || isStarting}
            onClick={() => void startSigning()}
          >
            {isStarting
              ? "STARTING…"
              : aha.status === "in_progress"
                ? "CONTINUE SIGNING"
                : "START SIGNING"}
          </Button>
          {report.canStartSigning ? (
            <p className="text-center text-[15px] font-medium text-muted-foreground">
              Next: 5 Sign — the whole crew signs on this device
            </p>
          ) : null}
        </div>
      </div>
    </EditorShell>
  );
}
