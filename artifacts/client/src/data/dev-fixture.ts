import {
  ahaSchema,
  createBlankAha,
  jobSchema,
  toLocalDate,
  type Job,
  type LocalDate,
} from "@workspace/aha-domain";

import {
  ACTIVE_JOB_SETTING,
  type AppSetting,
  type ahaDatabase,
} from "./database";
import { createBlankDraftMetadata } from "./draft-metadata";

export const DEV_FIXTURE_PREFIX = "dev-fixture:";
export const DEV_FIXTURE_JOB_ID = `${DEV_FIXTURE_PREFIX}job`;

export function isDevFixtureId(id: string): boolean {
  return id.startsWith(DEV_FIXTURE_PREFIX);
}

function previousWorkday(today: LocalDate): LocalDate {
  const [year, month, day] = today.split("-").map(Number);
  const date = new Date(year!, month! - 1, day!);

  do {
    date.setDate(date.getDate() - 1);
  } while (date.getDay() === 0 || date.getDay() === 6);

  return toLocalDate(date);
}

const fixtureJob: Job = jobSchema.parse({
  id: DEV_FIXTURE_JOB_ID,
  name: "I-40 Utility Relocation",
  cityLabel: "Raleigh, NC",
  defaults: {
    location:
      "I-40 utility relocation - EB shoulder near Exit 285, Raleigh, NC",
    personInCharge: "Miguel Rodriguez",
    closestEmergencyCentre: "WakeMed Raleigh Campus - 3000 New Bern Ave",
    emergencyNumber: "911 / Site safety: (919) 555-0182",
    musterPoint: "North parking lot, gate 3",
    workOrderPermit: "WO-88213 / Permit E-4471",
    jhaProcedureNumbers: "JHA-2026-0147, SOP-114, ITS-EXC-09",
  },
  roster: [
    { id: `${DEV_FIXTURE_PREFIX}worker:miguel`, name: "Miguel Rodriguez" },
    { id: `${DEV_FIXTURE_PREFIX}worker:jordan`, name: "Jordan Reed" },
    { id: `${DEV_FIXTURE_PREFIX}worker:sam`, name: "Sam Patel" },
    { id: `${DEV_FIXTURE_PREFIX}worker:chris`, name: "Chris Boone" },
    { id: `${DEV_FIXTURE_PREFIX}worker:tony`, name: "Tony Nguyen" },
    { id: `${DEV_FIXTURE_PREFIX}worker:derrick`, name: "Derrick Hall" },
    { id: `${DEV_FIXTURE_PREFIX}worker:luis`, name: "Luis Ortega" },
    { id: `${DEV_FIXTURE_PREFIX}worker:aaron`, name: "Aaron Webb" },
  ],
  defaultPersonInChargeWorkerId: `${DEV_FIXTURE_PREFIX}worker:miguel`,
});

export function shouldCreateDevSourceAha(
  hasRecordWithSourceId: boolean,
  hasRecordForJobDate: boolean,
): boolean {
  return !hasRecordWithSourceId && !hasRecordForJobDate;
}

function errorName(error: unknown): string | null {
  return typeof error === "object" &&
    error !== null &&
    "name" in error &&
    typeof error.name === "string"
    ? error.name
    : null;
}

function isConfirmedConstraintError(error: unknown): boolean {
  if (errorName(error) === "ConstraintError") return true;
  if (errorName(error) !== "AbortError") return false;
  if (typeof error !== "object" || error === null || !("inner" in error)) {
    return false;
  }
  return errorName(error.inner) === "ConstraintError";
}

export async function ignoreConfirmedConstraint(
  operation: () => Promise<void>,
  constraintNowExists: () => Promise<boolean>,
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    if (!isConfirmedConstraintError(error) || !(await constraintNowExists())) {
      throw error;
    }
  }
}

