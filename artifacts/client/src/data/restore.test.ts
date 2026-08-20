import assert from "node:assert/strict";
import test from "node:test";

import { parseRestoredPdfMetadata } from "./restore";

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
