import {
  ahaSchema,
  jobSchema,
  type Aha,
  type Job,
} from "@workspace/aha-domain";
import {
  ApiError,
  customFetch,
  listJobs,
  type JobBackupRecord,
} from "@workspace/api-client-react";

import { getStoredAuthToken } from "./auth-storage";
import {
  AUTHORIZATION_REQUIRED_EVENT,
  parseRestoredPdfMetadata,
  sha256Hex,
} from "./pdf-backup-metadata";
import { refreshPdfVersionMetadata } from "./pdf-version-repository";
import {
  ACTIVE_JOB_SETTING,
  ahaDatabase,
  RESTORE_NEEDS_JOB_CHOICE_SETTING,
  RESTORE_PROGRESS_SETTING,
} from "./database";

export {
  AUTHORIZATION_REQUIRED_EVENT,
  parseRemotePdfVersionMetadata,
  parseRestoredPdfMetadata,
  sha256Hex,
} from "./pdf-backup-metadata";

export interface RestoreProgress {
  version: 1;
  stage: "jobs" | "ahas" | "pdfs";
  jobs: Job[];
  cursor: string | null;
  ahaIds: string[];
  pdfIndex: number;
}

export class InvalidRestoreProgressError extends Error {
  readonly name = "InvalidRestoreProgressError";

  constructor(cause?: unknown) {
    super("Saved recovery progress could not be read.", { cause });
  }
}

export function planRestoredJobChoice(
  jobs: readonly Pick<Job, "id">[],
): { activeJobId: string | null; needsChoice: boolean } {
  if (jobs.length === 0) {
    return { activeJobId: null, needsChoice: false };
  }
  if (jobs.length === 1) {
    return { activeJobId: jobs[0]!.id, needsChoice: false };
  }
  return { activeJobId: null, needsChoice: true };
}

async function applyRestoredJobChoice(jobs: readonly Job[]): Promise<void> {
  const current = await ahaDatabase.settings.get(ACTIVE_JOB_SETTING);
  const plan = planRestoredJobChoice(jobs);
  if (plan.activeJobId) {
    await ahaDatabase.settings.put({
      key: ACTIVE_JOB_SETTING,
      value: plan.activeJobId,
    });
  } else if (current) {
    await ahaDatabase.settings.delete(ACTIVE_JOB_SETTING);
  }
  if (plan.needsChoice) {
    await ahaDatabase.settings.put({
      key: RESTORE_NEEDS_JOB_CHOICE_SETTING,
      value: "true",
    });
  } else {
    await ahaDatabase.settings.delete(RESTORE_NEEDS_JOB_CHOICE_SETTING);
  }
}

export function parseRestoreProgress(value: string): RestoreProgress {
  try {
    const parsed = JSON.parse(value) as Partial<RestoreProgress>;
    if (
      parsed.version !== 1 ||
      !["jobs", "ahas", "pdfs"].includes(parsed.stage ?? "") ||
      !Array.isArray(parsed.jobs) ||
      !Array.isArray(parsed.ahaIds) ||
      typeof parsed.pdfIndex !== "number"
    ) {
      throw new InvalidRestoreProgressError();
    }
    return {
      version: 1,
      stage: parsed.stage!,
      jobs: parsed.jobs.map((job) => jobSchema.parse(job)),
      cursor: typeof parsed.cursor === "string" ? parsed.cursor : null,
      ahaIds: parsed.ahaIds.filter(
        (id): id is string => typeof id === "string",
      ),
      pdfIndex: parsed.pdfIndex,
    };
  } catch (cause) {
    if (cause instanceof InvalidRestoreProgressError) throw cause;
    throw new InvalidRestoreProgressError(cause);
  }
}

async function saveProgress(progress: RestoreProgress): Promise<void> {
  await ahaDatabase.settings.put({
    key: RESTORE_PROGRESS_SETTING,
    value: JSON.stringify(progress),
  });
}

export async function getRestoreProgress(): Promise<RestoreProgress | null> {
  const setting = await ahaDatabase.settings.get(RESTORE_PROGRESS_SETTING);
  return setting ? parseRestoreProgress(setting.value) : null;
}

export async function clearRestoreProgressForRestart(): Promise<void> {
  await ahaDatabase.settings.delete(RESTORE_PROGRESS_SETTING);
}

