import type { ReviewIssue, ReviewReport } from "@workspace/aha-domain";

export interface ReviewIssueGroup {
  key: string;
  tier: ReviewIssue["tier"];
  issues: ReviewIssue[];
}

function logicalTargetKey(issue: ReviewIssue): string {
  return issue.target.section === "task"
    ? `task:${issue.target.taskId}`
    : issue.target.section;
}

export function groupReviewIssues(
  issues: readonly ReviewIssue[],
): ReviewIssueGroup[] {
  const groups: ReviewIssueGroup[] = [];
  const groupsByKey = new Map<string, ReviewIssueGroup>();

  for (const issue of issues) {
    const key = `${logicalTargetKey(issue)}:${issue.tier}`;
    const existing = groupsByKey.get(key);
    if (existing) {
      existing.issues.push(issue);
      continue;
    }

    const group: ReviewIssueGroup = {
      key,
      tier: issue.tier,
      issues: [issue],
    };
    groupsByKey.set(key, group);
    groups.push(group);
  }

  return groups;
}

export function taskNeedsDetails(
  report: Pick<ReviewReport, "mustFix">,
  taskId: string,
): boolean {
  return report.mustFix.some(
    ({ target }) => target.section === "task" && target.taskId === taskId,
  );
}
