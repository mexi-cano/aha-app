import assert from "node:assert/strict";
import test from "node:test";

import type { AhaPdfRevisionRecord } from "./database";
import type { RemotePdfVersionMetadata } from "./pdf-backup-metadata";
import {
  isStorageQuotaError,
  planPdfRevisionReconciliation,
} from "./pdf-version-repository";

test("PDF history caching recognizes browser and Dexie-wrapped quota failures", () => {
  assert.equal(isStorageQuotaError({ name: "QuotaExceededError" }), true);
  assert.equal(
    isStorageQuotaError({
      name: "DexieError",
      inner: { name: "QuotaExceededError" },
    }),
    true,
  );
  assert.equal(isStorageQuotaError(new Error("another failure")), false);
});

const checksum = "ab".repeat(32);
const canonicalGeneratedAt = "2026-08-21T14:22:00.000Z";
const remote: RemotePdfVersionMetadata = {
  ahaId: "aha-1",
  filename: "AHA.pdf",
  sourceRevision: 45,
  generatedAt: canonicalGeneratedAt,
  byteLength: 4,
  sha256: checksum,
  backedUpAt: "2026-08-21T14:22:01.000Z",
  supersededAt: "2026-08-21T14:23:00.000Z",
  isCurrent: false,
};

function localAlias(overrides: Partial<AhaPdfRevisionRecord> = {}) {
  return {
    key: "legacy-key",
    ahaId: "aha-1",
    filename: "AHA.pdf",
    bytes: new Uint8Array([1, 2, 3, 4]).buffer,
    generatedAt: "2026-08-21 14:22:00+00",
    sourceRevision: 45,
    byteLength: 4,
    sha256: null,
    backedUpAt: null,
    supersededAt: canonicalGeneratedAt,
    ...overrides,
  } satisfies AhaPdfRevisionRecord;
}

test("PDF history reconciliation collapses timestamp aliases and preserves cached bytes", async () => {
  const local = localAlias();
  const plan = await planPdfRevisionReconciliation(
    [local],
    [remote],
    async () => checksum,
  );

  assert.deepEqual(plan.conflictKeys, []);
  assert.deepEqual(plan.deleteKeys, [local.key]);
  assert.equal(plan.puts.length, 1);
  assert.equal(plan.puts[0]?.generatedAt, canonicalGeneratedAt);
  assert.equal(plan.puts[0]?.bytes, local.bytes);
  assert.equal(plan.puts[0]?.sha256, checksum);
});

test("PDF history reconciliation preserves checksum conflicts", async () => {
  const local = localAlias({ sha256: "cd".repeat(32) });
  const plan = await planPdfRevisionReconciliation(
    [local],
    [remote],
    async () => "cd".repeat(32),
  );

  assert.equal(plan.puts.length, 0);
  assert.equal(plan.deleteKeys.length, 0);
  assert.equal(plan.conflictKeys.length, 1);
});

test("PDF history reconciliation retains distinct generation times", async () => {
  const local = localAlias({
    key: "different-version",
    generatedAt: "2026-08-21T14:22:01.000Z",
  });
  const plan = await planPdfRevisionReconciliation(
    [local],
    [remote],
    async () => checksum,
  );

  assert.equal(plan.deleteKeys.length, 0);
  assert.equal(plan.puts[0]?.bytes, null);
});
