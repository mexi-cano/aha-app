import assert from "node:assert/strict";
import test from "node:test";

import {
  ENERGY_CATEGORIES,
  addCrewMember,
  addLateSignedCrewMember,
  addSignedCrewMember,
  applyInProgressEditRules,
  applyAhaMutationRules,
  beginSigning,
  canFinishAha,
  canStartSigning,
  completeAha,
  createBlankAha,
  getEditorSectionReadiness,
  getReviewReport,
  jobSchema,
  recordSignature,
  removeCrewMember,
  renameCrewMember,
  toggleEnergyCategory,
  toggleEnergyExample,
  type Aha,
  type Job,
} from "../src/index";

const job: Job = jobSchema.parse({
  id: "job-1",
  name: "Test job",
  cityLabel: "Raleigh, NC",
  defaults: {
    location: "Site",
    personInCharge: "Crew lead",
    closestEmergencyCentre: "Hospital",
    emergencyNumber: "911",
    musterPoint: "Gate 3",
    workOrderPermit: "",
    jhaProcedureNumbers: "",
  },
  roster: [
    { id: "worker-1", name: "Crew lead" },
    { id: "worker-2", name: "Jordan Reed" },
  ],
});

const png =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ";
const replacementPng =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAAAfFcSJ";

function dependencies() {
  let next = 0;
  return {
    createId: () => `id-${next++}`,
    now: () => new Date("2026-08-18T12:00:00.000Z"),
  };
}

function reviewReadyAha(): Aha {
  const blank = createBlankAha(job, "2026-08-18", dependencies());
  return {
    ...blank,
    header: { ...blank.header, rescuePlanRequired: false },
    description: "Excavate and install conduit.",
    safetyCheck: "yes",
  };
}

function completedAha(): Aha {
  let aha = beginSigning(reviewReadyAha());
  aha = recordSignature(
    aha,
    "worker-1",
    png,
    new Date("2026-08-18T12:30:00.000Z"),
  );
  aha = recordSignature(
    aha,
    "worker-2",
    png,
    new Date("2026-08-18T12:31:00.000Z"),
  );
  return completeAha(aha, new Date("2026-08-18T13:00:00.000Z"));
}

test("energy toggles preserve canonical category and example order", () => {
  let aha = reviewReadyAha();
  aha = toggleEnergyCategory(aha, "Sound");
  aha = toggleEnergyExample(aha, "Gravity", "Working at heights");
  aha = toggleEnergyExample(aha, "Gravity", "Excavation cave-in");

  assert.deepEqual(
    aha.energySelections.map(({ category }) => category),
    ["Gravity", "Sound"],
  );
  assert.deepEqual(aha.energySelections[0]?.examples, [
    "Excavation cave-in",
    "Working at heights",
  ]);

  aha = toggleEnergyExample(aha, "Gravity", "Excavation cave-in");
  assert.deepEqual(aha.energySelections[0]?.examples, ["Working at heights"]);

  aha = toggleEnergyCategory(aha, "Gravity");
  assert.deepEqual(aha.energySelections, [{ category: "Sound", examples: [] }]);
  assert.throws(
    () => toggleEnergyExample(aha, "Sound", "Made up"),
    /Non-canonical Sound example/,
  );
});

test("Review reports every blocker and optional warning without inventing counts", () => {
  const blank = createBlankAha(
    { ...job, roster: [] },
    "2026-08-18",
    dependencies(),
  );
  const withIncompleteTask: Aha = {
    ...blank,
    header: {
      ...blank.header,
      location: "",
      personInCharge: "",
      closestEmergencyCentre: "",
      emergencyNumber: "",
      musterPoint: "",
    },
    tasks: [{ id: "task-1", task: "", hazards: "", controls: "" }],
  };

  const report = getReviewReport(withIncompleteTask);
  assert.deepEqual(
    new Set(report.mustFix.map(({ code }) => code)),
    new Set([
      "safety_check",
      "rescue_plan",
      "location",
      "person_in_charge",
      "emergency_centre",
      "emergency_number",
      "muster_point",
      "description",
      "task_name",
      "task_hazards",
      "task_controls",
      "crew_empty",
    ]),
  );
  assert.deepEqual(
    report.warnings.map(({ code }) => code),
    ["work_order_permit", "jha_procedures", "meeting_notes"],
  );
  assert.equal(report.information[0]?.count, 1);
  assert.equal(report.information[1]?.count, 0);
  assert.equal(report.canStartSigning, false);
});

