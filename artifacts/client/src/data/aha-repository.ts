import Dexie from "dexie";
import {
  ahaSchema,
  createBlankAha,
  parseStoredAha,
  parseStoredJob,
  planStartToday,
  type Aha,
  type Job,
  type LocalDate,
} from "@workspace/aha-domain";

import {
  ACTIVE_JOB_SETTING,
  ahaDatabase,
  createBackupQueueItem,
  ensureLaterTimestamp,
  RESTORE_NEEDS_JOB_CHOICE_SETTING,
  type AhaPdfRecord,
} from "./database";
import {
  createBlankDraftMetadata,
  createCopiedDraftMetadata,
  markDraftEdited,
  markPrefillBannerDismissed,
  type DraftMetadata,
} from "./draft-metadata";
import { isDevFixtureId } from "./dev-fixture";
import { openLocalDataWithRecovery } from "./local-data-initialization";
import { partitionReadableAhas, partitionReadableJobs } from "./stored-records";

export interface HomeSnapshot {
  job: Job | null;
  jobCount: number;
  todayAha: Aha | null;
  todayPdfStatus: AhaPdfStatus | null;
  recentAhas: Aha[];
  recentAhaPdfStatuses: Record<string, AhaPdfStatus>;
  completedAhaCount: number;
  unreadableCount: number;
}

export interface CompletedAhaHistoryItem {
  aha: Aha;
  pdf: AhaPdfState;
}

export interface CompletedAhaHistorySnapshot {
  job: Job | null;
  items: CompletedAhaHistoryItem[];
  totalCount: number;
  unreadableCount: number;
}

export function selectCompletedAhaHistory(
  records: Aha[],
  limit: number,
): { visible: Aha[]; totalCount: number } {
  const completed = records
    .filter((aha) => aha.status === "completed")
    .sort((left, right) => right.date.localeCompare(left.date));
  return {
    visible: completed.slice(0, Math.max(0, limit)),
    totalCount: completed.length,
  };
}

export interface EditorSnapshot {
  job: Job;
  aha: Aha;
  metadata: DraftMetadata;
  pdf: AhaPdfState;
}

export type AhaPdfStatus = "missing" | "stale" | "current" | "unreadable";

export type AhaPdfState =
  | { status: "missing"; record: null }
  | { status: "unreadable"; record: null }
  | { status: "stale" | "current"; record: AhaPdfRecord };

export interface StartTodayResult {
  aha: Aha;
  created: boolean;
}

interface BlankAhaReplacementWriter {
  putAha: (aha: Aha) => Promise<unknown>;
  putMetadata: (metadata: DraftMetadata) => Promise<unknown>;
  deletePdf: (ahaId: string) => Promise<unknown>;
}

export async function writeBlankAhaReplacement(
  writer: BlankAhaReplacementWriter,
  replacement: Aha,
  metadata: DraftMetadata,
): Promise<void> {
  await writer.putAha(replacement);
  await writer.putMetadata(metadata);
  await writer.deletePdf(replacement.id);
}

