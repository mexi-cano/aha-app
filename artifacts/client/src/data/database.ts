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
}

export function backupQueueKey(
  kind: BackupEntityKind,
  entityId: string,
): string {
  return `${kind}:${entityId}`;
}

export function createBackupQueueItem(
  kind: BackupEntityKind,
  entityId: string,
  clientUpdatedAt: string,
  nextAttemptAt = new Date().toISOString(),
): BackupQueueItem {
  return {
    key: backupQueueKey(kind, entityId),
    kind,
    entityId,
    clientUpdatedAt,
    attempts: 0,
    nextAttemptAt,
    lastFailure: null,
    lastStatus: null,
  };
}

export function ensureLaterTimestamp(
  candidate: string,
  previous: string | null | undefined,
): string {
  if (!previous || Date.parse(candidate) > Date.parse(previous))
    return candidate;
  return new Date(Date.parse(previous) + 1).toISOString();
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
        const [jobs, ahas, pdfs] = await Promise.all([
          transaction.table("jobs").toArray(),
          transaction.table("ahas").toArray(),
          transaction.table("ahaPdfs").toArray(),
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

        for (const value of pdfs) {
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
  }
}

export const ahaDatabase = new AhaDatabase();