test("Not applicable suppresses only its advisory warning", () => {
  const aha: Aha = {
    ...reviewReadyAha(),
    notApplicable: {
      workOrderPermit: true,
      jhaProcedureNumbers: false,
      meetingNotes: true,
    },
  };
  const report = getReviewReport(aha);
  assert.deepEqual(
    report.warnings.map(({ code }) => code),
    ["jha_procedures"],
  );
  assert.equal(report.canStartSigning, true);
  assert.equal(canStartSigning(aha), true);
  assert.deepEqual(getEditorSectionReadiness(aha), {
    details: true,
    work: true,
    energy: true,
    review: true,
  });
});

test("entered optional values clear warnings without changing signing readiness", () => {
  const blankOptionals = reviewReadyAha();
  const initialReport = getReviewReport(blankOptionals);
  assert.deepEqual(
    initialReport.warnings.map(({ code }) => code),
    ["work_order_permit", "jha_procedures", "meeting_notes"],
  );
  assert.equal(initialReport.canStartSigning, true);

  const filledOptionals: Aha = {
    ...blankOptionals,
    header: {
      ...blankOptionals.header,
      workOrderPermit: "WO-100",
      jhaProcedureNumbers: "JHA-200",
    },
    meetingNotes: "Reviewed site access.",
  };
  const filledReport = getReviewReport(filledOptionals);
  assert.deepEqual(filledReport.warnings, []);
  assert.equal(filledReport.canStartSigning, true);
});

test("zero tasks and zero energy categories are not invented blockers", () => {
  const aha = reviewReadyAha();
  assert.equal(aha.tasks.length, 0);
  assert.equal(aha.energySelections.length, 0);
  assert.equal(canStartSigning(aha), true);
});

test("whitespace-only task fields are missing while complete tasks are ready", () => {
  const aha: Aha = {
    ...reviewReadyAha(),
    tasks: [
      {
        id: "task-complete",
        task: "Excavate trench",
        hazards: "Cave-in",
        controls: "Shoring",
      },
      {
        id: "task-incomplete",
        task: "   ",
        hazards: "\n",
        controls: "\t",
      },
    ],
  };

  const taskIssues = getReviewReport(aha).mustFix.filter(
    ({ target }) => target.section === "task",
  );
  assert.deepEqual(
    taskIssues.map(({ code }) => code),
    ["task_name", "task_hazards", "task_controls"],
  );
  assert.ok(
    taskIssues.every(
      ({ target }) =>
        target.section === "task" && target.taskId === "task-incomplete",
    ),
  );
});

test("mid-signing safety-sensitive edits clear only the safety answer", () => {
  const signed = recordSignature(
    beginSigning(reviewReadyAha()),
    "worker-1",
    png,
    new Date("2026-08-18T12:30:00.000Z"),
  );
  const changedDescription = applyInProgressEditRules(signed, {
    ...signed,
    description: "Changed work",
  });
  assert.equal(changedDescription.safetyCheck, null);
  assert.equal(changedDescription.crew[0]?.signaturePng, png);

  const changedMeetingNotes = applyInProgressEditRules(signed, {
    ...signed,
    meetingNotes: "Notes changed",
  });
  assert.equal(changedMeetingNotes.safetyCheck, "yes");

  const changedCrew = applyInProgressEditRules(
    signed,
    addCrewMember(signed, { id: "worker-3", name: "Sam Patel" }),
  );
  assert.equal(changedCrew.safetyCheck, "yes");

  const changedEnergy = applyInProgressEditRules(
    signed,
    toggleEnergyCategory(signed, ENERGY_CATEGORIES[0].category),
  );
  assert.equal(changedEnergy.safetyCheck, null);
});

test("document revision changes only with PDF-visible source data", () => {
  const current = reviewReadyAha();
  const statusOnly = applyAhaMutationRules(current, {
    ...current,
    status: "in_progress",
  });
  assert.equal(statusOnly.documentRevision, current.documentRevision);

  const changedNotes = applyAhaMutationRules(current, {
    ...current,
    meetingNotes: "New meeting note",
  });
  assert.equal(changedNotes.documentRevision, current.documentRevision + 1);

  const timestampOnly = applyAhaMutationRules(current, {
    ...current,
    updatedAfterCompletionAt: ["2026-08-18T15:00:00.000Z"],
  });
  assert.equal(timestampOnly.documentRevision, current.documentRevision);
});

