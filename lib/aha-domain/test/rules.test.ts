import assert from "node:assert/strict";
import test from "node:test";

import {
  ENERGY_CATEGORIES,
  MAX_CREW_MEMBERS,
  MAX_TASKS,
  SAFETY_GATE_INSTRUCTION,
  SAFETY_GATE_QUESTION,
  WORKER_ACKNOWLEDGMENT,
  ahaSchema,
  canAddTask,
  copyAhaForNewDay,
  createBlankAha,
  getHomeState,
  jobSchema,
  localDateSchema,
  parseStoredAha,
  parseStoredJob,
  planStartToday,
  selectMostRecentAha,
  toLocalDate,
  type Aha,
  type Job,
} from "../src/index";

const job: Job = jobSchema.parse({
  id: "job-1",
  name: "I-40 Utility Relocation",
  cityLabel: "Raleigh, NC",
  defaults: {
    location: "Raleigh work site",
    personInCharge: "Miguel Rodriguez",
    closestEmergencyCentre: "WakeMed Raleigh Campus",
    emergencyNumber: "911",
    musterPoint: "North parking lot",
    workOrderPermit: "WO-88213",
    jhaProcedureNumbers: "JHA-2026-0147",
  },
  roster: [
    { id: "worker-1", name: "Miguel Rodriguez" },
    { id: "worker-2", name: "Jordan Reed" },
  ],
});

function dependencies(ids: string[]) {
  let index = 0;
  return {
    createId: () => ids[index++] ?? `generated-${index}`,
    now: () => new Date("2026-08-17T12:00:00.000Z"),
  };
}

function previousAha(): Aha {
  const blank = createBlankAha(job, "2026-08-14", dependencies(["aha-friday"]));

  return ahaSchema.parse({
    ...blank,
    status: "completed",
    header: { ...blank.header, rescuePlanRequired: true },
    description: "Excavation and directional bore",
    meetingNotes: "Coordinate truck access.",
    notApplicable: {
      workOrderPermit: true,
      jhaProcedureNumbers: true,
      meetingNotes: true,
    },
    tasks: [
      {
        id: "old-task",
        task: "Excavation around existing utility",
        hazards: "Mobile equipment, cave-in, slips/trips",
        controls: "Locates verified and marked.",
      },
    ],
    energySelections: [
      {
        category: "Pressure",
        examples: ["Pressure relief systems"],
      },
      {
        category: "Sound",
        examples: ["Pressure relief systems"],
      },
    ],
    safetyCheck: "yes",
    crew: blank.crew.map((member) => ({
      ...member,
      signaturePng: "data:image/png;base64,signature",
      signedAt: "2026-08-14T12:30:00.000Z",
    })),
    completedAt: "2026-08-14T13:00:00.000Z",
    updatedAfterCompletionAt: ["2026-08-14T14:00:00.000Z"],
    sync: {
      savedLocallyAt: "2026-08-14T14:00:00.000Z",
      backedUpAt: "2026-08-14T14:01:00.000Z",
    },
  });
}

test("canonical form strings remain exact and ordered", () => {
  assert.equal(ENERGY_CATEGORIES.length, 11);
  assert.equal(ENERGY_CATEGORIES[0].category, "Gravity");
  assert.equal(ENERGY_CATEGORIES[10].category, "Human factors");
  assert.deepEqual(ENERGY_CATEGORIES[0].examples, [
    "Excavation cave-in",
    "Falling or sliding materials/objects",
    "Slips/trips/falls",
    "Working at heights",
  ]);
  assert.ok(ENERGY_CATEGORIES[4].examples.includes("Pressure relief systems"));
  assert.ok(ENERGY_CATEGORIES[5].examples.includes("Pressure relief systems"));
  assert.equal(
    WORKER_ACKNOWLEDGMENT,
    "I have reviewed all applicable documentation, site hazards, and my responsibilities to follow safe work plans to protect myself and others while on site.",
  );
  assert.equal(
    SAFETY_GATE_QUESTION,
    "Have all known hazards been identified and addressed using the Energy Wheel?",
  );
  assert.equal(
    SAFETY_GATE_INSTRUCTION,
    'Do not proceed until you can answer "yes"',
  );
});

test("AHA validation rejects non-canonical energy examples and date drift", () => {
  const aha = previousAha();

  assert.throws(() =>
    ahaSchema.parse({
      ...aha,
      energySelections: [{ category: "Gravity", examples: ["Made up"] }],
    }),
  );
  assert.throws(() =>
    ahaSchema.parse({
      ...aha,
      header: { ...aha.header, date: "2026-08-13" },
    }),
  );
  assert.throws(() =>
    ahaSchema.parse({
      ...aha,
      energySelections: [
        { category: "Sound", examples: [] },
        { category: "Pressure", examples: [] },
      ],
    }),
  );
  assert.throws(() =>
    ahaSchema.parse({
      ...aha,
      energySelections: [
        {
          category: "Gravity",
          examples: ["Working at heights", "Excavation cave-in"],
        },
      ],
    }),
  );
  assert.throws(() =>
    ahaSchema.parse({
      ...aha,
      tasks: [aha.tasks[0], aha.tasks[0]],
    }),
  );
  assert.throws(() =>
    ahaSchema.parse({
      ...aha,
      crew: [aha.crew[0], aha.crew[0]],
    }),
  );
  assert.throws(() => localDateSchema.parse("2026-02-30"));
});

