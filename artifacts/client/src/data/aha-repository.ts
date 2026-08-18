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

import { ACTIVE_JOB_SETTING, ahaDatabase } from "./database";
import {
  createBlankDraftMetadata,
  createCopiedDraftMetadata,
  markDraftEdited,
  markPrefillBannerDismissed,
  type DraftMetadata,
} from "./draft-metadata";
import { ensureDevFixture, isDevFixtureId } from "./dev-fixture";
import { partitionReadableAhas } from "./stored-records";

export interface HomeSnapshot {
  job: Job | null;
  todayAha: Aha | null;
  recentAhas: Aha[];
  unreadableCount: number;
}

export interface EditorSnapshot {
  job: Job;
  aha: Aha;
  metadata: DraftMetadata;
}

export interface StartTodayResult {
  aha: Aha;
  created: boolean;
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
  await ahaDatabase.open();
  if (import.meta.env.DEV) {
    await ensureDevFixture(ahaDatabase, today);
  }
}

async function readActiveJob(): Promise<Job | null> {
  const activeSetting = await ahaDatabase.settings.get(ACTIVE_JOB_SETTING);
  if (activeSetting) {
    if (!import.meta.env.DEV && isDevFixtureId(activeSetting.value)) {
      return null;
    }

    const activeJob = await ahaDatabase.jobs.get(activeSetting.value);
    if (activeJob) {
      return parseStoredJob(activeJob);
    }
  }

  const jobs = await ahaDatabase.jobs.toArray();
  const firstUsableJob = jobs.find(
    ({ id }) => import.meta.env.DEV || !isDevFixtureId(id),
  );
  return firstUsableJob ? parseStoredJob(firstUsableJob) : null;
}

export async function getHomeSnapshot(today: LocalDate): Promise<HomeSnapshot> {
  const job = await readActiveJob();
  if (!job) {
    return { job: null, todayAha: null, recentAhas: [], unreadableCount: 0 };
  }

  const { records, unreadableCount } = partitionReadableAhas(
    await ahaDatabase.ahas.where("jobId").equals(job.id).toArray(),
  );
  const sorted = records.sort((left, right) =>
    right.date.localeCompare(left.date),
  );

  return {
    job,
    todayAha: sorted.find((aha) => aha.date === today) ?? null,
    recentAhas: sorted.filter((aha) => aha.date < today).slice(0, 3),
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
  };
}

export async function persistEditedAha(aha: Aha): Promise<Aha> {
  const saved = ahaSchema.parse({
    ...aha,
    sync: {
      savedLocallyAt: new Date().toISOString(),
      backedUpAt: null,
    },
  });

  await ahaDatabase.transaction(
    "rw",
    ahaDatabase.ahas,
    ahaDatabase.draftMetadata,
    async () => {
      await ahaDatabase.ahas.put(saved);
      const metadata =
        (await ahaDatabase.draftMetadata.get(aha.id)) ??
        createBlankDraftMetadata(aha.id);
      await ahaDatabase.draftMetadata.put(markDraftEdited(metadata));
    },
  );

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
  const blank = createBlankAha(job, date, dependencies());
  const replacement = ahaSchema.parse({ ...blank, id: ahaId });
  const metadata = createBlankDraftMetadata(ahaId);

  await ahaDatabase.transaction(
    "rw",
    ahaDatabase.ahas,
    ahaDatabase.draftMetadata,
    async () => {
      await ahaDatabase.ahas.put(replacement);
      await ahaDatabase.draftMetadata.put(metadata);
    },
  );

  return { aha: replacement, job, metadata };
}
