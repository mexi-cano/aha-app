import assert from "node:assert/strict";
import test from "node:test";
import { createBlankAha, jobSchema } from "@workspace/aha-domain";

import { createBlankDraftMetadata } from "./draft-metadata";
import { writeBlankAhaReplacement } from "./aha-repository";

const job = jobSchema.parse({
  id: "job-1",
  name: "Test job",
  cityLabel: "Raleigh, NC",
  defaults: {
    location: "Site",
    personInCharge: "Lead",
    closestEmergencyCentre: "Hospital",
    emergencyNumber: "911",
    musterPoint: "Gate",
    workOrderPermit: "",
    jhaProcedureNumbers: "",
  },
  roster: [],
});

test("blank replacement updates matching rows and deletes only its PDF artifact", async () => {
  const replacement = createBlankAha(job, "2026-08-19", {
    createId: () => "aha-target",
    now: () => new Date("2026-08-19T12:00:00.000Z"),
  });
  const metadata = createBlankDraftMetadata(replacement.id);
  const events: Array<[string, string]> = [];

  await writeBlankAhaReplacement(
    {
      putAha: async (aha) => {
        events.push(["aha", aha.id]);
      },
      putMetadata: async (value) => {
        events.push(["metadata", value.ahaId]);
      },
      deletePdf: async (ahaId) => {
        events.push(["pdf", ahaId]);
      },
    },
    replacement,
    metadata,
  );

  assert.deepEqual(events, [
    ["aha", "aha-target"],
    ["metadata", "aha-target"],
    ["pdf", "aha-target"],
  ]);
});
