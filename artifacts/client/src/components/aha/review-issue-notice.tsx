import { TriangleAlert } from "lucide-react";
import type { ReviewIssue } from "@workspace/aha-domain";

import { Button } from "@/components/ui/button";

function fixLabel(issue: ReviewIssue): string {
  if (issue.code === "safety_check") return "Answer";
  if (issue.code === "task_controls") return "Add controls";
  if (issue.tier === "warning") return "Add";
  return "Fix";
}

export function ReviewIssueNotice({
  issue,
  onFix,
  onNotApplicable,
  disabled = false,
}: {
  issue: ReviewIssue;
  onFix: (issue: ReviewIssue) => void;
  onNotApplicable?: (issue: Extract<ReviewIssue, { tier: "warning" }>) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-[10px] border-[1.5px] border-[#E3C27A] bg-[#FBF1DF] px-4 py-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-2.5 text-base font-semibold text-warning-foreground">
        <TriangleAlert
          className="mt-0.5 size-5 shrink-0"
          strokeWidth={2.5}
          aria-hidden="true"
        />
        <span className="flex flex-col gap-0.5">
          <span className="text-xs font-extrabold tracking-[0.08em]">
            {issue.tier === "must_fix" ? "MUST FIX" : "WARNING"}
          </span>
          <span>{issue.message}</span>
        </span>
      </div>
      <div className="flex flex-wrap gap-2 sm:justify-end">
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
  );
}
