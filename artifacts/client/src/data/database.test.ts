import assert from "node:assert/strict";
import test from "node:test";

import {
  backupQueueKey,
  convertLegacyPdfQueueItem,
  type AhaPdfRecord,
  type BackupQueueItem,
} from "./database";

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
  assert.equal(convertLegacyPdfQueueItem(queued, undefined), null);
});
