import {
  ahaSchema,
  canonicalizePdfTimestamp,
  isSamePdfVersionIdentity,
  parseStoredAha,
  parseStoredJob,
} from "@workspace/aha-domain";
import { ApiError, customFetch } from "@workspace/api-client-react";

import { getStoredAuthToken } from "./auth-storage";
import {
  ahaPdfRevisionKey,
  ahaDatabase,
  type AhaPdfRecord,
  type AhaPdfRevisionRecord,
  type BackupEntityKind,
  type BackupQueueItem,
} from "./database";

export const BACKUP_AUTH_PAUSED_SETTING = "backupPausedForAuth";
const BACKED_UP_ONCE_SETTING = "backedUpOnce";
const BACKUP_STATE_EVENT = "aha-backup-state";
const MAX_RETRY_MS = 5 * 60 * 1_000;

export type BackupViewState =
  | "saved_local"
  | "backing_up"
  | "backed_up"
  | "waiting_connection"
  | "retry_scheduled"
  | "paused_auth"
  | "support_required";

export interface BackupSnapshot {
  state: BackupViewState;
  pendingCount: number;
}

export class LocalBackupRecordError extends Error {
  readonly name = "LocalBackupRecordError";

  constructor(kind: "job" | "aha" | "pdf", cause: unknown) {
    super(`A saved ${kind} could not be prepared for backup.`, { cause });
  }
}

export interface ClassifiedBackupFailure {
  failure: "retryable" | "rejected";
  status: number | null;
}

export interface PdfBackupAcknowledgment {
  backedUpAt: string;
  sha256: string;
  byteLength: number;
}

export function applyPdfBackupAcknowledgment<
  T extends AhaPdfRecord | AhaPdfRevisionRecord,
>(
  record: T,
  identity: { sourceRevision: number; generatedAt: string },
  acknowledgment: PdfBackupAcknowledgment,
): T | null {
  return isSamePdfVersionIdentity(record, identity)
    ? { ...record, ...acknowledgment }
    : null;
}

let running = false;
let retryTimer: number | null = null;

function announce(): void {
  window.dispatchEvent(new Event(BACKUP_STATE_EVENT));
}

export function subscribeBackupState(listener: () => void): () => void {
  window.addEventListener(BACKUP_STATE_EVENT, listener);
  return () => window.removeEventListener(BACKUP_STATE_EVENT, listener);
}

export function calculateRetryDelay(
  attempts: number,
  random = Math.random(),
): number {
  const base = Math.min(MAX_RETRY_MS, 1_000 * 2 ** Math.min(attempts, 9));
  return Math.min(MAX_RETRY_MS, Math.round(base * (0.5 + random)));
}

export function classifyBackupFailure(
  status: number | null,
): "retryable" | "rejected" {
  return status === null || status === 408 || status === 429 || status >= 500
    ? "retryable"
    : "rejected";
}

export function classifyBackupError(error: unknown): ClassifiedBackupFailure {
  const status = error instanceof ApiError ? error.status : null;
  return {
    failure:
      error instanceof LocalBackupRecordError
        ? "rejected"
        : classifyBackupFailure(status),
    status,
  };
}

const kindOrder: Record<BackupEntityKind, number> = {
  job: 0,
  aha: 1,
  pdf: 2,
};

function ordered(items: readonly BackupQueueItem[]): BackupQueueItem[] {
  return [...items].sort(
    (left, right) =>
      kindOrder[left.kind] - kindOrder[right.kind] ||
      left.clientUpdatedAt.localeCompare(right.clientUpdatedAt) ||
      left.key.localeCompare(right.key),
  );
}

export async function selectNextBackupItem(
  items: readonly BackupQueueItem[],
  resolveAhaJobId: (ahaId: string) => Promise<string | null>,
): Promise<BackupQueueItem | null> {
  const rejectedJobIds = new Set(
    items
      .filter((item) => item.kind === "job" && item.lastFailure === "rejected")
      .map((item) => item.entityId),
  );
  const rejectedAhaIds = new Set(
    items
      .filter((item) => item.kind === "aha" && item.lastFailure === "rejected")
      .map((item) => item.entityId),
  );

  for (const item of ordered(items)) {
    if (item.lastFailure === "rejected") continue;
    if (item.kind === "pdf" && rejectedAhaIds.has(item.entityId)) continue;
    if (item.kind !== "job" && rejectedJobIds.size > 0) {
      const jobId = await resolveAhaJobId(item.entityId);
      if (jobId && rejectedJobIds.has(jobId)) continue;
    }
    return item;
  }

  return null;
}

function parseQueuedJob(value: unknown) {
  try {
    return parseStoredJob(value);
  } catch (error) {
    throw new LocalBackupRecordError("job", error);
  }
}

function parseQueuedAha(value: unknown) {
  try {
    return parseStoredAha(value);
  } catch (error) {
    throw new LocalBackupRecordError("aha", error);
  }
}

