import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";
import {
  migrationSqlHash,
  validateJournalEntries,
  verifyMigrationLedger,
} from "./migration-ledger.mjs";

const migrationsFolder = fileURLToPath(
  new URL("./migrations", import.meta.url),
);
const journalPath = fileURLToPath(
  new URL("./migrations/meta/_journal.json", import.meta.url),
);

async function readExpectedMigrations() {
  let journal;
  try {
    journal = JSON.parse(await readFile(journalPath, "utf8"));
  } catch (cause) {
    throw new Error("The checked-in migration journal is malformed.", {
      cause,
    });
  }
  const entries = validateJournalEntries(journal?.entries);

  const migrations = [];
  for (const entry of entries) {
    const sql = await readFile(
      new URL(`./migrations/${entry.tag}.sql`, import.meta.url),
      "utf8",
    );
    migrations.push({ ...entry, hash: migrationSqlHash(sql) });
  }

  return migrations;
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
      to_regclass('public.aha_pdfs')::text as aha_pdfs,
      to_regclass('public.aha_pdf_revisions')::text as aha_pdf_revisions
  `;
  if (
    !objects?.ledger ||
    !objects.jobs ||
    !objects.ahas ||
    !objects.aha_pdfs ||
    !objects.aha_pdf_revisions
  ) {
    throw new Error(
      "Migration verification failed: the ledger or required application tables are missing.",
    );
  }

  const ledgerRows = await client`
    select created_at, hash
    from drizzle.__drizzle_migrations
    order by created_at asc
  `;
  verifyMigrationLedger(expectedMigrations, ledgerRows);

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
