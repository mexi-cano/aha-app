import Dexie, { type EntityTable } from "dexie";
import type { Aha, Job } from "@workspace/aha-domain";

import type { DraftMetadata } from "./draft-metadata";

export interface AppSetting {
  key: string;
  value: string;
}

export interface AhaPdfRecord {
  ahaId: string;
  filename: string;
  bytes: ArrayBuffer;
  generatedAt: string;
  sourceRevision: number;
}

export interface AhaPdfRevisionRecord {
  key: string;
  ahaId: string;
  filename: string;
  bytes: ArrayBuffer | null;
  generatedAt: string;
  sourceRevision: number;
  byteLength: number;
  sha256: string | null;
  backedUpAt: string | null;
  supersededAt: string;
}

export type BackupEntityKind = "job" | "aha" | "pdf";

export type BackupFailureKind = "retryable" | "rejected" | null;

export interface BackupQueueItem {
  key: string;
  kind: BackupEntityKind;
  entityId: string;
  clientUpdatedAt: string;
  attempts: number;
  nextAttemptAt: string;
  lastFailure: BackupFailureKind;
  lastStatus: number | null;
  sourceRevision?: number;
  generatedAt?: string;
}

export interface PdfVersionIdentity {
  sourceRevision: number;
  generatedAt: string;
}

export function ahaPdfRevisionKey(
  ahaId: string,
  sourceRevision: number,
  generatedAt: string,
): string {
  return `${encodeURIComponent(ahaId)}:${sourceRevision}:${encodeURIComponent(generatedAt)}`;
}

export function backupQueueKey(
  kind: BackupEntityKind,
  entityId: string,
  pdfVersion?: PdfVersionIdentity,
): string {
  return kind === "pdf" && pdfVersion
    ? `${kind}:${ahaPdfRevisionKey(
        entityId,
        pdfVersion.sourceRevision,
        pdfVersion.generatedAt,
      )}`
    : `${kind}:${entityId}`;
}

export function createBackupQueueItem(
  kind: BackupEntityKind,
  entityId: string,
  clientUpdatedAt: string,
  nextAttemptAt = new Date().toISOString(),
  pdfVersion?: PdfVersionIdentity,
): BackupQueueItem {
  return {
    key: backupQueueKey(kind, entityId, pdfVersion),
    kind,
    entityId,
    clientUpdatedAt,
    attempts: 0,
    nextAttemptAt,
    lastFailure: null,
    lastStatus: null,
    ...(pdfVersion
      ? {
          sourceRevision: pdfVersion.sourceRevision,
          generatedAt: pdfVersion.generatedAt,
        }
      : {}),
  };
}

export function convertLegacyPdfQueueItem(
  queued: BackupQueueItem,
  current: AhaPdfRecord | undefined,
): BackupQueueItem | null {
  if (!current) return null;
  const converted = createBackupQueueItem(
    "pdf",
    current.ahaId,
    current.generatedAt,
    queued.nextAttemptAt,
    {
      sourceRevision: current.sourceRevision,
      generatedAt: current.generatedAt,
    },
  );
  return {
    ...converted,
    attempts: queued.attempts,
    lastFailure: queued.lastFailure,
    lastStatus: queued.lastStatus,
  };
}

export function ensureLaterTimestamp(
  candidate: string,
  previous: string | null | undefined,
): string {
  const previousTime = previous ? Date.parse(previous) : Number.NaN;
  if (Number.isNaN(previousTime)) return candidate;
  if (Date.parse(candidate) > previousTime) return candidate;
  return new Date(previousTime + 1).toISOString();
}

export const ACTIVE_JOB_SETTING = "activeJobId";
export const RESTORE_NEEDS_JOB_CHOICE_SETTING = "restoreNeedsJobChoice";
export const RESTORE_PROGRESS_SETTING = "restoreProgress";

class AhaDatabase extends Dexie {
  jobs!: EntityTable<Job, "id">;
  ahas!: EntityTable<Aha, "id">;
  settings!: EntityTable<AppSetting, "key">;
  draftMetadata!: EntityTable<DraftMetadata, "ahaId">;
  ahaPdfs!: EntityTable<AhaPdfRecord, "ahaId">;
  ahaPdfRevisions!: EntityTable<AhaPdfRevisionRecord, "key">;
  backupQueue!: EntityTable<BackupQueueItem, "key">;

