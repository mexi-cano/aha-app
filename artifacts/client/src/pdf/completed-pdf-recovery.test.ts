import assert from "node:assert/strict";
import test from "node:test";
import type { Aha } from "@workspace/aha-domain";

import {
  createCompletedPdfRecoveryState,
  navigateAfterPersistedPdfOperation,
  parseCompletedPdfRecoveryState,
  pdfFitIssueUpdatePath,
} from "./completed-pdf-recovery";

const descriptionIssue = {
  code: "field_overflow" as const,
  fieldPath: "description",
  label: "Description of work",
  message: "Shorten the description.",
};

test("completed PDF recovery state accepts only typed nonempty fit issues", () => {
  const state = createCompletedPdfRecoveryState([descriptionIssue]);
  assert.deepEqual(parseCompletedPdfRecoveryState(state), state);
  assert.equal(parseCompletedPdfRecoveryState(null), null);
  assert.equal(
    parseCompletedPdfRecoveryState({ kind: "pdf_fit_failed", issues: [] }),
    null,
  );
  assert.equal(
    parseCompletedPdfRecoveryState({
      kind: "pdf_fit_failed",
      issues: [{ ...descriptionIssue, code: "unknown" }],
    }),
    null,
  );
});

test("persisted fit failures navigate once to Completed with exact recovery state", async () => {
  const calls: Array<{ path: string; options: unknown }> = [];
  const savedAha = { id: "aha-1" } as Aha;
  const navigated = await navigateAfterPersistedPdfOperation(
    {
      status: "fit_failed",
      savedAha,
      issues: [descriptionIssue],
    },
    async (path, options) => {
      calls.push({ path, options });
      return true;
    },
  );

  assert.equal(navigated, true);
  assert.deepEqual(calls, [
    {
      path: "/ahas/aha-1/completed",
      options: {
        replace: true,
        state: createCompletedPdfRecoveryState([descriptionIssue]),
      },
    },
  ]);
});

test("stored and generation-failed operations replace the signer with Completed", async () => {
  for (const result of [
    {
      status: "stored" as const,
      savedAha: { id: "aha-stored" } as Aha,
      record: {} as never,
    },
    {
      status: "generation_failed" as const,
      savedAha: { id: "aha-failed" } as Aha,
      message: "PDF failed",
      cause: new Error("failed"),
    },
  ]) {
    const calls: Array<{ path: string; options: unknown }> = [];
    await navigateAfterPersistedPdfOperation(result, async (path, options) => {
      calls.push({ path, options });
      return true;
    });
    assert.deepEqual(calls, [
      {
        path: `/ahas/${result.savedAha.id}/completed`,
        options: { replace: true },
      },
    ]);
  }
});

test("fit issues route to their exact completed-update fields", () => {
  assert.equal(
    pdfFitIssueUpdatePath("aha-1", descriptionIssue),
    "/ahas/aha-1/update/details?focus=work-description",
  );
  assert.equal(
    pdfFitIssueUpdatePath("aha-1", {
      ...descriptionIssue,
      fieldPath: "header.personInCharge",
      label: "Person in charge",
    }),
    "/ahas/aha-1/update/details?focus=person-in-charge",
  );
  assert.equal(
    pdfFitIssueUpdatePath("aha-1", {
      ...descriptionIssue,
      fieldPath: "meetingNotes",
      label: "Meeting notes",
    }),
    "/ahas/aha-1/update/work?focus=meeting-notes",
  );
  assert.equal(
    pdfFitIssueUpdatePath("aha-1", {
      code: "task_row_overflow",
      fieldPath: "tasks",
      label: "Task grid",
      message: "Use at most 15 rows.",
    }),
    "/ahas/aha-1/update/work",
  );
  assert.equal(
    pdfFitIssueUpdatePath("aha-1", {
      ...descriptionIssue,
      fieldPath: "tasks.task-1.controls",
      label: "Controls",
      taskId: "task-1",
    }),
    "/ahas/aha-1/update/work?task=task-1&field=controls",
  );
  assert.equal(
    pdfFitIssueUpdatePath("aha-1", {
      ...descriptionIssue,
      fieldPath: "signatures.worker-1",
      label: "Signature",
    }),
    null,
  );
});
