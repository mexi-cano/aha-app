import {
  customType,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer }>({
  dataType() {
    return "bytea";
  },
});

function backedUpAtColumn() {
  return timestamp("backed_up_at", {
    withTimezone: true,
    mode: "string",
  })
    .notNull()
    .defaultNow();
}

export const jobsTable = pgTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    payload: jsonb("payload").notNull(),
    clientUpdatedAt: timestamp("client_updated_at", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    backedUpAt: backedUpAtColumn(),
  },
  (table) => [index("jobs_client_updated_at_idx").on(table.clientUpdatedAt)],
);

export const ahasTable = pgTable(
  "ahas",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => jobsTable.id),
    ahaDate: date("aha_date", { mode: "string" }).notNull(),
    payload: jsonb("payload").notNull(),
    clientUpdatedAt: timestamp("client_updated_at", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    backedUpAt: backedUpAtColumn(),
  },
  (table) => [
    uniqueIndex("ahas_job_date_unique").on(table.jobId, table.ahaDate),
    index("ahas_restore_cursor_idx").on(table.clientUpdatedAt, table.id),
  ],
);

export const ahaPdfsTable = pgTable("aha_pdfs", {
  ahaId: text("aha_id")
    .primaryKey()
    .references(() => ahasTable.id),
  filename: text("filename").notNull(),
  sourceRevision: integer("source_revision").notNull(),
  generatedAt: timestamp("generated_at", {
    withTimezone: true,
    mode: "string",
  }).notNull(),
  bytes: bytea("bytes").notNull(),
  byteLength: integer("byte_length").notNull(),
  sha256: text("sha256").notNull(),
  backedUpAt: backedUpAtColumn(),
});

export type JobRow = typeof jobsTable.$inferSelect;
export type AhaRow = typeof ahasTable.$inferSelect;
export type AhaPdfRow = typeof ahaPdfsTable.$inferSelect;
