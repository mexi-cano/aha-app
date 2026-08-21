import assert from "node:assert/strict";
import test from "node:test";

import {
  InvalidRestoreProgressError,
  parseRestoreProgress,
  parseRemotePdfVersionMetadata,
  parseRestoredPdfMetadata,
} from "./restore";

const checksum = "ab".repeat(32);

function headers(overrides: Record<string, string> = {}): Headers {
  return new Headers({
    "X-AHA-Filename": "AHA_Test%20Job_2026-08-20.pdf",
    "X-AHA-Source-Revision": "4",
    "X-AHA-Generated-At": "2026-08-20T12:00:00.000Z",
    "X-Content-SHA256": checksum.toUpperCase(),
    ...overrides,
  });
}

test("restored PDF metadata accepts uppercase checksums and decodes filenames", () => {
  assert.deepEqual(parseRestoredPdfMetadata(headers(), checksum), {
    filename: "AHA_Test Job_2026-08-20.pdf",
    sourceRevision: 4,
    generatedAt: "2026-08-20T12:00:00.000Z",
  });
});

test("restored PDF metadata rejects malformed checksums and filenames", () => {
  assert.throws(
    () =>
      parseRestoredPdfMetadata(
        headers({ "X-Content-SHA256": "not-a-checksum" }),
        checksum,
      ),
    /checksum check/,
  );
  assert.throws(
    () =>
      parseRestoredPdfMetadata(
        headers({ "X-AHA-Filename": "invalid%filename.pdf" }),
        checksum,
      ),
    /invalid metadata/,
  );
});

test("restored PDF metadata rejects a well-formed mismatched checksum", () => {
  assert.throws(
    () =>
      parseRestoredPdfMetadata(
        headers({ "X-Content-SHA256": "cd".repeat(32) }),
        checksum,
      ),
    /checksum check/,
  );
});

test("remote PDF history metadata requires checksums and valid version identity", () => {
  const value = {
    ahaId: "aha-1",
    filename: "AHA_Test.pdf",
    sourceRevision: 3,
    generatedAt: "2026-08-20T12:00:00.000Z",
    byteLength: 1024,
    sha256: checksum,
    backedUpAt: "2026-08-20T12:00:01.000Z",
    supersededAt: "2026-08-20T13:00:00.000Z",
    isCurrent: false,
  };
  assert.deepEqual(parseRemotePdfVersionMetadata(value), value);
  assert.throws(
    () => parseRemotePdfVersionMetadata({ ...value, sha256: "bad" }),
    /history is invalid/,
  );
});

test("corrupt recovery progress maps invalid JSON, shapes, and jobs to a restartable error", () => {
  for (const value of [
    "not-json",
    JSON.stringify({ version: 1, stage: "jobs" }),
    JSON.stringify({
      version: 1,
      stage: "jobs",
      jobs: [{ id: "invalid-job" }],
      cursor: null,
      ahaIds: [],
      pdfIndex: 0,
    }),
  ]) {
    assert.throws(
      () => parseRestoreProgress(value),
      InvalidRestoreProgressError,
    );
  }
});