test("corrupt saved records fail safely without exposing validation internals", () => {
  assert.throws(
    () => parseStoredAha({ id: "damaged" }),
    (error) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /local data has not been changed/);
      assert.ok(error.cause);
      return true;
    },
  );
});

test("signature pairing validation identifies the timestamp field", () => {
  const result = ahaSchema.safeParse({
    ...previousAha(),
    crew: [
      {
        workerId: "worker-1",
        name: "Miguel Rodriguez",
        signaturePng: "data:image/png;base64,signature",
        signedAt: null,
      },
    ],
  });

  assert.equal(result.success, false);
  if (!result.success) {
    assert.deepEqual(result.error.issues[0]?.path, ["crew", 0, "signedAt"]);
  }
});

test("blank first-day AHA uses job defaults and unsigned roster", () => {
  const aha = createBlankAha(job, "2026-08-17", dependencies(["new-aha"]));

  assert.equal(aha.id, "new-aha");
  assert.equal(aha.header.location, job.defaults.location);
  assert.equal(aha.header.date, "2026-08-17");
  assert.equal(aha.header.rescuePlanRequired, null);
  assert.equal(aha.personInChargeWorkerId, "worker-1");
  assert.deepEqual(aha.tasks, []);
  assert.deepEqual(
    aha.crew.map(({ workerId, signaturePng, signedAt }) => ({
      workerId,
      signaturePng,
      signedAt,
    })),
    [
      { workerId: "worker-1", signaturePng: null, signedAt: null },
      { workerId: "worker-2", signaturePng: null, signedAt: null },
    ],
  );
});

test("blank AHAs honor an explicit stored Person-in-charge worker ID", () => {
  const explicitlyAssignedJob = jobSchema.parse({
    ...job,
    defaultPersonInChargeWorkerId: "worker-2",
  });
  const aha = createBlankAha(
    explicitlyAssignedJob,
    "2026-08-17",
    dependencies(["explicit-person-in-charge"]),
  );
  assert.equal(aha.personInChargeWorkerId, "worker-2");
  assert.equal(
    parseStoredJob(explicitlyAssignedJob).defaultPersonInChargeWorkerId,
    "worker-2",
  );
});

test("Monday copy carries work forward but resets daily and signature state", () => {
  const previous = previousAha();
  const copied = copyAhaForNewDay(
    job,
    previous,
    "2026-08-17",
    dependencies(["monday-aha", "monday-task"]),
  );

  assert.equal(copied.id, "monday-aha");
  assert.equal(copied.date, "2026-08-17");
  assert.equal(copied.header.date, copied.date);
  assert.equal(copied.header.rescuePlanRequired, true);
  assert.equal(copied.personInChargeWorkerId, previous.personInChargeWorkerId);
  assert.equal(copied.description, previous.description);
  assert.equal(copied.meetingNotes, previous.meetingNotes);
  assert.equal(copied.tasks[0]?.id, "monday-task");
  assert.deepEqual(copied.energySelections, previous.energySelections);
  assert.equal(copied.safetyCheck, null);
  assert.equal(copied.completedAt, null);
  assert.deepEqual(copied.updatedAfterCompletionAt, []);
  assert.equal(copied.sync.backedUpAt, null);
  assert.deepEqual(copied.notApplicable, {
    workOrderPermit: false,
    jhaProcedureNumbers: false,
    meetingNotes: false,
  });
  assert.ok(
    copied.crew.every(
      ({ signaturePng, signedAt }) =>
        signaturePng === null && signedAt === null,
    ),
  );

  copied.tasks[0]!.controls = "Changed Monday";
  copied.energySelections[0]!.examples.length = 0;
  assert.notEqual(copied.tasks[0]!.controls, previous.tasks[0]!.controls);
  assert.equal(previous.energySelections[0]!.examples.length, 1);
});

test("stored AHA person-in-charge associations migrate without guessing duplicates", () => {
  const current = previousAha();
  assert.equal(
    parseStoredAha({
      ...current,
      personInChargeWorkerId: "worker-2",
    }).personInChargeWorkerId,
    "worker-2",
  );
  const { personInChargeWorkerId: _association, ...legacy } = current;
  assert.equal(parseStoredAha(legacy).personInChargeWorkerId, "worker-1");

  const duplicatedLegacy = {
    ...legacy,
    crew: legacy.crew.map((member) => ({
      ...member,
      name: "Miguel Rodriguez",
    })),
  };
  assert.equal(parseStoredAha(duplicatedLegacy).personInChargeWorkerId, null);

  assert.equal(
    parseStoredAha({
      ...current,
      personInChargeWorkerId: "missing-worker",
    }).personInChargeWorkerId,
    null,
  );
  assert.equal(
    parseStoredAha({
      ...current,
      personInChargeWorkerId: null,
    }).personInChargeWorkerId,
    null,
  );
});

