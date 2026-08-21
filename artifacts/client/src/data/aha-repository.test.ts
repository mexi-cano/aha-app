import assert from "node:assert/strict";
import test from "node:test";
import {
  ahaSchema,
  createBlankAha,
  jobSchema,
  type Aha,
} from "@workspace/aha-domain";

import { createBlankDraftMetadata } from "./draft-metadata";
import {
  createArchivedPdfRevisionRecord,
  selectCompletedAhaHistory,
  writeBlankAhaReplacement,
} from "./aha-repository";
import type { AhaPdfRecord } from "./database";

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

test("archiving a current PDF preserves its verified backup metadata", () => {
  const bytes = new Uint8Array([1, 2, 3, 4]).buffer;
  const current: AhaPdfRecord = {
    ahaId: "aha-target",
    filename: "AHA.pdf",
    bytes,
    generatedAt: "2026-08-19T12:05:00.000Z",
    sourceRevision: 4,
    byteLength: bytes.byteLength,
    sha256: "ab".repeat(32),
    backedUpAt: "2026-08-19T12:06:00.000Z",
  };
  const archived = createArchivedPdfRevisionRecord(
    current,
    "2026-08-19T12:10:00.000Z",
  );

  assert.equal(archived.bytes, bytes);
  assert.equal(archived.byteLength, bytes.byteLength);
  assert.equal(archived.sha256, current.sha256);
  assert.equal(archived.backedUpAt, current.backedUpAt);
  assert.equal(archived.supersededAt, "2026-08-19T12:10:00.000Z");
});

function completedAha(id: string, date: string): Aha {
  return ahaSchema.parse({
    ...createBlankAha(job, date as Aha["date"], {
      createId: () => id,
      now: () => new Date(`${date}T12:00:00.000Z`),
    }),
    status: "completed",
    completedAt: `${date}T13:00:00.000Z`,
  });
}

test("completed history filters, sorts newest first, and pages without mutating input", () => {
  const draft = createBlankAha(job, "2026-08-18", {
    createId: () => "draft",
    now: () => new Date("2026-08-18T12:00:00.000Z"),
  });
  const records = [
    completedAha("older", "2026-08-17"),
    draft,
    completedAha("newer", "2026-08-19"),
  ];
  const originalOrder = records.map(({ id }) => id);

  const result = selectCompletedAhaHistory(records, 1);
  assert.equal(result.totalCount, 2);
  assert.deepEqual(
    result.visible.map(({ id }) => id),
    ["newer"],
  );
  assert.deepEqual(
    records.map(({ id }) => id),
    originalOrder,
  );
});