test("completed updates group timestamps, reset only the safety gate, and retain signatures", () => {
  const completed = completedAha();
  const firstUpdateAt = new Date("2026-08-18T14:00:00.000Z");
  const changedDescription = applyAhaMutationRules(
    completed,
    { ...completed, description: "Changed completed work" },
    { recordCompletedUpdateAt: firstUpdateAt },
  );
  assert.equal(changedDescription.safetyCheck, null);
  assert.deepEqual(
    changedDescription.crew.map(({ signaturePng }) => signaturePng),
    completed.crew.map(({ signaturePng }) => signaturePng),
  );
  assert.deepEqual(changedDescription.updatedAfterCompletionAt, [
    firstUpdateAt.toISOString(),
  ]);

  const notesChange = applyAhaMutationRules(changedDescription, {
    ...changedDescription,
    meetingNotes: "Updated notes",
  });
  assert.equal(notesChange.safetyCheck, null);
  assert.deepEqual(notesChange.updatedAfterCompletionAt, [
    firstUpdateAt.toISOString(),
  ]);

  const newGate = applyAhaMutationRules(notesChange, {
    ...notesChange,
    safetyCheck: "yes",
  });
  const headerChange = applyAhaMutationRules(newGate, {
    ...newGate,
    header: { ...newGate.header, location: "Updated location" },
  });
  assert.equal(headerChange.safetyCheck, "yes");
});

test("late worker signing preserves completion and does not create an Updated chip timestamp", () => {
  const completed = completedAha();
  const late = applyAhaMutationRules(
    completed,
    addLateSignedCrewMember(
      completed,
      { id: "worker-late", name: "Late Worker" },
      replacementPng,
      new Date("2026-08-18T14:15:00.000Z"),
    ),
    { recordCompletedUpdateAt: new Date("2026-08-18T14:15:00.000Z") },
  );
  assert.equal(late.completedAt, completed.completedAt);
  assert.equal(late.safetyCheck, completed.safetyCheck);
  assert.deepEqual(late.updatedAfterCompletionAt, []);
  assert.equal(late.documentRevision, completed.documentRevision + 1);
  assert.equal(late.crew.length, completed.crew.length + 1);
  assert.deepEqual(late.crew.slice(0, completed.crew.length), completed.crew);
});

test("crew mutations are AHA-local, trim names, and clear renamed signatures", () => {
  const aha = reviewReadyAha();
  const added = addCrewMember(aha, { id: "worker-3", name: "  Sam Patel  " });
  assert.equal(added.crew[2]?.name, "Sam Patel");
  assert.equal(job.roster.length, 2);
  assert.equal(
    addCrewMember(added, { id: "worker-3", name: "Duplicate tap" }),
    added,
  );

  const signed = recordSignature(
    beginSigning(added),
    "worker-3",
    png,
    new Date("2026-08-18T12:30:00.000Z"),
  );
  const renamed = renameCrewMember(signed, "worker-3", "  Samuel Patel  ");
  assert.equal(renamed.crew[2]?.name, "Samuel Patel");
  assert.equal(renamed.crew[2]?.signaturePng, null);
  assert.equal(renamed.crew[2]?.signedAt, null);
  assert.equal(removeCrewMember(renamed, "worker-3").crew.length, 2);

  const removedWhileSigned = removeCrewMember(signed, "worker-3");
  assert.equal(
    removedWhileSigned.crew.some(({ workerId }) => workerId === "worker-3"),
    false,
  );
});

test("the eleventh crew member is rejected without changing the AHA", () => {
  let aha: Aha = { ...reviewReadyAha(), crew: [] };
  for (let index = 0; index < 10; index += 1) {
    aha = addCrewMember(aha, {
      id: `worker-${index}`,
      name: `Worker ${index}`,
    });
  }
  assert.throws(
    () => addCrewMember(aha, { id: "worker-11", name: "Worker 11" }),
    /already has 10 signature slots/,
  );
  assert.equal(aha.crew.length, 10);
});

