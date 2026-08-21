import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalizePdfTimestamp,
  comparePdfVersionIdentity,
  isSamePdfVersionIdentity,
  pdfVersionIdentityKey,
} from "../src/pdf-version";

test("PDF version timestamps canonicalize database and RFC 3339 aliases", () => {
  const expected = "2026-08-21T14:22:00.000Z";
  for (const value of [
    expected,
    "2026-08-21 14:22:00+00",
    "2026-08-21T10:22:00-04:00",
  ]) {
    assert.equal(canonicalizePdfTimestamp(value), expected);
    assert.equal(
      pdfVersionIdentityKey("aha-1", 45, value),
      pdfVersionIdentityKey("aha-1", 45, expected),
    );
  }
});

test("PDF version timestamp validation rejects invalid identities", () => {
  assert.throws(() => canonicalizePdfTimestamp("not-a-date"));
  assert.throws(() => canonicalizePdfTimestamp("08/21/2026 14:22:00"));
  assert.throws(() => canonicalizePdfTimestamp("2026-02-30T14:22:00Z"));
  assert.throws(() => pdfVersionIdentityKey("", 1, new Date().toISOString()));
  assert.throws(() =>
    pdfVersionIdentityKey("aha-1", -1, new Date().toISOString()),
  );
});

test("PDF version comparison uses revision before canonical generation time", () => {
  const earlier = { sourceRevision: 4, generatedAt: "2026-08-21 14:22:00+00" };
  const alias = { sourceRevision: 4, generatedAt: "2026-08-21T14:22:00.000Z" };
  const later = { sourceRevision: 4, generatedAt: "2026-08-21T14:23:00.000Z" };
  const nextRevision = {
    sourceRevision: 5,
    generatedAt: "2026-08-21T14:00:00.000Z",
  };

  assert.equal(isSamePdfVersionIdentity(earlier, alias), true);
  assert.ok(comparePdfVersionIdentity(later, earlier) > 0);
  assert.ok(comparePdfVersionIdentity(nextRevision, later) > 0);
});