  constructor() {
    super("its-aha");

    this.version(1).stores({
      jobs: "&id",
      ahas: "&id, &[jobId+date], jobId, date, status, sync.savedLocallyAt",
      settings: "&key",
      draftMetadata: "&ahaId, sourceAhaId",
    });

    this.version(2).stores({
      jobs: "&id",
      ahas: "&id, &[jobId+date], jobId, date, status, sync.savedLocallyAt",
      settings: "&key",
      draftMetadata: "&ahaId, sourceAhaId",
      ahaPdfs: "&ahaId, sourceRevision, generatedAt",
    });

    this.version(3)
      .stores({
        jobs: "&id",
        ahas: "&id, &[jobId+date], jobId, date, status, sync.savedLocallyAt",
        settings: "&key",
        draftMetadata: "&ahaId, sourceAhaId",
        ahaPdfs: "&ahaId, sourceRevision, generatedAt",
        backupQueue:
          "&key, kind, entityId, clientUpdatedAt, nextAttemptAt, lastFailure",
      })
      .upgrade(async (transaction) => {
        const now = new Date().toISOString();
        const [jobs, ahas] = await Promise.all([
          transaction.table("jobs").toArray(),
          transaction.table("ahas").toArray(),
        ]);
        const queue = transaction.table("backupQueue");

        for (const value of jobs) {
          const record = value as { id?: unknown };
          if (
            typeof record.id === "string" &&
            !record.id.startsWith("dev-fixture:")
          ) {
            await queue.put(createBackupQueueItem("job", record.id, now));
          }
        }

        for (const value of ahas) {
          const record = value as {
            id?: unknown;
            sync?: { savedLocallyAt?: unknown };
          };
          if (
            typeof record.id === "string" &&
            !record.id.startsWith("dev-fixture:") &&
            typeof record.sync?.savedLocallyAt === "string"
          ) {
            await queue.put(
              createBackupQueueItem(
                "aha",
                record.id,
                record.sync.savedLocallyAt,
              ),
            );
          }
        }

        const pdfTable = transaction.table("ahaPdfs");
        const pdfKeys = await pdfTable.toCollection().primaryKeys();
        for (const key of pdfKeys) {
          if (typeof key !== "string") continue;
          const value = await pdfTable.get(key);
          const record = value as {
            ahaId?: unknown;
            generatedAt?: unknown;
          };
          if (
            typeof record.ahaId === "string" &&
            !record.ahaId.startsWith("dev-fixture:") &&
            typeof record.generatedAt === "string"
          ) {
            await queue.put(
              createBackupQueueItem("pdf", record.ahaId, record.generatedAt),
            );
          }
        }
      });

    this.version(4)
      .stores({
        jobs: "&id",
        ahas: "&id, &[jobId+date], jobId, date, status, sync.savedLocallyAt",
        settings: "&key",
        draftMetadata: "&ahaId, sourceAhaId",
        ahaPdfs: "&ahaId, sourceRevision, generatedAt",
        ahaPdfRevisions:
          "&key, ahaId, [ahaId+sourceRevision+generatedAt], sourceRevision, generatedAt, backedUpAt",
        backupQueue:
          "&key, kind, entityId, clientUpdatedAt, nextAttemptAt, lastFailure",
      })
      .upgrade(async (transaction) => {
        const queue = transaction.table("backupQueue");
        const pdfTable = transaction.table("ahaPdfs");
        const queuedPdfs = await queue.where("kind").equals("pdf").toArray();
        for (const value of queuedPdfs) {
          const queued = value as BackupQueueItem;
          if (
            typeof queued.entityId !== "string" ||
            (Number.isInteger(queued.sourceRevision) && queued.generatedAt)
          ) {
            continue;
          }
          const current = (await pdfTable.get(queued.entityId)) as
            AhaPdfRecord | undefined;
          await queue.delete(queued.key);
          const converted = convertLegacyPdfQueueItem(queued, current);
          if (converted) await queue.put(converted);
        }
      });
  }
}

export const ahaDatabase = new AhaDatabase();