export async function ensureDevFixture(
  database: typeof ahaDatabase,
  today: LocalDate,
): Promise<void> {
  const sourceDate = previousWorkday(today);
  const sourceAhaId = `${DEV_FIXTURE_PREFIX}aha:${sourceDate}`;

  await ignoreConfirmedConstraint(
    () =>
      database.transaction("rw", database.jobs, async () => {
        if (!(await database.jobs.get(fixtureJob.id))) {
          await database.jobs.add(fixtureJob);
        }
      }),
    async () => Boolean(await database.jobs.get(fixtureJob.id)),
  );

  await ignoreConfirmedConstraint(
    () =>
      database.transaction(
        "rw",
        database.ahas,
        database.draftMetadata,
        async () => {
          const [existingById, existingByJobDate] = await Promise.all([
            database.ahas.get(sourceAhaId),
            database.ahas
              .where("[jobId+date]")
              .equals([fixtureJob.id, sourceDate])
              .first(),
          ]);
          if (
            shouldCreateDevSourceAha(
              Boolean(existingById),
              Boolean(existingByJobDate),
            )
          ) {
            let generatedId = 0;
            const completedAt = `${sourceDate}T17:00:00.000Z`;
            const blank = createBlankAha(fixtureJob, sourceDate, {
              createId: () =>
                generatedId++ === 0
                  ? sourceAhaId
                  : `${DEV_FIXTURE_PREFIX}task:${sourceDate}:${generatedId}`,
              now: () => new Date(completedAt),
            });

            const sourceAha = ahaSchema.parse({
              ...blank,
              status: "completed",
              header: { ...blank.header, rescuePlanRequired: true },
              description:
                "Excavation and directional bore for fiber conduit relocation along the eastbound shoulder; potholing existing utilities; loading and hauling spoils.",
              meetingNotes:
                "Reviewed lane closure timing and coordinated truck access with the adjacent paving crew.",
              tasks: [
                {
                  id: `${DEV_FIXTURE_PREFIX}task:excavation`,
                  task: "Excavation around existing utility",
                  hazards: "Mobile equipment, cave-in, slips/trips",
                  controls:
                    "Locates verified and marked. Spotter for all digging. Trench box below 5 ft. Daily excavation inspection.",
                },
                {
                  id: `${DEV_FIXTURE_PREFIX}task:bore`,
                  task: "Directional bore under roadway",
                  hazards: "Rotating equipment, pinch points, traffic",
                  controls:
                    "Guards in place. No loose clothing near rotating parts. Work zone signage and flagger per traffic control plan.",
                },
                {
                  id: `${DEV_FIXTURE_PREFIX}task:spoils`,
                  task: "Loading spoils",
                  hazards: "Mobile equipment, overhead load",
                  controls:
                    "Never under a suspended load. Spotter when trucks reverse. Loads covered before leaving site.",
                },
              ],
              energySelections: [
                {
                  category: "Gravity",
                  examples: [
                    "Excavation cave-in",
                    "Falling or sliding materials/objects",
                    "Slips/trips/falls",
                  ],
                },
                {
                  category: "Motion",
                  examples: [
                    "Wind",
                    "Ergonomics",
                    "Vehicles/vessels/mobile equipment",
                  ],
                },
                {
                  category: "Mechanical",
                  examples: [
                    "Tool/equipment nip points/pinch points",
                    "Rotating equipment",
                  ],
                },
              ],
              safetyCheck: "yes",
              completedAt,
            });

            await database.ahas.add(sourceAha);
            await database.draftMetadata.put(
              createBlankDraftMetadata(sourceAha.id),
            );
          }
        },
      ),
    async () =>
      Boolean(
        (await database.ahas.get(sourceAhaId)) ??
        (await database.ahas
          .where("[jobId+date]")
          .equals([fixtureJob.id, sourceDate])
          .first()),
      ),
  );

  await ignoreConfirmedConstraint(
    () =>
      database.transaction("rw", database.settings, async () => {
        const activeSetting = await database.settings.get(ACTIVE_JOB_SETTING);
        if (!activeSetting) {
          const setting: AppSetting = {
            key: ACTIVE_JOB_SETTING,
            value: fixtureJob.id,
          };
          await database.settings.add(setting);
        }
      }),
    async () => Boolean(await database.settings.get(ACTIVE_JOB_SETTING)),
  );
}
