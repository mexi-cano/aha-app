import assert from "node:assert/strict";
import test from "node:test";

import { createBlankAha, jobSchema } from "@workspace/aha-domain";

import { partitionReadableAhas, partitionReadableJobs } from "./stored-records";

const job = jobSchema.parse({
  id: "job-1",
  name: "Test job",
  cityLabel: "Raleigh, NC",
  defaults: {
    location: "Test site",
    personInCharge: "Test lead",
    closestEmergencyCentre: "Test hospital",
    emergencyNumber: "911",
    musterPoint: "Test gate",
    workOrderPermit: "",
    jhaProcedureNumbers: "",
  },
  roster: [],
});

test("unreadable AHAs do not hide valid local records", () => {
  const valid = createBlankAha(job, "2026-08-18", {
    createId: () => "valid-aha",
    now: () => new Date("2026-08-18T12:00:00.000Z"),
  });

  const partition = partitionReadableAhas([
    { id: "corrupt-aha" },
    valid,
    { ...valid, id: "invalid-date", date: "2026-02-30" },
  ]);

  assert.deepEqual(
    partition.records.map(({ id }) => id),
    ["valid-aha"],
  );
  assert.equal(partition.unreadableCount, 2);
});

test("unreadable jobs do not hide valid local jobs", () => {
  const partition = partitionReadableJobs([
    { id: "corrupt-job" },
    job,
    { ...job, id: "invalid-job", defaults: {} },
  ]);

  assert.deepEqual(
    partition.records.map(({ id }) => id),
    ["job-1"],
  );
  assert.equal(partition.unreadableCount, 2);
});
