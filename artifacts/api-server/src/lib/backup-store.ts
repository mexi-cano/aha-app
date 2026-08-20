import { and, asc, eq, gt, lte, or } from "drizzle-orm";
import {
  ahaSchema,
  jobSchema,
  parseStoredAha,
  parseStoredJob,
  type Aha,
  type Job,
} from "@workspace/aha-domain";

export interface JobBackupRecord {
  job: Job;
  clientUpdatedAt: string;
  backedUpAt: string;
}

export interface BackupWriteResult<T> {
  accepted: boolean;
  record: T;
}

export interface AhaPage {
  items: Aha[];
  nextCursor: string | null;
}

export interface PdfBackupInput {
  ahaId: string;
  filename: string;
  sourceRevision: number;
  generatedAt: string;
  bytes: Buffer;
  sha256: string;
}

export interface PdfBackupRecord extends PdfBackupInput {
  backedUpAt: string;
}

export interface BackupStore {
  listJobs(): Promise<JobBackupRecord[]>;
  putJob(
    job: Job,
    clientUpdatedAt: string,
  ): Promise<BackupWriteResult<JobBackupRecord>>;
  listAhas(cursor: string | null, limit: number): Promise<AhaPage>;
  putAha(aha: Aha): Promise<BackupWriteResult<Aha>>;
  getPdf(ahaId: string): Promise<PdfBackupRecord | null>;
  putPdf(input: PdfBackupInput): Promise<BackupWriteResult<PdfBackupRecord>>;
}

interface RestoreCursor {
  clientUpdatedAt: string;
  id: string;
}

function encodeCursor(cursor: RestoreCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export function decodeCursor(value: string): RestoreCursor {
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<RestoreCursor>;
    if (
      typeof parsed.clientUpdatedAt !== "string" ||
      Number.isNaN(Date.parse(parsed.clientUpdatedAt)) ||
      typeof parsed.id !== "string" ||
      !parsed.id
    ) {
      throw new Error("Invalid cursor payload");
    }
    return { clientUpdatedAt: parsed.clientUpdatedAt, id: parsed.id };
  } catch (cause) {
    throw new Error("The restore cursor is invalid.", { cause });
  }
}

function asPdfRecord(row: {
  ahaId: string;
  filename: string;
  sourceRevision: number;
  generatedAt: string;
  bytes: Buffer;
  sha256: string;
  backedUpAt: string;
}): PdfBackupRecord {
  return {
    ahaId: row.ahaId,
    filename: row.filename,
    sourceRevision: row.sourceRevision,
    generatedAt: row.generatedAt,
    bytes: row.bytes,
    sha256: row.sha256,
    backedUpAt: row.backedUpAt,
  };
}

