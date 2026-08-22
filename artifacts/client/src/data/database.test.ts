import assert from "node:assert/strict";
import test from "node:test";

import {
  ahaDatabase,
  backupQueueKey,
  convertLegacyPdfQueueItem,
  type AhaPdfRecord,
  type BackupQueueItem,
} from "./database";
import { jobSetupDraftKey } from "./job-setup-draft-repository";

test("job setup drafts use isolated create and edit targets", () => {
  assert.equal(ahaDatabase.verno, 5);
  assert.equal(jobSetupDraftKey(), "new");
  assert.equal(jobSetupDraftKey(null), "new");
  assert.equal(jobSetupDraftKey("job-1"), "job:job-1");
});

test("Dexie v4 conversion preserves a v3 current PDF as a revision-specific queue item", () => {
  const queued: BackupQueueItem = {
    key: "pdf:aha-1",
    kind: "pdf",
    entityId: "aha-1",
    clientUpdatedAt: "2026-08-20T12:00:00.000Z",
    attempts: 2,
    nextAttemptAt: "2026-08-20T12:05:00.000Z",
    lastFailure: "retryable",
    lastStatus: 503,
    failureCode: "service_failure",
    failedAt: "2026-08-20T12:01:00.000Z",
  };
  const current: AhaPdfRecord = {
    ahaId: "aha-1",
    filename: "AHA_Test.pdf",
    bytes: new ArrayBuffer(8),
    generatedAt: "2026-08-20T12:00:00.000Z",
    sourceRevision: 4,
  };
  const converted = convertLegacyPdfQueueItem(queued, current);

  assert.equal(
    converted?.key,
    backupQueueKey("pdf", "aha-1", {
      sourceRevision: 4,
      generatedAt: current.generatedAt,
    }),
  );
  assert.equal(converted?.sourceRevision, 4);
  assert.equal(converted?.generatedAt, current.generatedAt);
  assert.equal(converted?.nextAttemptAt, queued.nextAttemptAt);
  assert.equal(converted?.attempts, queued.attempts);
  assert.equal(converted?.lastFailure, queued.lastFailure);
  assert.equal(converted?.lastStatus, queued.lastStatus);
  assert.equal(converted?.failureCode, queued.failureCode);
  assert.equal(converted?.failedAt, queued.failedAt);
  assert.equal(convertLegacyPdfQueueItem(queued, undefined), null);
});
