import { jobSchema, parseStoredJob, type Job } from "@workspace/aha-domain";

import { createLocalId } from "./aha-repository";
import {
  ACTIVE_JOB_SETTING,
  ahaDatabase,
  createBackupQueueItem,
  ensureLaterTimestamp,
  RESTORE_NEEDS_JOB_CHOICE_SETTING,
} from "./database";
import { isDevFixtureId } from "./dev-fixture";

export interface JobListSnapshot {
  jobs: Job[];
  activeJobId: string | null;
}

export async function getJobListSnapshot(): Promise<JobListSnapshot> {
  const [records, activeSetting] = await Promise.all([
    ahaDatabase.jobs.toArray(),
    ahaDatabase.settings.get(ACTIVE_JOB_SETTING),
  ]);
  const jobs = records
    .filter(({ id }) => !isDevFixtureId(id))
    .map(parseStoredJob)
    .sort((left, right) => left.name.localeCompare(right.name));
  const activeJobId = jobs.some(({ id }) => id === activeSetting?.value)
    ? activeSetting!.value
    : null;
  return { jobs, activeJobId };
}

export async function getJob(jobId: string): Promise<Job | null> {
  const value = await ahaDatabase.jobs.get(jobId);
  if (!value || isDevFixtureId(value.id)) return null;
  return parseStoredJob(value);
}

export async function hasConfiguredJob(): Promise<boolean> {
  const { jobs } = await getJobListSnapshot();
  return jobs.length > 0;
}

export async function setActiveJob(jobId: string): Promise<void> {
  const job = await ahaDatabase.jobs.get(jobId);
  if (!job || isDevFixtureId(job.id)) {
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
      const queued = await ahaDatabase.backupQueue.get(`job:${updated.id}`);
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