test("legacy jobs infer only an unambiguous default Person in charge", () => {
  const legacy = {
    ...job,
    defaults: { ...job.defaults, personInCharge: "Miguel Rodriguez" },
  } as Record<string, unknown>;
  delete legacy.defaultPersonInChargeWorkerId;
  assert.equal(
    parseStoredJob(legacy).defaultPersonInChargeWorkerId,
    "worker-1",
  );

  const duplicate = {
    ...legacy,
    roster: [
      { id: "worker-1", name: "Miguel Rodriguez" },
      { id: "worker-3", name: "Miguel Rodriguez" },
    ],
  };
  assert.equal(parseStoredJob(duplicate).defaultPersonInChargeWorkerId, null);
});

test("most recent selection respects jobs, gaps, and today boundary", () => {
  const friday = previousAha();
  const withDate = (id: string, date: string) =>
    ahaSchema.parse({
      ...friday,
      id,
      date,
      header: { ...friday.header, date },
    });
  const thursday = withDate("thursday", "2026-08-13");
  const otherJob = ahaSchema.parse({
    ...friday,
    id: "other",
    jobId: "job-2",
  });
  const today = withDate("today", "2026-08-17");

  assert.equal(
    selectMostRecentAha(
      [thursday, otherJob, today, friday],
      job.id,
      "2026-08-17",
    )?.id,
    friday.id,
  );
});

test("start-today planning is blank on day one and idempotent after creation", () => {
  const first = planStartToday(
    null,
    job,
    [],
    "2026-08-17",
    dependencies(["today"]),
  );
  assert.equal(first.created, true);
  assert.equal(first.copiedFromId, null);
  assert.deepEqual(first.aha.tasks, []);

  const duplicate = planStartToday(
    first.aha,
    job,
    [first.aha],
    "2026-08-17",
    dependencies(["unused"]),
  );
  assert.equal(duplicate.created, false);
  assert.equal(duplicate.aha, first.aha);
});

test("start-today planning copies the newest prior job record across a gap", () => {
  const friday = previousAha();
  const planned = planStartToday(
    null,
    job,
    [friday],
    "2026-08-20",
    dependencies(["thursday", "new-task"]),
  );
  assert.equal(planned.copiedFromId, friday.id);
  assert.equal(planned.copiedFromDate, friday.date);
  assert.equal(planned.aha.id, "thursday");
  assert.equal(planned.aha.tasks[0]?.id, "new-task");
});

test("job and date guards reject unsafe copy and duplicate-start inputs", () => {
  const existing = previousAha();
  const otherJob = jobSchema.parse({ ...job, id: "job-2" });

  assert.throws(
    () =>
      planStartToday(existing, otherJob, [], existing.date, dependencies([])),
    /does not match this job and date/,
  );
  assert.throws(
    () => planStartToday(existing, job, [], "2026-08-15", dependencies([])),
    /does not match this job and date/,
  );
  assert.throws(
    () => copyAhaForNewDay(otherJob, existing, "2026-08-17", dependencies([])),
    /different job/,
  );
});

test("AHA schema rejects task and crew counts above their ceilings", () => {
  const aha = previousAha();
  const task = aha.tasks[0]!;
  const crewMember = aha.crew[0]!;

  assert.throws(() =>
    ahaSchema.parse({
      ...aha,
      tasks: Array.from({ length: MAX_TASKS + 1 }, (_, index) => ({
        ...task,
        id: `task-${index}`,
      })),
    }),
  );
  assert.throws(() =>
    ahaSchema.parse({
      ...aha,
      crew: Array.from({ length: MAX_CREW_MEMBERS + 1 }, (_, index) => ({
        ...crewMember,
        workerId: `worker-${index}`,
      })),
    }),
  );
});

test("home state and task-cap rules cover every Phase 1 state", () => {
  const aha = previousAha();
  assert.equal(getHomeState(null), "not_started");
  assert.equal(getHomeState({ ...aha, status: "draft" }), "draft");
  assert.equal(getHomeState({ ...aha, status: "in_progress" }), "in_progress");
  assert.equal(getHomeState({ ...aha, status: "completed" }), "completed");

  assert.equal(canAddTask({ ...aha, tasks: [] }), true);
  assert.equal(
    canAddTask({
      ...aha,
      tasks: Array.from({ length: MAX_TASKS }, (_, index) => ({
        id: String(index),
        task: "",
        hazards: "",
        controls: "",
      })),
    }),
    false,
  );
});

test("local date formatting does not roll through UTC", () => {
  assert.equal(toLocalDate(new Date(2026, 7, 17, 23, 59, 59)), "2026-08-17");
  assert.equal(toLocalDate(new Date(2026, 7, 18, 0, 0, 0)), "2026-08-18");
});