export async function listRemoteJobs(): Promise<JobBackupRecord[]> {
  const records = await listJobs();
  return records.map((record) => {
    if (
      typeof record.clientUpdatedAt !== "string" ||
      Number.isNaN(Date.parse(record.clientUpdatedAt)) ||
      typeof record.backedUpAt !== "string" ||
      Number.isNaN(Date.parse(record.backedUpAt))
    ) {
      throw new Error("A remote job record is invalid.");
    }
    return {
      job: jobSchema.parse(record.job),
      clientUpdatedAt: record.clientUpdatedAt,
      backedUpAt: record.backedUpAt,
    };
  });
}

export async function beginRestore(jobs: Job[]): Promise<void> {
  if (!jobs.length) throw new Error("Choose at least one job to restore.");
  await saveProgress({
    version: 1,
    stage: "jobs",
    jobs: jobs.map((job) => jobSchema.parse(job)),
    cursor: null,
    ahaIds: [],
    pdfIndex: 0,
  });
}

async function authenticatedPdfFetch(ahaId: string): Promise<Response> {
  const token = await getStoredAuthToken();
  const response = await fetch(`/api/ahas/${encodeURIComponent(ahaId)}/pdf`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (response.status === 401) {
    window.dispatchEvent(new Event(AUTHORIZATION_REQUIRED_EVENT));
  }
  return response;
}

async function restorePdf(ahaId: string): Promise<void> {
  const response = await authenticatedPdfFetch(ahaId);
  if (response.status === 404) return;
  if (!response.ok) {
    throw new ApiError(response, null, {
      method: "GET",
      url: `/api/ahas/${encodeURIComponent(ahaId)}/pdf`,
    });
  }
  const bytes = await response.arrayBuffer();
  const metadata = parseRestoredPdfMetadata(
    response.headers,
    await sha256Hex(bytes),
  );
  await ahaDatabase.ahaPdfs.put({
    ahaId,
    ...metadata,
    bytes,
    byteLength: bytes.byteLength,
  });
}

export async function resumeRestore(
  onProgress?: (message: string) => void,
): Promise<void> {
  let progress = await getRestoreProgress();
  if (!progress) throw new Error("There is no restore to resume.");
  const selectedIds = new Set(progress.jobs.map((job) => job.id));

  if (progress.stage === "jobs") {
    onProgress?.("Restoring job setup…");
    await ahaDatabase.transaction(
      "rw",
      ahaDatabase.jobs,
      ahaDatabase.settings,
      async () => {
        for (const job of progress!.jobs) await ahaDatabase.jobs.put(job);
        await applyRestoredJobChoice(progress!.jobs);
      },
    );
    progress = { ...progress, stage: "ahas", cursor: null };
    await saveProgress(progress);
  }

  if (progress.stage === "ahas") {
    onProgress?.("Restoring saved AHAs…");
    let cursor = progress.cursor;
    do {
      const query = new URLSearchParams({ limit: "50" });
      if (cursor) query.set("cursor", cursor);
      const page = await customFetch<{
        items: unknown[];
        nextCursor: string | null;
      }>(`/api/ahas?${query}`, { responseType: "json" });
      const selectedAhas: Aha[] = page.items
        .map((value) => ahaSchema.parse(value))
        .filter((aha) => selectedIds.has(aha.jobId));
      await ahaDatabase.transaction("rw", ahaDatabase.ahas, async () => {
        for (const aha of selectedAhas) await ahaDatabase.ahas.put(aha);
      });
      progress = {
        ...progress,
        cursor: page.nextCursor,
        ahaIds: Array.from(
          new Set([...progress.ahaIds, ...selectedAhas.map((aha) => aha.id)]),
        ),
      };
      await saveProgress(progress);
      cursor = page.nextCursor;
    } while (cursor);
    progress = { ...progress, stage: "pdfs", pdfIndex: 0 };
    await saveProgress(progress);
  }

  for (
    let index = progress.pdfIndex;
    index < progress.ahaIds.length;
    index += 1
  ) {
    onProgress?.(
      `Restoring saved PDFs (${index + 1} of ${progress.ahaIds.length})…`,
    );
    await restorePdf(progress.ahaIds[index]!);
    await refreshPdfVersionMetadata(progress.ahaIds[index]!);
    progress = { ...progress, pdfIndex: index + 1 };
    await saveProgress(progress);
  }

  await ahaDatabase.transaction("rw", ahaDatabase.settings, async () => {
    await ahaDatabase.settings.delete(RESTORE_PROGRESS_SETTING);
    await applyRestoredJobChoice(progress.jobs);
  });
}
