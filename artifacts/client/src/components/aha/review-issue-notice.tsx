import { TriangleAlert } from "lucide-react";
import type { ReviewIssue } from "@workspace/aha-domain";

import { Button } from "@/components/ui/button";
import type { ReviewIssueGroup } from "@/features/aha-editor/review-presentation";

function fixLabel(issue: ReviewIssue): string {
  if (issue.code === "safety_check") return "Answer";
  if (issue.code === "task_controls") return "Add controls";
  if (issue.tier === "warning") return "Add";
  return "Fix";
}

function issueKey(issue: ReviewIssue): string {
  return `${issue.tier}-${issue.code}-${
    issue.target.section === "task" ? issue.target.taskId : ""
  }`;
}

export function ReviewIssueGroupNotice({
  group,
  onFix,
  onNotApplicable,
  disabled = false,
}: {
  group: ReviewIssueGroup;
  onFix: (issue: ReviewIssue) => void;
  onNotApplicable?: (issue: Extract<ReviewIssue, { tier: "warning" }>) => void;
  disabled?: boolean;
}) {
  const mustFix = group.tier === "must_fix";

  return (
    <section
      className={`overflow-hidden rounded-[10px] border-[1.5px] text-warning-foreground ${
        mustFix
          ? "border-[#E3C27A] bg-[#FBF1DF]"
          : "border-[#E8D7AE] bg-[#FFF9EE]"
      }`}
      aria-label={mustFix ? "Must fix" : "Warning"}
    >
      <header className="flex items-start gap-2.5 px-4 py-3">
        <TriangleAlert
          className="mt-0.5 size-5 shrink-0"
          strokeWidth={2.5}
          aria-hidden="true"
        />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-xs font-extrabold tracking-[0.08em]">
            {mustFix ? "MUST FIX" : "WARNING"}
          </span>
          <span className="text-sm font-semibold">
            {mustFix ? "Required before signing" : "Does not block signing"}
          </span>
        </div>
      </header>
      <div className="border-t border-[#E8D7AE] px-4">
        {group.issues.map((issue) => (
          <div
            key={issueKey(issue)}
            className="flex flex-col gap-3 border-t border-[#E8D7AE] py-3 first:border-t-0 sm:flex-row sm:items-center"
          >
            <p className="min-w-0 flex-1 text-base font-semibold leading-6">
              {issue.message}
            </p>
            <div className="flex flex-wrap gap-2 sm:shrink-0 sm:justify-end">
              <Button
                type="button"
                className="min-h-12 bg-warning-foreground px-[18px] text-[15px] text-white hover:bg-warning-foreground/90"
                disabled={disabled}
                onClick={() => onFix(issue)}
              >
                {fixLabel(issue)}
              </Button>
              {issue.tier === "warning" && onNotApplicable ? (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-12 border-[#E3C27A] bg-transparent px-[18px] text-[15px] text-warning-foreground hover:bg-white/60"
                  disabled={disabled}
                  onClick={() => onNotApplicable(issue)}
                >
                  Not applicable
                </Button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
