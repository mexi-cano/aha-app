import assert from "node:assert/strict";
import test from "node:test";

import {
  buildJobConfiguration,
  createEmptyJobSetupDraft,
  getVisibleJobSetupIssues,
  parseJobSetupDraft,
  validateJobSetup,
} from "../features/job-setup";

test("setup errors stay hidden until Save and then clear as fields are fixed", () => {
  const empty = createEmptyJobSetupDraft();
  assert.deepEqual(getVisibleJobSetupIssues(empty, false), []);
  assert.equal(getVisibleJobSetupIssues(empty, true)[0]?.field, "name");

  const corrected = requiredDraft();
  assert.deepEqual(getVisibleJobSetupIssues(corrected, true), []);
});

function requiredDraft() {
  return {
    ...createEmptyJobSetupDraft(),
    name: "North Pump Station",
    cityLabel: "Raleigh, NC",
    location: "North gate",
    closestEmergencyCentre: "WakeMed",
    emergencyNumber: "911",
    musterPoint: "Visitor parking",
    customPersonInCharge: "Alex Morgan",
  };
}

test("job setup permits an empty roster with an explicit Person in charge", () => {
  const draft = requiredDraft();
  assert.deepEqual(validateJobSetup(draft), []);
  const job = buildJobConfiguration(draft);
  assert.deepEqual(job.roster, []);
  assert.equal(job.defaults.personInCharge, "Alex Morgan");
  assert.equal(job.defaultPersonInChargeWorkerId, null);
});

test("duplicate roster names retain an exact selected worker ID", () => {
  const draft = {
    ...requiredDraft(),
    roster: [
      { id: "worker-a", name: "Jordan Lee" },
      { id: "worker-b", name: "Jordan Lee" },
    ],
    personInChargeMode: "worker" as const,
    personInChargeWorkerId: "worker-b",
  };
  const job = buildJobConfiguration(draft);
  assert.equal(job.defaultPersonInChargeWorkerId, "worker-b");
  assert.equal(job.defaults.personInCharge, "Jordan Lee");
});

test("invalid setup cannot be built", () => {
  assert.throws(
    () => buildJobConfiguration(createEmptyJobSetupDraft()),
    /incomplete/,
  );
});

test("job setup rejects roster limits and duplicate worker IDs", () => {
  const tooManyWorkers = {
    ...requiredDraft(),
    roster: Array.from({ length: 11 }, (_, index) => ({
      id: `worker-${index}`,
      name: `Worker ${index + 1}`,
    })),
  };
  assert.ok(
    validateJobSetup(tooManyWorkers).some(
      ({ field, message }) =>
        field === "roster" && message.includes("up to 10"),
    ),
  );
  assert.throws(() => buildJobConfiguration(tooManyWorkers), /incomplete/);

  const duplicateIds = {
    ...requiredDraft(),
    roster: [
      { id: "worker-1", name: "Alex Morgan" },
      { id: "worker-1", name: "Sam Rivera" },
    ],
  };
  assert.ok(
    validateJobSetup(duplicateIds).some(
      ({ field, message }) =>
        field === "roster" && message === "Worker IDs must be unique.",
    ),
  );
  assert.throws(() => buildJobConfiguration(duplicateIds), /incomplete/);
});

test("job setup preserves valid user-entered values exactly", () => {
  const draft = {
    ...requiredDraft(),
    name: "  North Pump Station  ",
    location: " Gate 2 — south entrance ",
  };
  const job = buildJobConfiguration(draft);
  assert.equal(job.name, draft.name);
  assert.equal(job.defaults.location, draft.location);
});

test("saved setup drafts parse without rewriting user-entered values", () => {
  const draft = {
    ...requiredDraft(),
    name: "  North Pump Station  ",
    roster: [{ id: "worker-1", name: " Jordan Lee " }],
  };
  assert.deepEqual(parseJobSetupDraft(draft), draft);
});

test("malformed saved setup drafts are rejected without coercion", () => {
  assert.throws(
    () => parseJobSetupDraft({ ...requiredDraft(), roster: "Jordan Lee" }),
    /Invalid saved job setup draft/,
  );
  assert.throws(
    () =>
      parseJobSetupDraft({
        ...requiredDraft(),
        personInChargeWorkerId: 42,
      }),
    /Invalid saved job setup draft/,
  );
});
