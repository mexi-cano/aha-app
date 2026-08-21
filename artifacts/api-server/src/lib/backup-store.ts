import { and, asc, eq, gt, lte, or } from "drizzle-orm";
import {
  ahaSchema,
  canonicalizePdfTimestamp,
  comparePdfVersionIdentity,
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

export interface PdfVersionMetadata {
  ahaId: string;
  filename: string;
  sourceRevision: number;
  generatedAt: string;
  byteLength: number;
  sha256: string;
  backedUpAt: string;
  supersededAt: string | null;
  isCurrent: boolean;
}

export interface PdfBackupWriteResult {
  accepted: boolean;
  isCurrent: boolean;
  record: PdfBackupRecord;
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
  listPdfVersions(ahaId: string): Promise<PdfVersionMetadata[]>;
  getPdfVersion(
    ahaId: string,
    sourceRevision: number,
    generatedAt: string,
  ): Promise<PdfBackupRecord | null>;
  putPdf(input: PdfBackupInput): Promise<PdfBackupWriteResult>;
}

interface RestoreCursor {
  clientUpdatedAt: string;
  id: string;
}

const BACKUP_CONSTRAINT_CODES = new Set(["23503", "23505"]);

export class BackupConstraintError extends Error {
  readonly name = "BackupConstraintError";

  constructor(cause: unknown) {
    super("The backup conflicts with an existing record.", { cause });
  }
}

function readPostgresErrorCode(error: unknown): string | null {
  let current = error;
  const seen = new Set<unknown>();
  for (let depth = 0; depth < 4; depth += 1) {
    if (!current || typeof current !== "object" || seen.has(current)) break;
    seen.add(current);
    const candidate = current as { code?: unknown; cause?: unknown };
    if (typeof candidate.code === "string") return candidate.code;
    current = candidate.cause;
  }
  return null;
}

export function translateBackupStoreError(error: unknown): unknown {
  const code = readPostgresErrorCode(error);
  return code && BACKUP_CONSTRAINT_CODES.has(code)
    ? new BackupConstraintError(error)
    : error;
}

function encodeCursor(cursor: RestoreCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export class InvalidCursorError extends Error {
  readonly name = "InvalidCursorError";

  constructor(cause?: unknown) {
    super("The restore cursor is invalid.", { cause });
  }
}

export function decodeCursor(value: string): RestoreCursor {
  let parsed: Partial<RestoreCursor>;
  try {
    parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<RestoreCursor>;
  } catch (cause) {
    throw new InvalidCursorError(cause);
  }
  if (
    typeof parsed.clientUpdatedAt !== "string" ||
    Number.isNaN(Date.parse(parsed.clientUpdatedAt)) ||
    typeof parsed.id !== "string" ||
    !parsed.id
  ) {
    throw new InvalidCursorError();
  }
  return { clientUpdatedAt: parsed.clientUpdatedAt, id: parsed.id };
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
    generatedAt: canonicalizePdfTimestamp(row.generatedAt),
    bytes: row.bytes,
    sha256: row.sha256,
    backedUpAt: canonicalizePdfTimestamp(row.backedUpAt),
  };
}

function asPdfVersionMetadata(
  row: {
    ahaId: string;
    filename: string;
    sourceRevision: number;
    generatedAt: string;
    byteLength: number;
    sha256: string;
    backedUpAt: string;
    supersededAt?: string | null;
  },
  isCurrent: boolean,
): PdfVersionMetadata {
  return {
    ahaId: row.ahaId,
    filename: row.filename,
    sourceRevision: row.sourceRevision,
    generatedAt: canonicalizePdfTimestamp(row.generatedAt),
    byteLength: row.byteLength,
    sha256: row.sha256,
    backedUpAt: canonicalizePdfTimestamp(row.backedUpAt),
    supersededAt: row.supersededAt
      ? canonicalizePdfTimestamp(row.supersededAt)
      : null,
    isCurrent,
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
      let rows;
      try {
        rows = await db
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
      } catch (error) {
        throw translateBackupStoreError(error);
      }
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

    async listPdfVersions(ahaId) {
      const { db, ahaPdfRevisionsTable, ahaPdfsTable } =
        await import("@workspace/db");
      const [currentRows, revisionRows] = await Promise.all([
        db
          .select()
          .from(ahaPdfsTable)
          .where(eq(ahaPdfsTable.ahaId, ahaId))
          .limit(1),
        db
          .select()
          .from(ahaPdfRevisionsTable)
          .where(eq(ahaPdfRevisionsTable.ahaId, ahaId)),
      ]);
      return [
        ...currentRows.map((row) => asPdfVersionMetadata(row, true)),
        ...revisionRows.map((row) => asPdfVersionMetadata(row, false)),
      ].sort((left, right) => comparePdfVersionIdentity(right, left));
    },

    async getPdfVersion(ahaId, sourceRevision, generatedAt) {
      const { db, ahaPdfRevisionsTable, ahaPdfsTable } =
        await import("@workspace/db");
      const canonicalGeneratedAt = canonicalizePdfTimestamp(generatedAt);
      const current = (
        await db
          .select()
          .from(ahaPdfsTable)
          .where(
            and(
              eq(ahaPdfsTable.ahaId, ahaId),
              eq(ahaPdfsTable.sourceRevision, sourceRevision),
              eq(ahaPdfsTable.generatedAt, canonicalGeneratedAt),
            ),
          )
          .limit(1)
      )[0];
      if (current) return asPdfRecord(current);
      const revision = (
        await db
          .select()
          .from(ahaPdfRevisionsTable)
          .where(
            and(
              eq(ahaPdfRevisionsTable.ahaId, ahaId),
              eq(ahaPdfRevisionsTable.sourceRevision, sourceRevision),
              eq(ahaPdfRevisionsTable.generatedAt, canonicalGeneratedAt),
            ),
          )
          .limit(1)
      )[0];
      return revision ? asPdfRecord(revision) : null;
    },

    async putPdf(input) {
      const { sql: neonSql } = await import("@workspace/db");
      const acceptedAt = new Date().toISOString();
      const generatedAt = canonicalizePdfTimestamp(input.generatedAt);
      try {
        const outcomeRows = await neonSql`
          select store_aha_pdf_version(
            ${input.ahaId}, ${input.filename}, ${input.sourceRevision},
            ${generatedAt}, ${input.bytes}, ${input.bytes.byteLength},
            ${input.sha256}, ${acceptedAt}
          ) as "isCurrent"
        `;
        const outcome = outcomeRows[0] as { isCurrent: boolean } | undefined;
        if (!outcome) {
          throw new BackupConstraintError({ code: "pdf-version-conflict" });
        }
        return {
          accepted: true,
          isCurrent: outcome.isCurrent,
          record: {
            ...input,
            generatedAt,
            backedUpAt: acceptedAt,
          },
        };
      } catch (error) {
        if (error instanceof BackupConstraintError) throw error;
        throw translateBackupStoreError(error);
      }
    },
  };
}