export function createLocalId(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

function dependencies() {
  return {
    createId: createLocalId,
    now: () => new Date(),
  };
}

export async function initializeLocalData(today: LocalDate): Promise<void> {
  void today;
  await openLocalDataWithRecovery(ahaDatabase);
}

async function readActiveJob(): Promise<Job | null> {
  if (await ahaDatabase.settings.get(RESTORE_NEEDS_JOB_CHOICE_SETTING)) {
    return null;
  }
  const activeSetting = await ahaDatabase.settings.get(ACTIVE_JOB_SETTING);
  if (activeSetting) {
    if (!import.meta.env.DEV && isDevFixtureId(activeSetting.value)) {
      return null;
    }

    const activeJob = await ahaDatabase.jobs.get(activeSetting.value);
    if (activeJob) {
      try {
        return parseStoredJob(activeJob);
      } catch {
        return null;
      }
    }
  }

  const { records: jobs } = partitionReadableJobs(
    (await ahaDatabase.jobs.toArray()).filter(
      ({ id }) => import.meta.env.DEV || !isDevFixtureId(id),
    ),
  );
  return jobs[0] ?? null;
}

export async function getHomeSnapshot(today: LocalDate): Promise<HomeSnapshot> {
  const jobCount = (await ahaDatabase.jobs.toArray()).filter(
    ({ id }) => import.meta.env.DEV || !isDevFixtureId(id),
  ).length;
  const job = await readActiveJob();
  if (!job) {
    return {
      job: null,
      jobCount,
      todayAha: null,
      todayPdfStatus: null,
      recentAhas: [],
      recentAhaPdfStatuses: {},
      completedAhaCount: 0,
      unreadableCount: 0,
    };
  }

  const { records, unreadableCount } = partitionReadableAhas(
    await ahaDatabase.ahas.where("jobId").equals(job.id).toArray(),
  );
  const sorted = records.sort((left, right) =>
    right.date.localeCompare(left.date),
  );

  const todayAha = sorted.find((aha) => aha.date === today) ?? null;
  const recentAhas = sorted.filter((aha) => aha.date < today).slice(0, 3);
  const recentAhaPdfStatuses = Object.fromEntries(
    await Promise.all(
      recentAhas
        .filter((aha) => aha.status === "completed")
        .map(
          async (aha) => [aha.id, (await getAhaPdfState(aha)).status] as const,
        ),
    ),
  );
  return {
    job,
    jobCount,
    todayAha,
    todayPdfStatus: todayAha ? (await getAhaPdfState(todayAha)).status : null,
    recentAhas,
    recentAhaPdfStatuses,
    completedAhaCount: sorted.filter((aha) => aha.status === "completed")
      .length,
    unreadableCount,
  };
}

export async function getCompletedAhaHistorySnapshot(
  limit: number,
): Promise<CompletedAhaHistorySnapshot> {
  const job = await readActiveJob();
  if (!job) {
    return { job: null, items: [], totalCount: 0, unreadableCount: 0 };
  }

  const { records, unreadableCount } = partitionReadableAhas(
    await ahaDatabase.ahas.where("jobId").equals(job.id).toArray(),
  );
  const { visible, totalCount } = selectCompletedAhaHistory(records, limit);
  const items = await Promise.all(
    visible.map(async (aha) => ({ aha, pdf: await getAhaPdfState(aha) })),
  );

  return {
    job,
    items,
    totalCount,
    unreadableCount,
  };
}

export async function startToday(
  job: Job,
  today: LocalDate,
): Promise<StartTodayResult> {
  try {
    return await ahaDatabase.transaction(
      "rw",
      ahaDatabase.ahas,
      ahaDatabase.draftMetadata,
      ahaDatabase.backupQueue,
      async () => {
        const existing = await ahaDatabase.ahas
          .where("[jobId+date]")
          .equals([job.id, today])
          .first();
        if (existing) {
          const plan = planStartToday(
            parseStoredAha(existing),
            job,
            [],
            today,
            dependencies(),
          );
          return { aha: plan.aha, created: plan.created };
        }

        const { records: allJobAhas } = partitionReadableAhas(
          await ahaDatabase.ahas.where("jobId").equals(job.id).toArray(),
        );
        const plan = planStartToday(
          null,
          job,
          allJobAhas,
          today,
          dependencies(),
        );
        const aha = plan.aha;
        const metadata =
          plan.copiedFromId && plan.copiedFromDate
            ? createCopiedDraftMetadata(
                aha.id,
                plan.copiedFromId,
                plan.copiedFromDate,
              )
            : createBlankDraftMetadata(aha.id);

        await ahaDatabase.ahas.add(aha);
        await ahaDatabase.backupQueue.put(
          createBackupQueueItem("aha", aha.id, aha.sync.savedLocallyAt),
        );
        await ahaDatabase.draftMetadata.put(metadata);
        return { aha, created: true };
      },
    );
  } catch (error) {
    if (error instanceof Dexie.ConstraintError) {
      const existing = await ahaDatabase.ahas
        .where("[jobId+date]")
        .equals([job.id, today])
        .first();
      if (existing) {
        return { aha: parseStoredAha(existing), created: false };
      }
    }
    throw error;
  }
}

export async function getEditorSnapshot(
  ahaId: string,
): Promise<EditorSnapshot | null> {
  const record = await ahaDatabase.ahas.get(ahaId);
  if (!record) {
    return null;
  }

  const aha = parseStoredAha(record);
  const jobRecord = await ahaDatabase.jobs.get(aha.jobId);
  if (!jobRecord) {
    throw new Error("The job for this AHA is missing.");
  }

  return {
    aha,
    job: parseStoredJob(jobRecord),
    metadata:
      (await ahaDatabase.draftMetadata.get(ahaId)) ??
      createBlankDraftMetadata(ahaId),
    pdf: await getAhaPdfState(aha),
  };
}

function isReadablePdfRecord(value: unknown): value is AhaPdfRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<AhaPdfRecord>;
  return (
    typeof record.ahaId === "string" &&
    record.ahaId.length > 0 &&
    typeof record.filename === "string" &&
    record.filename.length > 0 &&
    record.bytes instanceof ArrayBuffer &&
    record.bytes.byteLength > 0 &&
    typeof record.generatedAt === "string" &&
    !Number.isNaN(Date.parse(record.generatedAt)) &&
    Number.isInteger(record.sourceRevision) &&
    record.sourceRevision! >= 0
  );
}

export async function getAhaPdfState(aha: Aha): Promise<AhaPdfState> {
  const value: unknown = await ahaDatabase.ahaPdfs.get(aha.id);
  return deriveAhaPdfState(aha, value);
}

export function deriveAhaPdfState(aha: Aha, value: unknown): AhaPdfState {
  if (value === undefined) return { status: "missing", record: null };
  if (!isReadablePdfRecord(value)) {
    return { status: "unreadable", record: null };
  }
  return {
    status: value.sourceRevision === aha.documentRevision ? "current" : "stale",
    record: value,
  };
}