export function createNeonBackupStore(): BackupStore {
  return {
    async listJobs() {
      const { db, jobsTable } = await import("@workspace/db");
      const rows = await db.select().from(jobsTable).orderBy(asc(jobsTable.id));
      return rows.map((row) => ({
        job: parseStoredJob(row.payload),
        clientUpdatedAt: row.clientUpdatedAt,
        backedUpAt: row.backedUpAt,
      }));
    },

    async putJob(job, clientUpdatedAt) {
      const parsedJob = jobSchema.parse(job);
      const { db, jobsTable } = await import("@workspace/db");
      const acceptedAt = new Date().toISOString();
      const rows = await db
        .insert(jobsTable)
        .values({
          id: parsedJob.id,
          payload: parsedJob,
          clientUpdatedAt,
          backedUpAt: acceptedAt,
        })
        .onConflictDoUpdate({
          target: jobsTable.id,
          set: {
            payload: parsedJob,
            clientUpdatedAt,
            backedUpAt: acceptedAt,
          },
          setWhere: lte(jobsTable.clientUpdatedAt, clientUpdatedAt),
        })
        .returning();
      const accepted = rows.length > 0;
      const row =
        rows[0] ??
        (
          await db
            .select()
            .from(jobsTable)
            .where(eq(jobsTable.id, parsedJob.id))
            .limit(1)
        )[0]!;
      return {
        accepted,
        record: {
          job: parseStoredJob(row.payload),
          clientUpdatedAt: row.clientUpdatedAt,
          backedUpAt: row.backedUpAt,
        },
      };
    },

    async listAhas(cursorValue, limit) {
      const { db, ahasTable } = await import("@workspace/db");
      const cursor = cursorValue ? decodeCursor(cursorValue) : null;
      const rows = await db
        .select()
        .from(ahasTable)
        .where(
          cursor
            ? or(
                gt(ahasTable.clientUpdatedAt, cursor.clientUpdatedAt),
                and(
                  eq(ahasTable.clientUpdatedAt, cursor.clientUpdatedAt),
                  gt(ahasTable.id, cursor.id),
                ),
              )
            : undefined,
        )
        .orderBy(asc(ahasTable.clientUpdatedAt), asc(ahasTable.id))
        .limit(limit + 1);
      const pageRows = rows.slice(0, limit);
      const last = pageRows.at(-1);
      return {
        items: pageRows.map((row) => parseStoredAha(row.payload)),
        nextCursor:
          rows.length > limit && last
            ? encodeCursor({
                clientUpdatedAt: last.clientUpdatedAt,
                id: last.id,
              })
            : null,
      };
    },

    async putAha(aha) {
      const parsedAha = ahaSchema.parse(aha);
      const { db, ahasTable } = await import("@workspace/db");
      const acceptedAt = new Date().toISOString();
      const acceptedRecord = ahaSchema.parse({
        ...parsedAha,
        sync: { ...parsedAha.sync, backedUpAt: acceptedAt },
      });
      const rows = await db
        .insert(ahasTable)
        .values({
          id: acceptedRecord.id,
          jobId: acceptedRecord.jobId,
          ahaDate: acceptedRecord.date,
          payload: acceptedRecord,
          clientUpdatedAt: acceptedRecord.sync.savedLocallyAt,
          backedUpAt: acceptedAt,
        })
        .onConflictDoUpdate({
          target: ahasTable.id,
          set: {
            jobId: acceptedRecord.jobId,
            ahaDate: acceptedRecord.date,
            payload: acceptedRecord,
            clientUpdatedAt: acceptedRecord.sync.savedLocallyAt,
            backedUpAt: acceptedAt,
          },
          setWhere: lte(
            ahasTable.clientUpdatedAt,
            acceptedRecord.sync.savedLocallyAt,
          ),
        })
        .returning();
      const accepted = rows.length > 0;
      const row =
        rows[0] ??
        (
          await db
            .select()
            .from(ahasTable)
            .where(eq(ahasTable.id, acceptedRecord.id))
            .limit(1)
        )[0]!;
      return { accepted, record: parseStoredAha(row.payload) };
    },

    async getPdf(ahaId) {
      const { db, ahaPdfsTable } = await import("@workspace/db");
      const row = (
        await db
          .select()
          .from(ahaPdfsTable)
          .where(eq(ahaPdfsTable.ahaId, ahaId))
          .limit(1)
      )[0];
      return row ? asPdfRecord(row) : null;
    },

    async putPdf(input) {
      const { db, ahaPdfsTable } = await import("@workspace/db");
      const acceptedAt = new Date().toISOString();
      const rows = await db
        .insert(ahaPdfsTable)
        .values({
          ahaId: input.ahaId,
          filename: input.filename,
          sourceRevision: input.sourceRevision,
          generatedAt: input.generatedAt,
          bytes: input.bytes,
          byteLength: input.bytes.byteLength,
          sha256: input.sha256,
          backedUpAt: acceptedAt,
        })
        .onConflictDoUpdate({
          target: ahaPdfsTable.ahaId,
          set: {
            filename: input.filename,
            sourceRevision: input.sourceRevision,
            generatedAt: input.generatedAt,
            bytes: input.bytes,
            byteLength: input.bytes.byteLength,
            sha256: input.sha256,
            backedUpAt: acceptedAt,
          },
          setWhere: lte(ahaPdfsTable.generatedAt, input.generatedAt),
        })
        .returning();
      const accepted = rows.length > 0;
      const row =
        rows[0] ??
        (
          await db
            .select()
            .from(ahaPdfsTable)
            .where(eq(ahaPdfsTable.ahaId, input.ahaId))
            .limit(1)
        )[0]!;
      return { accepted, record: asPdfRecord(row) };
    },
  };
}
