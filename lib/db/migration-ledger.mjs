import { createHash } from "node:crypto";

const MIGRATION_TAG_PATTERN = /^\d{4}_[a-z0-9_]+$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function fail(message) {
  throw new Error(`Migration verification failed: ${message}`);
}

export function migrationSqlHash(sql) {
  return createHash("sha256").update(sql).digest("hex");
}

export function validateJournalEntries(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("The checked-in migration journal contains no entries.");
  }

  const tags = new Set();
  const timestamps = new Set();
  let previousTimestamp = -1;

  return value.map((entry, index) => {
    if (
      !entry ||
      typeof entry !== "object" ||
      !Number.isSafeInteger(entry.idx) ||
      entry.idx !== index ||
      !Number.isSafeInteger(entry.when) ||
      entry.when < 0 ||
      typeof entry.tag !== "string" ||
      !MIGRATION_TAG_PATTERN.test(entry.tag) ||
      typeof entry.breakpoints !== "boolean"
    ) {
      throw new Error("The checked-in migration journal is malformed.");
    }
    if (tags.has(entry.tag) || timestamps.has(entry.when)) {
      throw new Error(
        "The checked-in migration journal contains duplicate entries.",
      );
    }
    if (entry.when <= previousTimestamp) {
      throw new Error(
        "The checked-in migration journal is not strictly ordered.",
      );
    }

    tags.add(entry.tag);
    timestamps.add(entry.when);
    previousTimestamp = entry.when;
    return {
      idx: entry.idx,
      when: entry.when,
      tag: entry.tag,
      breakpoints: entry.breakpoints,
    };
  });
}

function parseLedgerTimestamp(value) {
  let timestamp;
  if (typeof value === "bigint") {
    timestamp = Number(value);
  } else if (typeof value === "number") {
    timestamp = value;
  } else if (typeof value === "string" && /^\d+$/.test(value)) {
    timestamp = Number(value);
  } else {
    fail("the database ledger contains a malformed timestamp.");
  }

  if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
    fail("the database ledger contains a malformed timestamp.");
  }
  return timestamp;
}

export function verifyMigrationLedger(expectedMigrations, ledgerRows) {
  if (!Array.isArray(expectedMigrations) || expectedMigrations.length === 0) {
    fail("there are no checked-in migrations to verify.");
  }
  if (!Array.isArray(ledgerRows)) {
    fail("the database ledger could not be read.");
  }

  const expectedByTimestamp = new Map(
    expectedMigrations.map((migration) => [migration.when, migration]),
  );
  const appliedByTimestamp = new Map();

  for (const row of ledgerRows) {
    if (!row || typeof row !== "object") {
      fail("the database ledger contains a malformed record.");
    }
    const timestamp = parseLedgerTimestamp(row.created_at);
    if (typeof row.hash !== "string" || !SHA256_PATTERN.test(row.hash)) {
      fail("the database ledger contains a malformed hash.");
    }
    if (appliedByTimestamp.has(timestamp)) {
      fail("the database ledger contains duplicate timestamps.");
    }
    appliedByTimestamp.set(timestamp, row.hash);
  }

  for (const [timestamp, hash] of appliedByTimestamp) {
    const expected = expectedByTimestamp.get(timestamp);
    if (!expected) {
      fail("the database ledger contains an unexpected migration.");
    }
    if (hash !== expected.hash) {
      fail("a database migration hash differs from this checkout.");
    }
  }

  for (const timestamp of expectedByTimestamp.keys()) {
    if (!appliedByTimestamp.has(timestamp)) {
      fail("a checked-in migration is absent from the database ledger.");
    }
  }

  if (appliedByTimestamp.size !== expectedByTimestamp.size) {
    fail("the database ledger does not match the checked-in migrations.");
  }
}