export function hasRecordedCompletedUpdateSincePdf(
  aha: Aha,
  pdf: AhaPdfState,
): boolean {
  if (pdf.status === "current") return false;
  const latestUpdate = aha.updatedAfterCompletionAt.at(-1);
  if (!latestUpdate) return false;
  if (!pdf.record) return true;
  return Date.parse(latestUpdate) > Date.parse(pdf.record.generatedAt);
}

export async function storeAhaPdf(
  aha: Aha,
  filename: string,
  bytes: Uint8Array,
  generatedAt = new Date(),
): Promise<AhaPdfRecord> {
  if (!filename.trim() || !bytes.byteLength) {
    throw new Error("A generated PDF filename and bytes are required");
  }
  const copiedBytes = bytes.slice();
  let record: AhaPdfRecord = {
    ahaId: aha.id,
    filename,
    bytes: copiedBytes.buffer as ArrayBuffer,
    generatedAt: generatedAt.toISOString(),
    sourceRevision: aha.documentRevision,
  };
  await ahaDatabase.transaction(
    "rw",
    ahaDatabase.ahaPdfs,
    ahaDatabase.backupQueue,
    async () => {
      const previous = await ahaDatabase.ahaPdfs.get(aha.id);
      if (previous) {
        record = {
          ...record,
          generatedAt: ensureLaterTimestamp(
            record.generatedAt,
            previous.generatedAt,
          ),
        };
      }
      await ahaDatabase.ahaPdfs.put(record);
      await ahaDatabase.backupQueue.put(
        createBackupQueueItem("pdf", aha.id, record.generatedAt),
      );
    },
  );
  return record;
}

export async function persistEditedAha(aha: Aha): Promise<Aha> {
  const candidateTimestamp = new Date().toISOString();
  let saved: Aha | null = null;

  await ahaDatabase.transaction(
    "rw",
    ahaDatabase.ahas,
    ahaDatabase.draftMetadata,
    ahaDatabase.backupQueue,
    async () => {
      const stored = await ahaDatabase.ahas.get(aha.id);
      const previousTimestamp = stored
        ? parseStoredAha(stored).sync.savedLocallyAt
        : aha.sync.savedLocallyAt;
      saved = ahaSchema.parse({
        ...aha,
        sync: {
          savedLocallyAt: ensureLaterTimestamp(
            ensureLaterTimestamp(candidateTimestamp, aha.sync.savedLocallyAt),
            previousTimestamp,
          ),
          backedUpAt: null,
        },
      });
      await ahaDatabase.ahas.put(saved);
      await ahaDatabase.backupQueue.put(
        createBackupQueueItem("aha", saved.id, saved.sync.savedLocallyAt),
      );
      const metadata =
        (await ahaDatabase.draftMetadata.get(aha.id)) ??
        createBlankDraftMetadata(aha.id);
      await ahaDatabase.draftMetadata.put(markDraftEdited(metadata));
    },
  );

  if (!saved) throw new Error("The AHA save did not complete.");
  return saved;
}

export async function dismissPrefillBanner(ahaId: string): Promise<void> {
  const metadata =
    (await ahaDatabase.draftMetadata.get(ahaId)) ??
    createBlankDraftMetadata(ahaId);
  await ahaDatabase.draftMetadata.put(markPrefillBannerDismissed(metadata));
}

export async function replaceWithBlankAha(
  ahaId: string,
  job: Job,
  date: LocalDate,
): Promise<EditorSnapshot> {
  const metadata = createBlankDraftMetadata(ahaId);
  let replacement: Aha | null = null;

  await ahaDatabase.transaction(
    "rw",
    ahaDatabase.ahas,
    ahaDatabase.draftMetadata,
    ahaDatabase.ahaPdfs,
    ahaDatabase.backupQueue,
    async () => {
      const blank = createBlankAha(job, date, dependencies());
      const previous = await ahaDatabase.ahas.get(ahaId);
      replacement = ahaSchema.parse({
        ...blank,
        id: ahaId,
        sync: {
          ...blank.sync,
          savedLocallyAt: ensureLaterTimestamp(
            blank.sync.savedLocallyAt,
            previous ? parseStoredAha(previous).sync.savedLocallyAt : null,
          ),
        },
      });
      await writeBlankAhaReplacement(
        {
          putAha: (value) => ahaDatabase.ahas.put(value),
          putMetadata: (value) => ahaDatabase.draftMetadata.put(value),
          deletePdf: (value) => ahaDatabase.ahaPdfs.delete(value),
        },
        replacement,
        metadata,
      );
      await ahaDatabase.backupQueue.put(
        createBackupQueueItem(
          "aha",
          replacement.id,
          replacement.sync.savedLocallyAt,
        ),
      );
    },
  );

  if (!replacement) throw new Error("The blank AHA replacement did not save.");

  return {
    aha: replacement,
    job,
    metadata,
    pdf: { status: "missing", record: null },
  };
}
