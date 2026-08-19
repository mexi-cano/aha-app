import { MAX_TASKS } from "./canonical";
import {
  ahaSchema,
  type Aha,
  type AhaStatus,
  type Job,
  type LocalDate,
} from "./model";

export interface RuleDependencies {
  createId: () => string;
  now: () => Date;
}

export type HomeState = "not_started" | AhaStatus;

export interface StartTodayPlan {
  aha: Aha;
  created: boolean;
  copiedFromId: string | null;
  copiedFromDate: LocalDate | null;
}

export function toLocalDate(date: Date): LocalDate {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getHomeState(todayAha: Aha | null): HomeState {
  return todayAha?.status ?? "not_started";
}

export function selectMostRecentAha(
  ahas: readonly Aha[],
  jobId: string,
  today: LocalDate,
): Aha | null {
  return (
    ahas
      .filter((aha) => aha.jobId === jobId && aha.date < today)
      .sort((left, right) => right.date.localeCompare(left.date))[0] ?? null
  );
}

export function planStartToday(
  existing: Aha | null,
  job: Job,
  availableAhas: readonly Aha[],
  date: LocalDate,
  dependencies: RuleDependencies,
): StartTodayPlan {
  if (existing) {
    if (existing.jobId !== job.id || existing.date !== date) {
      throw new Error("Existing AHA does not match this job and date");
    }
    return {
      aha: existing,
      created: false,
      copiedFromId: null,
      copiedFromDate: null,
    };
  }

  const previous = selectMostRecentAha(availableAhas, job.id, date);
  return previous
    ? {
        aha: copyAhaForNewDay(job, previous, date, dependencies),
        created: true,
        copiedFromId: previous.id,
        copiedFromDate: previous.date,
      }
    : {
        aha: createBlankAha(job, date, dependencies),
        created: true,
        copiedFromId: null,
        copiedFromDate: null,
      };
}

export function createBlankAha(
  job: Job,
  date: LocalDate,
  dependencies: RuleDependencies,
): Aha {
  const savedLocallyAt = dependencies.now().toISOString();

  return ahaSchema.parse({
    id: dependencies.createId(),
    jobId: job.id,
    date,
    status: "draft",
    header: {
      ...job.defaults,
      date,
      rescuePlanRequired: null,
    },
    description: "",
    meetingNotes: "",
    notApplicable: {
      workOrderPermit: false,
      jhaProcedureNumbers: false,
      meetingNotes: false,
    },
    tasks: [],
    energySelections: [],
    safetyCheck: null,
    crew: job.roster.map((worker) => ({
      workerId: worker.id,
      name: worker.name,
      signaturePng: null,
      signedAt: null,
    })),
    documentRevision: 0,
    completedAt: null,
    updatedAfterCompletionAt: [],
    sync: {
      savedLocallyAt,
      backedUpAt: null,
    },
  });
}

export function copyAhaForNewDay(
  job: Job,
  previous: Aha,
  date: LocalDate,
  dependencies: RuleDependencies,
): Aha {
  if (previous.jobId !== job.id) {
    throw new Error("Cannot copy an AHA from a different job");
  }

  const savedLocallyAt = dependencies.now().toISOString();

  return ahaSchema.parse({
    id: dependencies.createId(),
    jobId: job.id,
    date,
    status: "draft",
    header: {
      ...previous.header,
      date,
    },
    description: previous.description,
    meetingNotes: previous.meetingNotes,
    notApplicable: {
      workOrderPermit: false,
      jhaProcedureNumbers: false,
      meetingNotes: false,
    },
    tasks: previous.tasks.map(({ task, hazards, controls }) => ({
      id: dependencies.createId(),
      task,
      hazards,
      controls,
    })),
    energySelections: previous.energySelections.map(
      ({ category, examples }) => ({ category, examples: [...examples] }),
    ),
    safetyCheck: null,
    crew: previous.crew.map(({ workerId, name }) => ({
      workerId,
      name,
      signaturePng: null,
      signedAt: null,
    })),
    documentRevision: 0,
    completedAt: null,
    updatedAfterCompletionAt: [],
    sync: {
      savedLocallyAt,
      backedUpAt: null,
    },
  });
}

export function createEmptyTask(id: string) {
  return { id, task: "", hazards: "", controls: "" };
}

export function canAddTask(aha: Aha): boolean {
  return aha.tasks.length < MAX_TASKS;
}

export function requiresStartBlankConfirmation(hasUserEdits: boolean): boolean {
  return hasUserEdits;
}
