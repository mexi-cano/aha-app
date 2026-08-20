import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateRetryDelay,
  classifyBackupError,
  classifyBackupFailure,
  LocalBackupRecordError,
  selectNextBackupItem,
} from "./backup-runtime";
import {
  createBackupQueueItem,
  ensureLaterTimestamp,
  type BackupEntityKind,
  type BackupQueueItem,
} from "./database";

test("backup retry delay is exponential, jittered, and capped at five minutes", () => {
  assert.equal(calculateRetryDelay(0, 0.5), 1_000);
  assert.equal(calculateRetryDelay(1, 0.5), 2_000);
  assert.equal(calculateRetryDelay(2, 0), 2_000);
  assert.equal(calculateRetryDelay(2, 1), 6_000);
  assert.equal(calculateRetryDelay(20, 1), 300_000);
});

test("backup failures retain conflicts and retry only transient responses", () => {
  assert.equal(classifyBackupFailure(409), "rejected");
  assert.equal(classifyBackupFailure(400), "rejected");
  assert.equal(classifyBackupFailure(503), "retryable");
  assert.equal(classifyBackupFailure(429), "retryable");
  assert.equal(classifyBackupFailure(null), "retryable");
});

test("only typed unreadable local records are rejected without an HTTP status", () => {
  assert.deepEqual(
    classifyBackupError(
      new LocalBackupRecordError("job", new Error("invalid record")),
    ),
    { failure: "rejected", status: null },
  );
  assert.deepEqual(classifyBackupError(new TypeError("network unavailable")), {
    failure: "retryable",
    status: null,
  });
});

function queueItem(
  kind: BackupEntityKind,
  entityId: string,
  lastFailure: BackupQueueItem["lastFailure"] = null,
): BackupQueueItem {
  return {
    ...createBackupQueueItem(kind, entityId, "2026-08-20T12:00:00.000Z"),
    lastFailure,
  };
}

function resolveJobId(jobIds: Readonly<Record<string, string>>) {
  return async (ahaId: string): Promise<string | null> => jobIds[ahaId] ?? null;
}

test("rejected jobs block only their dependent AHAs and PDFs", async () => {
  const rejectedJob = queueItem("job", "job-a", "rejected");
  const independentJob = queueItem("job", "job-b");
  const dependentAha = queueItem("aha", "aha-a");
  const independentAha = queueItem("aha", "aha-b");
  const dependentPdf = queueItem("pdf", "aha-a");
  const independentPdf = queueItem("pdf", "aha-b");
  const jobIds = resolveJobId({ "aha-a": "job-a", "aha-b": "job-b" });

  assert.equal(
    (
      await selectNextBackupItem(
        [
          rejectedJob,
          independentJob,
          dependentAha,
          independentAha,
          dependentPdf,
          independentPdf,
        ],
        jobIds,
      )
    )?.key,
    independentJob.key,
  );
  assert.equal(
    (
      await selectNextBackupItem(
        [
          rejectedJob,
          dependentAha,
          independentAha,
          dependentPdf,
          independentPdf,
        ],
        jobIds,
      )
    )?.key,
    independentAha.key,
  );
  assert.equal(
    (
      await selectNextBackupItem(
        [rejectedJob, dependentAha, dependentPdf, independentPdf],
        jobIds,
      )
    )?.key,
    independentPdf.key,
  );
  assert.equal(
    await selectNextBackupItem(
      [rejectedJob, dependentAha, dependentPdf],
      jobIds,
    ),
    null,
  );
});

test("rejected AHAs block only their own PDFs", async () => {
  const rejectedAha = queueItem("aha", "aha-a", "rejected");
  const independentAha = queueItem("aha", "aha-b");
  const dependentPdf = queueItem("pdf", "aha-a");
  const independentPdf = queueItem("pdf", "aha-b");
  const jobIds = resolveJobId({ "aha-a": "job-a", "aha-b": "job-a" });

  assert.equal(
    (
      await selectNextBackupItem(
        [rejectedAha, independentAha, dependentPdf, independentPdf],
        jobIds,
      )
    )?.key,
    independentAha.key,
  );
  assert.equal(
    (
      await selectNextBackupItem(
        [rejectedAha, dependentPdf, independentPdf],
        jobIds,
      )
    )?.key,
    independentPdf.key,
  );
  assert.equal(
    await selectNextBackupItem([rejectedAha, dependentPdf], jobIds),
    null,
  );
});

test("a rejected PDF does not block independent PDFs and a coalesced write clears rejection", async () => {
  const rejectedPdf = queueItem("pdf", "aha-a", "rejected");
  const independentPdf = queueItem("pdf", "aha-b");
  const resolver = resolveJobId({});

  assert.equal(
    (
      await selectNextBackupItem([rejectedPdf, independentPdf], resolver)
    )?.key,
    independentPdf.key,
  );

  const replacement = createBackupQueueItem(
    "pdf",
    rejectedPdf.entityId,
    "2026-08-20T12:00:00.001Z",
  );
  assert.equal(
    (await selectNextBackupItem([replacement], resolver))?.key,
    replacement.key,
  );
});

test("client timestamps remain monotonic when two writes share a clock tick", () => {
  assert.equal(
    ensureLaterTimestamp(
      "2026-08-20T12:00:00.000Z",
      "2026-08-20T12:00:00.000Z",
    ),
    "2026-08-20T12:00:00.001Z",
  );
  assert.equal(
    ensureLaterTimestamp(
      "2026-08-20T12:00:00.002Z",
      "2026-08-20T12:00:00.001Z",
    ),
    "2026-08-20T12:00:00.002Z",
  );
  assert.equal(
    ensureLaterTimestamp("2026-08-20T12:00:00.003Z", "not-a-timestamp"),
    "2026-08-20T12:00:00.003Z",
  );
  assert.equal(
    ensureLaterTimestamp(
      "2026-08-20T12:00:00.001Z",
      "2026-08-20T12:00:00.002Z",
    ),
    "2026-08-20T12:00:00.003Z",
  );
});
