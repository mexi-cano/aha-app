import assert from "node:assert/strict";
import test from "node:test";
import { jobSchema, type Job } from "@workspace/aha-domain";

import { filterJobsForSelection, sortJobsForSelection } from "./job-selection";

function job(id: string, name: string, cityLabel: string): Job {
  return jobSchema.parse({
    id,
    name,
    cityLabel,
    defaults: {
      location: cityLabel,
      personInCharge: "",
      closestEmergencyCentre: "",
      emergencyNumber: "",
      musterPoint: "",
      workOrderPermit: "",
      jhaProcedureNumbers: "",
    },
    roster: [],
  });
}

test("selectable jobs sort by name, city, then stable ID without mutating input", () => {
  const input = [
    job("3", "Raleigh SUB", "Raleigh"),
    job("2", "Garner House", "Garner"),
    job("1", "Raleigh SUB", "Apex"),
  ];
  assert.deepEqual(
    sortJobsForSelection(input).map(({ id }) => id),
    ["2", "1", "3"],
  );
  assert.deepEqual(
    input.map(({ id }) => id),
    ["3", "2", "1"],
  );
});

test("selectable job search matches name and city case-insensitively", () => {
  const jobs = [
    job("1", "Raleigh SUB", "Raleigh"),
    job("2", "Garner House", "Garner"),
  ];
  assert.deepEqual(
    filterJobsForSelection(jobs, "sub").map(({ id }) => id),
    ["1"],
  );
  assert.deepEqual(
    filterJobsForSelection(jobs, "GARNER").map(({ id }) => id),
    ["2"],
  );
  assert.equal(filterJobsForSelection(jobs, "missing").length, 0);
});
