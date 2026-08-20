import assert from "node:assert/strict";
import test from "node:test";

import {
  migrationSqlHash,
  validateJournalEntries,
  verifyMigrationLedger,
} from "./migration-ledger.mjs";

const first = {
  idx: 0,
  when: 1_700_000_000_000,
  tag: "0000_first_migration",
  breakpoints: true,
};
const second = {
  idx: 1,
  when: 1_700_000_000_001,
  tag: "0001_second_migration",
  breakpoints: true,
};
const expected = [
  { ...first, hash: migrationSqlHash("select 1;\n") },
  { ...second, hash: migrationSqlHash("select 2;\n") },
];
const exactLedger = expected.map((migration) => ({
  created_at: String(migration.when),
  hash: migration.hash,
}));

test("migration journal validation accepts ordered unique entries", () => {
  assert.deepEqual(validateJournalEntries([first, second]), [first, second]);
});

test("migration journal validation rejects malformed, duplicate, and unordered entries", () => {
  assert.throws(
    () => validateJournalEntries([{ ...first, tag: "../unsafe" }]),
    /malformed/,
  );
  assert.throws(
    () => validateJournalEntries([first, { ...second, when: first.when }]),
    /duplicate/,
  );
  assert.throws(
    () => validateJournalEntries([first, { ...second, tag: first.tag }]),
    /duplicate/,
  );
  assert.throws(
    () => validateJournalEntries([first, { ...second, when: first.when - 1 }]),
    /strictly ordered/,
  );
  assert.throws(
    () => validateJournalEntries([{ ...first, when: Number.MAX_VALUE }]),
    /malformed/,
  );
});

test("exact migration ledgers verify repeatedly without mutation", () => {
  verifyMigrationLedger(expected, exactLedger);
  verifyMigrationLedger(expected, exactLedger);
  assert.equal(exactLedger.length, 2);
});

test("migration ledger verification rejects empty and missing entries", () => {
  assert.throws(() => verifyMigrationLedger(expected, []), /absent/);
  assert.throws(
    () => verifyMigrationLedger(expected, exactLedger.slice(0, 1)),
    /absent/,
  );
});

test("migration ledger verification rejects duplicates and malformed rows", () => {
  assert.throws(
    () => verifyMigrationLedger(expected, [...exactLedger, exactLedger[0]]),
    /duplicate timestamps/,
  );
  assert.throws(
    () =>
      verifyMigrationLedger(expected, [
        { ...exactLedger[0], created_at: "1.5" },
        exactLedger[1],
      ]),
    /malformed timestamp/,
  );
  assert.throws(
    () =>
      verifyMigrationLedger(expected, [
        { ...exactLedger[0], hash: "not-a-hash" },
        exactLedger[1],
      ]),
    /malformed hash/,
  );
});

test("migration ledger verification rejects unexpected older and newer entries", () => {
  const unexpected = (createdAt) => ({
    created_at: String(createdAt),
    hash: migrationSqlHash("select 'unexpected';\n"),
  });
  assert.throws(
    () =>
      verifyMigrationLedger(expected, [
        unexpected(first.when - 1),
        ...exactLedger,
      ]),
    /unexpected migration/,
  );
  assert.throws(
    () =>
      verifyMigrationLedger(expected, [
        ...exactLedger,
        unexpected(second.when + 1),
      ]),
    /unexpected migration/,
  );
});

test("migration ledger verification rejects same-timestamp hash divergence", () => {
  assert.throws(
    () =>
      verifyMigrationLedger(expected, [
        {
          ...exactLedger[0],
          hash: migrationSqlHash("select 'changed';\n"),
        },
        exactLedger[1],
      ]),
    /hash differs/,
  );
});
