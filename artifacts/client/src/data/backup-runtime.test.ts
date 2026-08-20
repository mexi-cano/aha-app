import assert from "node:assert/strict";
import test from "node:test";

import { calculateRetryDelay, classifyBackupFailure } from "./backup-runtime";
import { ensureLaterTimestamp } from "./database";

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
