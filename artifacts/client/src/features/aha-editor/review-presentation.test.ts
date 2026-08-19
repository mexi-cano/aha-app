import assert from "node:assert/strict";
import test from "node:test";
import type { ReviewIssue, ReviewReport } from "@workspace/aha-domain";

import { groupReviewIssues, taskNeedsDetails } from "./review-presentation";

const detailBlocker = {
  tier: "must_fix",
  code: "location",
  message: "Location is missing.",
  target: { section: "details", field: "location" },
} satisfies ReviewIssue;

const taskNameBlocker = {
  tier: "must_fix",
  code: "task_name",
  message: "Task description is missing.",
  target: { section: "task", taskId: "task-1", field: "task" },
} satisfies ReviewIssue;

const taskHazardsBlocker = {
  tier: "must_fix",
  code: "task_hazards",
  message: "Hazards are missing for this task.",
  target: { section: "task", taskId: "task-1", field: "hazards" },
} satisfies ReviewIssue;

const secondTaskBlocker = {
  tier: "must_fix",
  code: "task_controls",
  message: "Controls are missing for this task.",
  target: { section: "task", taskId: "task-2", field: "controls" },
} satisfies ReviewIssue;

const detailWarning = {
  tier: "warning",
  code: "work_order_permit",
  message: "No work order / permit number entered.",
  target: { section: "details", field: "workOrderPermit" },
} satisfies ReviewIssue;

const meetingWarning = {
  tier: "warning",
  code: "meeting_notes",
  message: "No on-site meeting notes entered.",
  target: { section: "work", field: "meetingNotes" },
} satisfies ReviewIssue;

test("Review presentation groups by logical subsection and tier without changing issues", () => {
  const issues: ReviewIssue[] = [
    detailBlocker,
    taskNameBlocker,
    taskHazardsBlocker,
    secondTaskBlocker,
    detailWarning,
    meetingWarning,
  ];
  const originalOrder = [...issues];

  const groups = groupReviewIssues(issues);

  assert.deepEqual(
    groups.map(({ key }) => key),
    [
      "details:must_fix",
      "task:task-1:must_fix",
      "task:task-2:must_fix",
      "details:warning",
      "work:warning",
    ],
  );
  assert.deepEqual(issues, originalOrder);
  assert.equal(groups[0]?.issues[0], detailBlocker);
  assert.deepEqual(groups[1]?.issues, [taskNameBlocker, taskHazardsBlocker]);
  assert.ok(
    groups.every(({ tier, issues: groupedIssues }) =>
      groupedIssues.every((issue) => issue.tier === tier),
    ),
  );
});

test("Review presentation never groups issues from different tasks", () => {
  const groups = groupReviewIssues([
    taskNameBlocker,
    secondTaskBlocker,
    taskHazardsBlocker,
  ]);

  assert.equal(groups.length, 2);
  assert.deepEqual(
    groups.map(({ issues }) =>
      issues.map((issue) =>
        issue.target.section === "task" ? issue.target.taskId : null,
      ),
    ),
    [["task-1", "task-1"], ["task-2"]],
  );
});

test("task readiness is derived only from typed Review blockers", () => {
  const report: ReviewReport = {
    mustFix: [taskNameBlocker, taskHazardsBlocker],
    warnings: [],
    information: [],
    canStartSigning: false,
  };

  assert.equal(taskNeedsDetails(report, "task-1"), true);
  assert.equal(taskNeedsDetails(report, "complete-task"), false);
  assert.equal(taskNeedsDetails({ mustFix: [] }, "task-1"), false);
});
