import assert from "node:assert/strict";
import test from "node:test";
import { createBlankAha, jobSchema, type Aha } from "@workspace/aha-domain";

import type { AhaPdfState } from "@/data/aha-repository";

import {
  applyEditorMutationRules,
  shouldShowPrefillBanner,
} from "./completed-update-grouping";

const job = jobSchema.parse({
  id: "job-1",
  name: "Test job",
  cityLabel: "Raleigh, NC",
  defaults: {
    location: "Site",
    personInCharge: "Lead",
    closestEmergencyCentre: "Hospital",
    emergencyNumber: "911",
    musterPoint: "Gate",
    workOrderPermit: "",
    jhaProcedureNumbers: "",
  },
  roster: [
    { id: "lead", name: "Lead" },
    { id: "worker", name: "Worker" },
  ],
});

const blank = createBlankAha(job, "2026-08-19", {
  createId: () => "aha-1",
  now: () => new Date("2026-08-19T12:00:00.000Z"),
});

const completed: Aha = {
  ...blank,
  status: "completed",
  completedAt: "2026-08-19T12:05:00.000Z",
  crew: blank.crew.map((member) => ({
    ...member,
    signaturePng: "data:image/png;base64,signature",
    signedAt: "2026-08-19T12:04:00.000Z",
  })),
};

const storedPdf: AhaPdfState = {
  status: "current",
  record: {
    ahaId: completed.id,
    filename: "AHA_Test_2026-08-19.pdf",
    bytes: new ArrayBuffer(1),
    generatedAt: "2026-08-19T12:06:00.000Z",
    sourceRevision: completed.documentRevision,
  },
};

test("prefill reset is available only during initial editing", () => {
  assert.equal(shouldShowPrefillBanner("initial"), true);
  assert.equal(shouldShowPrefillBanner("completed_update"), false);
});

test("completed PDF-visible edits share one timestamp until a new PDF is stored", () => {
  const firstTime = new Date("2026-08-19T12:10:00.000Z");
  const first = applyEditorMutationRules(
    completed,
    { ...completed, description: "First edit" },
    "completed_update",
    storedPdf,
    firstTime,
  );
  assert.deepEqual(first.updatedAfterCompletionAt, [firstTime.toISOString()]);
  assert.equal(first.documentRevision, completed.documentRevision + 1);

  const second = applyEditorMutationRules(
    first,
    { ...first, meetingNotes: "Second edit" },
    "completed_update",
    storedPdf,
    new Date("2026-08-19T12:11:00.000Z"),
  );
  assert.deepEqual(second.updatedAfterCompletionAt, [firstTime.toISOString()]);
  assert.equal(second.documentRevision, first.documentRevision + 1);
});

test("a new edit after failed PDF generation starts a new pending update", () => {
  const first = applyEditorMutationRules(
    completed,
    { ...completed, description: "First saved update" },
    "completed_update",
    storedPdf,
    new Date("2026-08-19T12:10:00.000Z"),
  );
  const failedGenerationCheckpoint: Aha = {
    ...first,
    pendingCompletedUpdate: null,
  };
  const next = applyEditorMutationRules(
    failedGenerationCheckpoint,
    { ...failedGenerationCheckpoint, meetingNotes: "Fit correction" },
    "completed_update",
    storedPdf,
    new Date("2026-08-19T12:15:00.000Z"),
  );

  assert.equal(next.pendingCompletedUpdate?.kind, "safety");
  assert.equal(
    next.pendingCompletedUpdate?.baselineDocumentRevision,
    storedPdf.record.sourceRevision,
  );
  assert.deepEqual(next.updatedAfterCompletionAt, [
    "2026-08-19T12:10:00.000Z",
    "2026-08-19T12:15:00.000Z",
  ]);
});

test("a failed-save retry derives the completed update timestamp again", () => {
  const firstAttempt = applyEditorMutationRules(
    completed,
    { ...completed, description: "Retry this edit" },
    "completed_update",
    storedPdf,
    new Date("2026-08-19T12:10:00.000Z"),
  );
  assert.equal(firstAttempt.updatedAfterCompletionAt.length, 1);

  const retriedFromSavedAha = applyEditorMutationRules(
    completed,
    { ...completed, description: "Retry this edit" },
    "completed_update",
    storedPdf,
    new Date("2026-08-19T12:12:00.000Z"),
  );
  assert.deepEqual(retriedFromSavedAha.updatedAfterCompletionAt, [
    "2026-08-19T12:12:00.000Z",
  ]);
});

test("late signatures and association-only edits do not add update timestamps", () => {
  const lateSignature = applyEditorMutationRules(
    completed,
    {
      ...completed,
      crew: completed.crew.map((member, index) =>
        index === 1
          ? {
              ...member,
              signaturePng: "data:image/png;base64,new-signature",
              signedAt: "2026-08-19T12:15:00.000Z",
            }
          : member,
      ),
    },
    "completed_update",
    storedPdf,
    new Date("2026-08-19T12:15:00.000Z"),
  );
  assert.deepEqual(lateSignature.updatedAfterCompletionAt, []);

  const associationOnly = applyEditorMutationRules(
    completed,
    { ...completed, personInChargeWorkerId: "worker" },
    "completed_update",
    storedPdf,
    new Date("2026-08-19T12:16:00.000Z"),
  );
  assert.equal(associationOnly.documentRevision, completed.documentRevision);
  assert.deepEqual(associationOnly.updatedAfterCompletionAt, []);
});
