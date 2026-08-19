import assert from "node:assert/strict";
import test from "node:test";

import { ahaSchema } from "@workspace/aha-domain";

import {
  deriveAhaPdfState,
  hasRecordedCompletedUpdateSincePdf,
} from "./aha-repository";

const aha = ahaSchema.parse({
  id: "aha-1",
  jobId: "job-1",
  date: "2026-08-19",
  status: "completed",
  header: {
    location: "Site",
    date: "2026-08-19",
    personInCharge: "Lead",
    closestEmergencyCentre: "Hospital",
    emergencyNumber: "911",
    musterPoint: "Gate",
    workOrderPermit: "",
    jhaProcedureNumbers: "",
    rescuePlanRequired: false,
  },
  description: "Work",
  meetingNotes: "",
  notApplicable: {
    workOrderPermit: true,
    jhaProcedureNumbers: true,
    meetingNotes: true,
  },
  tasks: [],
  energySelections: [],
  safetyCheck: "yes",
  crew: [],
  documentRevision: 3,
  completedAt: "2026-08-19T12:00:00.000Z",
  updatedAfterCompletionAt: [],
  sync: {
    savedLocallyAt: "2026-08-19T12:00:00.000Z",
    backedUpAt: null,
  },
});

const record = {
  ahaId: aha.id,
  filename: "AHA_Test_2026-08-19.pdf",
  bytes: new Uint8Array([1, 2, 3]).buffer,
  generatedAt: "2026-08-19T12:05:00.000Z",
  sourceRevision: 3,
};

test("PDF state distinguishes missing, current, stale, and unreadable artifacts", () => {
  assert.equal(deriveAhaPdfState(aha, undefined).status, "missing");
  assert.equal(deriveAhaPdfState(aha, record).status, "current");
  assert.equal(
    deriveAhaPdfState(aha, { ...record, sourceRevision: 2 }).status,
    "stale",
  );
  assert.equal(
    deriveAhaPdfState(aha, { ...record, bytes: new ArrayBuffer(0) }).status,
    "unreadable",
  );
});

test("completed update grouping survives reload without confusing late signatures", () => {
  const current = deriveAhaPdfState(aha, record);
  assert.equal(hasRecordedCompletedUpdateSincePdf(aha, current), false);

  const lateSignatureOnly = {
    ...aha,
    documentRevision: 4,
    updatedAfterCompletionAt: ["2026-08-19T12:01:00.000Z"],
  };
  const stale = deriveAhaPdfState(lateSignatureOnly, record);
  assert.equal(hasRecordedCompletedUpdateSincePdf(lateSignatureOnly, stale), false);

  const pendingContentUpdate = {
    ...lateSignatureOnly,
    updatedAfterCompletionAt: ["2026-08-19T12:06:00.000Z"],
  };
  assert.equal(
    hasRecordedCompletedUpdateSincePdf(pendingContentUpdate, stale),
    true,
  );
});
