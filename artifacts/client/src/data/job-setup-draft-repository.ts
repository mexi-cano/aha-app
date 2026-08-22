import { parseJobSetupDraft, type JobSetupDraft } from "@/features/job-setup";

import { ahaDatabase, type JobSetupDraftRecord } from "./database";
import {
  assertRecoveryMutationAllowed,
  assertRecoveryMutationAllowedInTransaction,
} from "./recovery-mutation-guard";

export function jobSetupDraftKey(jobId?: string | null): string {
  return jobId ? `job:${jobId}` : "new";
}

export async function getJobSetupDraftKeys(): Promise<string[]> {
  const keys = await ahaDatabase.jobSetupDrafts.toCollection().primaryKeys();
  return keys.filter((key): key is string => typeof key === "string");
}

export async function getJobSetupDraft(
  jobId?: string | null,
): Promise<JobSetupDraftRecord | null> {
  const expectedKey = jobSetupDraftKey(jobId);
  const record = await ahaDatabase.jobSetupDrafts.get(expectedKey);
  if (!record) return null;
  const expectedMode = jobId ? "edit" : "create";
  if (
    record.key !== expectedKey ||
    record.mode !== expectedMode ||
    record.jobId !== (jobId ?? null) ||
    !Number.isFinite(Date.parse(record.createdAt)) ||
    !Number.isFinite(Date.parse(record.updatedAt))
  ) {
    throw new Error("Invalid saved job setup draft.");
  }
  return { ...record, draft: parseJobSetupDraft(record.draft) };
}

export async function saveJobSetupDraft(
  jobId: string | null,
  draft: JobSetupDraft,
  now = new Date(),
): Promise<JobSetupDraftRecord> {
  await assertRecoveryMutationAllowed();
  const key = jobSetupDraftKey(jobId);
  const timestamp = now.toISOString();
  let saved!: JobSetupDraftRecord;
  await ahaDatabase.transaction(
    "rw",
    ahaDatabase.jobSetupDrafts,
    ahaDatabase.settings,
    async () => {
      await assertRecoveryMutationAllowedInTransaction();
      const existing = await ahaDatabase.jobSetupDrafts.get(key);
      saved = {
        key,
        mode: jobId ? "edit" : "create",
        jobId,
        draft,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      };
      await ahaDatabase.jobSetupDrafts.put(saved);
    },
  );
  return saved;
}

export async function discardJobSetupDraft(
  jobId?: string | null,
): Promise<void> {
  await assertRecoveryMutationAllowed();
  await ahaDatabase.transaction(
    "rw",
    ahaDatabase.jobSetupDrafts,
    ahaDatabase.settings,
    async () => {
      await assertRecoveryMutationAllowedInTransaction();
      await ahaDatabase.jobSetupDrafts.delete(jobSetupDraftKey(jobId));
    },
  );
}
