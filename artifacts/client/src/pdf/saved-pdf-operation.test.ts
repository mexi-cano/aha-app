import assert from "node:assert/strict";
import test from "node:test";
import { createBlankAha, jobSchema, type Aha } from "@workspace/aha-domain";

import type { StoredPdfResult } from "./pdf-service";
import { saveAhaAndGeneratePdf } from "./saved-pdf-operation";

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
  roster: [{ id: "lead", name: "Lead" }],
});

const aha = createBlankAha(job, "2026-08-19", {
  createId: () => "aha-1",
  now: () => new Date("2026-08-19T12:00:00.000Z"),
});

function storedResult(savedAha: Aha): StoredPdfResult {
  return {
    status: "stored",
    record: {
      ahaId: savedAha.id,
      filename: "AHA_Test_2026-08-19.pdf",
      bytes: new ArrayBuffer(1),
      generatedAt: "2026-08-19T12:01:00.000Z",
      sourceRevision: savedAha.documentRevision,
    },
  };
}

test("save-first PDF orchestration waits for generation and uses the saved AHA", async () => {
  const events: string[] = [];
  let releaseGeneration!: (value: StoredPdfResult) => void;
  const generation = new Promise<StoredPdfResult>((resolve) => {
    releaseGeneration = resolve;
  });
  const savedAha = { ...aha, status: "completed" as const };

  const operation = saveAhaAndGeneratePdf({
    job,
    update: (current) => ({ ...current, status: "completed" }),
    commitAha: async (update) => {
      events.push("saved");
      assert.equal(update(aha).status, "completed");
      return savedAha;
    },
    generate: async (received) => {
      events.push("generation-started");
      assert.equal(received, savedAha);
      return generation;
    },
  });

  await Promise.resolve();
  assert.deepEqual(events, ["saved", "generation-started"]);
  let settled = false;
  void operation.then(() => {
    settled = true;
  });
  await Promise.resolve();
  assert.equal(settled, false);

  releaseGeneration(storedResult(savedAha));
  assert.equal((await operation).status, "stored");
});

test("save-first PDF orchestration distinguishes every recovery result", async () => {
  let generated = false;
  const saveFailed = await saveAhaAndGeneratePdf({
    job,
    update: (current) => current,
    commitAha: async () => null,
    generate: async () => {
      generated = true;
      return storedResult(aha);
    },
  });
  assert.equal(saveFailed.status, "save_failed");
  assert.equal(generated, false);

  const fitFailed = await saveAhaAndGeneratePdf({
    job,
    update: (current) => current,
    commitAha: async () => aha,
    generate: async () => ({
      status: "fit_failed",
      issues: [
        {
          code: "field_overflow",
          fieldPath: "description",
          label: "Description of work",
          message: "Shorten the description.",
        },
      ],
    }),
  });
  assert.equal(fitFailed.status, "fit_failed");

  const generationFailed = await saveAhaAndGeneratePdf({
    job,
    update: (current) => current,
    commitAha: async () => aha,
    generate: async () => ({
      status: "failed",
      message: "PDF failed",
      cause: new Error("renderer unavailable"),
    }),
  });
  assert.equal(generationFailed.status, "generation_failed");
  if (generationFailed.status === "generation_failed") {
    assert.equal(generationFailed.savedAha, aha);
  }

  const rejectedGeneration = await saveAhaAndGeneratePdf({
    job,
    update: (current) => current,
    commitAha: async () => aha,
    generate: async () => {
      throw new Error("unexpected renderer rejection");
    },
  });
  assert.equal(rejectedGeneration.status, "generation_failed");

  const rejectedSave = await saveAhaAndGeneratePdf({
    job,
    update: (current) => current,
    commitAha: async () => {
      throw new Error("unexpected persistence rejection");
    },
  });
  assert.equal(rejectedSave.status, "save_failed");
});
