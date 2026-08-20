import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

const migrationsFolder = fileURLToPath(
  new URL("./migrations", import.meta.url),
);
const journalPath = fileURLToPath(
  new URL("./migrations/meta/_journal.json", import.meta.url),
);

async function readExpectedMigrations() {
  const journal = JSON.parse(await readFile(journalPath, "utf8"));
  if (!Array.isArray(journal.entries) || journal.entries.length === 0) {
    throw new Error("The checked-in migration journal contains no entries.");
  }

  for (const entry of journal.entries) {
    if (
      !Number.isSafeInteger(entry.when) ||
      typeof entry.tag !== "string" ||
      !/^\d{4}_[a-z0-9_]+$/.test(entry.tag)
    ) {
      throw new Error("The checked-in migration journal is malformed.");
    }
    await readFile(new URL(`./migrations/${entry.tag}.sql`, import.meta.url));
  }

  return journal.entries;
}

async function applyAndVerifyMigrations() {
  const expectedMigrations = await readExpectedMigrations();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL must be set before running migrations.");
  }

  const client = neon(databaseUrl);
  const database = drizzle(client);

  await migrate(database, { migrationsFolder });

  const [objects] = await client`
    select
      to_regclass('drizzle.__drizzle_migrations')::text as ledger,
      to_regclass('public.jobs')::text as jobs,
      to_regclass('public.ahas')::text as ahas,
      to_regclass('public.aha_pdfs')::text as aha_pdfs
  `;
  if (!objects?.ledger || !objects.jobs || !objects.ahas || !objects.aha_pdfs) {
    throw new Error(
      "Migration verification failed: the ledger or required application tables are missing.",
    );
  }

  const ledgerRows = await client`
    select created_at
    from drizzle.__drizzle_migrations
    order by created_at asc
  `;
  const appliedTimestamps = new Set(
    ledgerRows.map((row) => Number(row.created_at)),
  );
  const missingMigrations = expectedMigrations.filter(
    (entry) => !appliedTimestamps.has(entry.when),
  );
  if (missingMigrations.length > 0) {
    throw new Error(
      `Migration verification failed: ${missingMigrations.length} checked-in migration(s) are absent from the database ledger.`,
    );
  }

  const latestExpected = Math.max(
    ...expectedMigrations.map((entry) => entry.when),
  );
  const latestApplied = Math.max(...appliedTimestamps);
  if (latestApplied > latestExpected) {
    throw new Error(
      "Migration verification failed: the database is newer than this checkout.",
    );
  }

  console.log(
    `Applied and verified ${expectedMigrations.length} checked-in migration(s).`,
  );
}

applyAndVerifyMigrations().catch((error) => {
  console.error(
    "Database migration failed:",
    error instanceof Error ? error.message : "unknown error",
  );
  process.exitCode = 1;
});