test("signing and completion transitions revalidate every invariant", () => {
  let aha = beginSigning(reviewReadyAha());
  assert.equal(aha.status, "in_progress");
  assert.equal(canFinishAha(aha), false);
  assert.throws(
    () => completeAha(aha, new Date()),
    /Every crew member must sign/,
  );

  aha = recordSignature(
    aha,
    "worker-1",
    png,
    new Date("2026-08-18T12:30:00.000Z"),
  );
  aha = recordSignature(
    aha,
    "worker-2",
    png,
    new Date("2026-08-18T12:31:00.000Z"),
  );
  assert.equal(canFinishAha(aha), true);

  const completed = completeAha(aha, new Date("2026-08-18T13:00:00.000Z"));
  assert.equal(completed.status, "completed");
  assert.equal(completed.completedAt, "2026-08-18T13:00:00.000Z");
  assert.throws(
    () => beginSigning(completed),
    /completed AHA cannot enter signing mode/,
  );
  assert.equal(canStartSigning(completed), false);
  assert.equal(canFinishAha({ ...completed, status: "draft" }), false);
});

test("signature recording requires active, still-valid signing mode", () => {
  const draft = reviewReadyAha();
  assert.throws(
    () => recordSignature(draft, "worker-1", png, new Date()),
    /Signing mode must be active/,
  );

  const started = beginSigning(draft);
  const invalidated = applyInProgressEditRules(started, {
    ...started,
    description: "Changed after signing started",
  });
  assert.equal(invalidated.safetyCheck, null);
  assert.throws(
    () => recordSignature(invalidated, "worker-1", png, new Date()),
    /Review items must be fixed before recording/,
  );
  assert.throws(
    () => completeAha(invalidated, new Date()),
    /Every crew member must sign/,
  );
});

test("re-signing replaces only the selected worker's image and timestamp", () => {
  let aha = beginSigning(reviewReadyAha());
  aha = recordSignature(
    aha,
    "worker-1",
    png,
    new Date("2026-08-18T12:30:00.000Z"),
  );
  const replaced = recordSignature(
    aha,
    "worker-1",
    replacementPng,
    new Date("2026-08-18T12:45:00.000Z"),
  );

  assert.equal(replaced.crew.length, aha.crew.length);
  assert.equal(replaced.crew[0]?.signaturePng, replacementPng);
  assert.equal(replaced.crew[0]?.signedAt, "2026-08-18T12:45:00.000Z");
  assert.equal(replaced.crew[1], aha.crew[1]);
  assert.throws(
    () =>
      recordSignature(aha, "worker-1", "data:image/png;base64,", new Date()),
    /PNG signature is required/,
  );
});

test("adding a worker and signature is atomic at the domain boundary", () => {
  const started = beginSigning(reviewReadyAha());
  assert.throws(
    () =>
      addSignedCrewMember(
        started,
        { id: "worker-3", name: "Sam Patel" },
        "not-a-png",
        new Date(),
      ),
    /PNG signature is required/,
  );
  assert.equal(started.crew.length, 2);

  const added = addSignedCrewMember(
    started,
    { id: "worker-3", name: "  Sam Patel  " },
    png,
    new Date("2026-08-18T12:45:00.000Z"),
  );
  assert.equal(added.crew.length, 3);
  assert.equal(added.crew[2]?.name, "Sam Patel");
  assert.equal(added.crew[2]?.signaturePng, png);
  assert.equal(added.crew[2]?.signedAt, "2026-08-18T12:45:00.000Z");
});

test("completed AHAs reject every crew mutation without changing data", () => {
  let signed = beginSigning(reviewReadyAha());
  signed = recordSignature(
    signed,
    "worker-1",
    png,
    new Date("2026-08-18T12:30:00.000Z"),
  );
  signed = recordSignature(
    signed,
    "worker-2",
    png,
    new Date("2026-08-18T12:31:00.000Z"),
  );
  const completed = completeAha(signed, new Date("2026-08-18T13:00:00.000Z"));

  assert.throws(
    () => addCrewMember(completed, { id: "worker-3", name: "Sam Patel" }),
    /completed AHA cannot change its crew/,
  );
  assert.throws(
    () => removeCrewMember(completed, "worker-1"),
    /completed AHA cannot change its crew/,
  );
  assert.throws(
    () => renameCrewMember(completed, "worker-1", "New name"),
    /completed AHA cannot change its crew/,
  );
  assert.deepEqual(completed.crew, signed.crew);
});