async function getRawAhaJobId(ahaId: string): Promise<string | null> {
  const value: unknown = await ahaDatabase.ahas.get(ahaId);
  if (!value || typeof value !== "object") return null;
  const jobId = (value as { jobId?: unknown }).jobId;
  return typeof jobId === "string" ? jobId : null;
}

export async function getBackupSnapshot(): Promise<BackupSnapshot> {
  const [items, paused, backedUpOnce] = await Promise.all([
    ahaDatabase.backupQueue.toArray(),
    ahaDatabase.settings.get(BACKUP_AUTH_PAUSED_SETTING),
    ahaDatabase.settings.get(BACKED_UP_ONCE_SETTING),
  ]);
  if (items.some((item) => item.lastFailure === "rejected")) {
    return { state: "support_required", pendingCount: items.length };
  }
  if (paused && items.length) {
    return { state: "paused_auth", pendingCount: items.length };
  }
  if (items.length && !navigator.onLine) {
    return { state: "waiting_connection", pendingCount: items.length };
  }
  if (items.some((item) => item.lastFailure === "retryable")) {
    return { state: "retry_scheduled", pendingCount: items.length };
  }
  if (items.length || running) {
    return { state: "backing_up", pendingCount: items.length };
  }
  return {
    state: backedUpOnce ? "backed_up" : "saved_local",
    pendingCount: 0,
  };
}

async function upload(item: BackupQueueItem): Promise<{
  accepted: boolean;
  backedUpAt: string;
  pdfMetadata?: { sha256: string; byteLength: number };
}> {
  if (item.kind === "job") {
    const value = await ahaDatabase.jobs.get(item.entityId);
    if (!value) return { accepted: true, backedUpAt: new Date().toISOString() };
    const result = await customFetch<{
      accepted: boolean;
      record: { backedUpAt: string };
    }>("/api/jobs", {
      method: "POST",
      responseType: "json",
      body: JSON.stringify({
        job: parseQueuedJob(value),
        clientUpdatedAt: item.clientUpdatedAt,
      }),
    });
    return { accepted: result.accepted, backedUpAt: result.record.backedUpAt };
  }

  if (item.kind === "aha") {
    const value = await ahaDatabase.ahas.get(item.entityId);
    if (!value) return { accepted: true, backedUpAt: new Date().toISOString() };
    const result = await customFetch<{
      accepted: boolean;
      record: { sync: { backedUpAt: string | null } };
    }>(`/api/ahas/${encodeURIComponent(item.entityId)}`, {
      method: "PUT",
      responseType: "json",
      body: JSON.stringify(parseQueuedAha(value)),
    });
    return {
      accepted: result.accepted,
      backedUpAt: result.record.sync.backedUpAt ?? new Date().toISOString(),
    };
  }

  if (!Number.isInteger(item.sourceRevision) || !item.generatedAt) {
    throw new LocalBackupRecordError(
      "pdf",
      new Error("The queued PDF version identity is missing."),
    );
  }
  const current = await ahaDatabase.ahaPdfs.get(item.entityId);
  const revision = await ahaDatabase.ahaPdfRevisions.get(
    ahaPdfRevisionKey(item.entityId, item.sourceRevision!, item.generatedAt),
  );
  const value =
    current &&
    isSamePdfVersionIdentity(current, {
      sourceRevision: item.sourceRevision!,
      generatedAt: item.generatedAt,
    })
      ? current
      : revision?.bytes
        ? { ...revision, bytes: revision.bytes }
        : null;
  if (!value) return { accepted: true, backedUpAt: new Date().toISOString() };
  const query = new URLSearchParams({
    filename: value.filename,
    sourceRevision: String(value.sourceRevision),
    generatedAt: canonicalizePdfTimestamp(value.generatedAt),
  });
  const result = await customFetch<{
    accepted: boolean;
    record: { backedUpAt: string; sha256: string; byteLength: number };
  }>(`/api/ahas/${encodeURIComponent(item.entityId)}/pdf?${query}`, {
    method: "PUT",
    responseType: "json",
    headers: { "Content-Type": "application/pdf" },
    body: value.bytes,
  });
  return {
    accepted: result.accepted,
    backedUpAt: result.record.backedUpAt,
    pdfMetadata: {
      sha256: result.record.sha256,
      byteLength: result.record.byteLength,
    },
  };
}

