import {
  ahaSchema,
  jobSchema,
  type Aha,
  type Job,
} from "@workspace/aha-domain";
import {
  customFetch,
  listJobs,
  type JobBackupRecord,
} from "@workspace/api-client-react";

import { getStoredAuthToken } from "./auth-storage";
import {
  ahaDatabase,
  RESTORE_NEEDS_JOB_CHOICE_SETTING,
  RESTORE_PROGRESS_SETTING,
} from "./database";

export const AUTHORIZATION_REQUIRED_EVENT = "aha-authorization-required";

export interface RestoreProgress {
  version: 1;
  stage: "jobs" | "ahas" | "pdfs";
  jobs: Job[];
  cursor: string | null;
  ahaIds: string[];
  pdfIndex: number;
}

function parseProgress(value: string): RestoreProgress {
  const parsed = JSON.parse(value) as Partial<RestoreProgress>;
  if (
    parsed.version !== 1 ||
    !["jobs", "ahas", "pdfs"].includes(parsed.stage ?? "") ||
    !Array.isArray(parsed.jobs) ||
    !Array.isArray(parsed.ahaIds) ||
    typeof parsed.pdfIndex !== "number"
  ) {
    throw new Error("Saved restore progress is invalid.");
  }
  return {
    version: 1,
    stage: parsed.stage!,
    jobs: parsed.jobs.map((job) => jobSchema.parse(job)),
    cursor: typeof parsed.cursor === "string" ? parsed.cursor : null,
    ahaIds: parsed.ahaIds.filter((id): id is string => typeof id === "string"),
    pdfIndex: parsed.pdfIndex,
  };
}

async function saveProgress(progress: RestoreProgress): Promise<void> {
  await ahaDatabase.settings.put({
    key: RESTORE_PROGRESS_SETTING,
    value: JSON.stringify(progress),
  });
}

export async function getRestoreProgress(): Promise<RestoreProgress | null> {
  const setting = await ahaDatabase.settings.get(RESTORE_PROGRESS_SETTING);
  return setting ? parseProgress(setting.value) : null;
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

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function parseRestoredPdfMetadata(
  headers: Headers,
  computedChecksum: string,
): {
  filename: string;
  sourceRevision: number;
  generatedAt: string;
} {
  const expectedChecksum = headers.get("X-Content-SHA256")?.trim();
  if (
    !expectedChecksum ||
    !/^[a-f0-9]{64}$/i.test(expectedChecksum) ||
    computedChecksum.toLowerCase() !== expectedChecksum.toLowerCase()
  ) {
    throw new Error("A restored PDF did not pass its checksum check.");
  }

  const filenameHeader = headers.get("X-AHA-Filename");
  const revisionHeader = headers.get("X-AHA-Source-Revision");
  const generatedAt = headers.get("X-AHA-Generated-At");
  const sourceRevision =
    revisionHeader === null ? Number.NaN : Number(revisionHeader);
  if (
    !filenameHeader ||
    !Number.isInteger(sourceRevision) ||
    sourceRevision < 0 ||
    !generatedAt ||
    Number.isNaN(Date.parse(generatedAt))
  ) {
    throw new Error("A restored PDF has invalid metadata.");
  }

  let filename: string;
  try {
    filename = decodeURIComponent(filenameHeader);
  } catch {
    throw new Error("A restored PDF has invalid metadata.");
  }
  if (!filename) throw new Error("A restored PDF has invalid metadata.");

  return { filename, sourceRevision, generatedAt };
}

async function restorePdf(ahaId: string): Promise<void> {
  const response = await authenticatedPdfFetch(ahaId);
  if (response.status === 404) return;
  if (!response.ok) throw new Error("A saved PDF could not be restored.");
  const bytes = await response.arrayBuffer();
  const metadata = parseRestoredPdfMetadata(
    response.headers,
    await sha256Hex(bytes),
  );
  await ahaDatabase.ahaPdfs.put({
    ahaId,
    ...metadata,
    bytes,
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
    await ahaDatabase.transaction("rw", ahaDatabase.jobs, async () => {
      for (const job of progress!.jobs) await ahaDatabase.jobs.put(job);
    });
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
    progress = { ...progress, pdfIndex: index + 1 };
    await saveProgress(progress);
  }

  await ahaDatabase.transaction("rw", ahaDatabase.settings, async () => {
    await ahaDatabase.settings.delete(RESTORE_PROGRESS_SETTING);
    await ahaDatabase.settings.put({
      key: RESTORE_NEEDS_JOB_CHOICE_SETTING,
      value: "true",
    });
  });
}
