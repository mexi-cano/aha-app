import {
  ahaSchema,
  parseStoredAha,
  parseStoredJob,
} from "@workspace/aha-domain";
import { ApiError, customFetch } from "@workspace/api-client-react";

import { getStoredAuthToken } from "./auth-storage";
import {
  ahaDatabase,
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

const kindOrder: Record<BackupEntityKind, number> = {
  job: 0,
  aha: 1,
  pdf: 2,
};

function ordered(items: BackupQueueItem[]): BackupQueueItem[] {
  return items.sort(
    (left, right) =>
      kindOrder[left.kind] - kindOrder[right.kind] ||
      left.clientUpdatedAt.localeCompare(right.clientUpdatedAt) ||
      left.key.localeCompare(right.key),
  );
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
        job: parseStoredJob(value),
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
      body: JSON.stringify(parseStoredAha(value)),
    });
    return {
      accepted: result.accepted,
      backedUpAt: result.record.sync.backedUpAt ?? new Date().toISOString(),
    };
  }

  const value = await ahaDatabase.ahaPdfs.get(item.entityId);
  if (!value) return { accepted: true, backedUpAt: new Date().toISOString() };
  const query = new URLSearchParams({
    filename: value.filename,
    sourceRevision: String(value.sourceRevision),
    generatedAt: value.generatedAt,
  });
  const result = await customFetch<{
    accepted: boolean;
    record: { backedUpAt: string };
  }>(`/api/ahas/${encodeURIComponent(item.entityId)}/pdf?${query}`, {
    method: "PUT",
    responseType: "json",
    headers: { "Content-Type": "application/pdf" },
    body: value.bytes,
  });
  return { accepted: result.accepted, backedUpAt: result.record.backedUpAt };
}

async function acknowledge(
  captured: BackupQueueItem,
  backedUpAt: string,
): Promise<void> {
  await ahaDatabase.transaction(
    "rw",
    ahaDatabase.backupQueue,
    ahaDatabase.ahas,
    ahaDatabase.settings,
    async () => {
      const current = await ahaDatabase.backupQueue.get(captured.key);
      if (!current || current.clientUpdatedAt !== captured.clientUpdatedAt) {
        return;
      }
      if (captured.kind === "aha") {
        const local = await ahaDatabase.ahas.get(captured.entityId);
        if (local) {
          const parsed = parseStoredAha(local);
          if (parsed.sync.savedLocallyAt === captured.clientUpdatedAt) {
            await ahaDatabase.ahas.put(
              ahaSchema.parse({
                ...parsed,
                sync: { ...parsed.sync, backedUpAt },
              }),
            );
          }
        }
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
      const items = ordered(await ahaDatabase.backupQueue.toArray());
      const item = items[0];
      if (!item || item.lastFailure === "rejected") return;
      if (Date.parse(item.nextAttemptAt) > Date.now()) {
        scheduleRetry(item.nextAttemptAt);
        return;
      }
      try {
        const result = await upload(item);
        if (!result.accepted) {
          await retainFailure(item, "rejected", 409);
          return;
        }
        await acknowledge(item, result.backedUpAt);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          await ahaDatabase.settings.put({
            key: BACKUP_AUTH_PAUSED_SETTING,
            value: "true",
          });
          return;
        }
        const status = error instanceof ApiError ? error.status : null;
        const retryable =
          status === null || status === 408 || status === 429 || status >= 500;
        const scheduledAt = await retainFailure(
          item,
          retryable ? "retryable" : "rejected",
          status,
        );
        if (scheduledAt) scheduleRetry(scheduledAt);
        return;
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