async function acknowledge(
  captured: BackupQueueItem,
  backedUpAt: string,
  pdfMetadata?: { sha256: string; byteLength: number },
): Promise<void> {
  await ahaDatabase.transaction(
    "rw",
    ahaDatabase.backupQueue,
    ahaDatabase.ahas,
    ahaDatabase.ahaPdfs,
    ahaDatabase.ahaPdfRevisions,
    ahaDatabase.settings,
    async () => {
      const current = await ahaDatabase.backupQueue.get(captured.key);
      if (!current || current.clientUpdatedAt !== captured.clientUpdatedAt) {
        return;
      }
      if (captured.kind === "aha") {
        const local = await ahaDatabase.ahas.get(captured.entityId);
        if (local) {
          const parsed = parseQueuedAha(local);
          if (parsed.sync.savedLocallyAt === captured.clientUpdatedAt) {
            await ahaDatabase.ahas.put(
              ahaSchema.parse({
                ...parsed,
                sync: { ...parsed.sync, backedUpAt },
              }),
            );
          }
        }
      } else if (
        captured.kind === "pdf" &&
        Number.isInteger(captured.sourceRevision) &&
        captured.generatedAt &&
        pdfMetadata
      ) {
        const identity = {
          sourceRevision: captured.sourceRevision!,
          generatedAt: captured.generatedAt,
        };
        const metadata = { backedUpAt, ...pdfMetadata };
        const currentPdf = await ahaDatabase.ahaPdfs.get(captured.entityId);
        const acknowledgedCurrent = currentPdf
          ? applyPdfBackupAcknowledgment(currentPdf, identity, metadata)
          : null;
        if (acknowledgedCurrent) {
          await ahaDatabase.ahaPdfs.put(acknowledgedCurrent);
        } else {
          const key = ahaPdfRevisionKey(
            captured.entityId,
            captured.sourceRevision!,
            captured.generatedAt,
          );
          const revision = await ahaDatabase.ahaPdfRevisions.get(key);
          const acknowledgedRevision = revision
            ? applyPdfBackupAcknowledgment(revision, identity, metadata)
            : null;
          if (!acknowledgedRevision) {
            throw new LocalBackupRecordError(
              "pdf",
              new Error(
                "The acknowledged PDF version is no longer available locally.",
              ),
            );
          }
          await ahaDatabase.ahaPdfRevisions.put(acknowledgedRevision);
        }
      } else if (captured.kind === "pdf") {
        throw new LocalBackupRecordError(
          "pdf",
          new Error("The PDF acknowledgment metadata is missing."),
        );
      }
      await ahaDatabase.backupQueue.delete(captured.key);
      await ahaDatabase.settings.put({
        key: BACKED_UP_ONCE_SETTING,
        value: backedUpAt,
      });
    },
  );
}

async function retainFailure(
  captured: BackupQueueItem,
  failure: "retryable" | "rejected",
  status: number | null,
): Promise<string | null> {
  let scheduledAt: string | null = null;
  await ahaDatabase.transaction("rw", ahaDatabase.backupQueue, async () => {
    const current = await ahaDatabase.backupQueue.get(captured.key);
    if (!current || current.clientUpdatedAt !== captured.clientUpdatedAt)
      return;
    const attempts = current.attempts + 1;
    scheduledAt =
      failure === "retryable"
        ? new Date(Date.now() + calculateRetryDelay(attempts)).toISOString()
        : null;
    await ahaDatabase.backupQueue.put({
      ...current,
      attempts,
      lastFailure: failure,
      lastStatus: status,
      nextAttemptAt: scheduledAt ?? current.nextAttemptAt,
    });
  });
  return scheduledAt;
}

function scheduleRetry(nextAttemptAt: string): void {
  if (retryTimer !== null) window.clearTimeout(retryTimer);
  const delay = Math.max(0, Date.parse(nextAttemptAt) - Date.now());
  retryTimer = window.setTimeout(
    () => {
      retryTimer = null;
      triggerBackupProcessing();
    },
    Math.min(delay, MAX_RETRY_MS),
  );
}

async function run(): Promise<void> {
  if (running || !navigator.onLine) return;
  running = true;
  announce();
  try {
    const [token, paused] = await Promise.all([
      getStoredAuthToken(),
      ahaDatabase.settings.get(BACKUP_AUTH_PAUSED_SETTING),
    ]);
    if (!token || paused) return;
    while (navigator.onLine) {
      const items = await ahaDatabase.backupQueue.toArray();
      const item = await selectNextBackupItem(items, getRawAhaJobId);
      if (!item) return;
      if (Date.parse(item.nextAttemptAt) > Date.now()) {
        scheduleRetry(item.nextAttemptAt);
        return;
      }
      try {
        const result = await upload(item);
        if (!result.accepted) {
          await retainFailure(item, "rejected", 409);
          continue;
        }
        await acknowledge(item, result.backedUpAt, result.pdfMetadata);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          await ahaDatabase.settings.put({
            key: BACKUP_AUTH_PAUSED_SETTING,
            value: "true",
          });
          return;
        }
        const { failure, status } = classifyBackupError(error);
        const scheduledAt = await retainFailure(item, failure, status);
        if (failure === "retryable" && scheduledAt) {
          scheduleRetry(scheduledAt);
          return;
        }
      }
    }
  } finally {
    running = false;
    announce();
  }
}

export function triggerBackupProcessing(): void {
  void run();
}
