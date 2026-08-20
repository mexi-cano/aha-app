import assert from "node:assert/strict";
import test from "node:test";

import {
  buildJobConfiguration,
  createEmptyJobSetupDraft,
  validateJobSetup,
} from "../features/job-setup";

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
