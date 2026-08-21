import { jobSchema, parseStoredJob, type Job } from "@workspace/aha-domain";

import { createLocalId } from "./aha-repository";
import {
  ACTIVE_JOB_SETTING,
  ahaDatabase,
  backupQueueKey,
  createBackupQueueItem,
  ensureLaterTimestamp,
  RESTORE_NEEDS_JOB_CHOICE_SETTING,
} from "./database";
import { isDevFixtureId } from "./dev-fixture";
import { sortJobsForSelection } from "./job-selection";
import { partitionReadableJobs } from "./stored-records";
import { assertRecoveryMutationAllowed } from "./recovery-mutation-guard";

export interface JobListSnapshot {
  jobs: Job[];
  activeJobId: string | null;
  unreadableCount: number;
}

export async function getJobListSnapshot(): Promise<JobListSnapshot> {
  const [records, activeSetting] = await Promise.all([
    ahaDatabase.jobs.toArray(),
    ahaDatabase.settings.get(ACTIVE_JOB_SETTING),
  ]);
  const { records: jobs, unreadableCount } = partitionReadableJobs(
    records.filter(({ id }) => !isDevFixtureId(id)),
  );
  const orderedJobs = sortJobsForSelection(jobs);
  const activeJobId = orderedJobs.some(({ id }) => id === activeSetting?.value)
    ? activeSetting!.value
    : null;
  return { jobs: orderedJobs, activeJobId, unreadableCount };
}

export async function getJob(jobId: string): Promise<Job | null> {
  const value = await ahaDatabase.jobs.get(jobId);
  if (!value || isDevFixtureId(value.id)) return null;
  return parseStoredJob(value);
}

export async function hasConfiguredJob(): Promise<boolean> {
  return (await ahaDatabase.jobs.toArray()).some(
    ({ id }) => !isDevFixtureId(id),
  );
}

export async function setActiveJob(jobId: string): Promise<void> {
  const job = await ahaDatabase.jobs.get(jobId);
  if (!job || isDevFixtureId(job.id)) {
    throw new Error("That job is not available on this iPad.");
  }
  try {
    parseStoredJob(job);
  } catch {
    throw new Error("That job is not available on this iPad.");
  }
  await ahaDatabase.transaction("rw", ahaDatabase.settings, async () => {
    await ahaDatabase.settings.put({ key: ACTIVE_JOB_SETTING, value: jobId });
    await ahaDatabase.settings.delete(RESTORE_NEEDS_JOB_CHOICE_SETTING);
  });
}

export async function createJob(
  input: Omit<Job, "id">,
  now = new Date(),
): Promise<Job> {
  await assertRecoveryMutationAllowed();
  const job = jobSchema.parse({ ...input, id: createLocalId() });
  const changedAt = now.toISOString();
  await ahaDatabase.transaction(
    "rw",
    ahaDatabase.jobs,
    ahaDatabase.settings,
    ahaDatabase.backupQueue,
    async () => {
      await ahaDatabase.jobs.add(job);
      await ahaDatabase.settings.put({
        key: ACTIVE_JOB_SETTING,
        value: job.id,
      });
      await ahaDatabase.settings.delete(RESTORE_NEEDS_JOB_CHOICE_SETTING);
      await ahaDatabase.backupQueue.put(
        createBackupQueueItem("job", job.id, changedAt),
      );
    },
  );
  return job;
}

export async function updateJobConfiguration(
  jobId: string,
  configuration: Pick<
    Job,
    "defaults" | "roster" | "defaultPersonInChargeWorkerId"
  >,
  now = new Date(),
): Promise<Job> {
  await assertRecoveryMutationAllowed();
  const existingValue = await ahaDatabase.jobs.get(jobId);
  if (!existingValue || isDevFixtureId(jobId)) {
    throw new Error("That job is not available on this iPad.");
  }
  const existing = parseStoredJob(existingValue);
  const updated = jobSchema.parse({ ...existing, ...configuration });
  const changedAt = now.toISOString();
  await ahaDatabase.transaction(
    "rw",
    ahaDatabase.jobs,
    ahaDatabase.backupQueue,
    async () => {
      const queued = await ahaDatabase.backupQueue.get(
        backupQueueKey("job", updated.id),
      );
      const monotonicChangedAt = ensureLaterTimestamp(
        changedAt,
        queued?.clientUpdatedAt,
      );
      await ahaDatabase.jobs.put(updated);
      await ahaDatabase.backupQueue.put(
        createBackupQueueItem("job", updated.id, monotonicChangedAt),
      );
    },
  );
  return updated;
}

export async function putRestoredJob(job: Job): Promise<void> {
  const parsed = jobSchema.parse(job);
  await ahaDatabase.jobs.put(parsed);
}
