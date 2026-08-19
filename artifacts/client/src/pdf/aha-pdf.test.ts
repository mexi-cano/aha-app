import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { PDFDocument } from "@cantoo/pdf-lib";
import {
  ENERGY_CATEGORIES,
  ahaSchema,
  createBlankAha,
  jobSchema,
  type Aha,
  type Job,
} from "@workspace/aha-domain";

import {
  analyzeAhaPdfFit,
  assertPdfEnergySourceIsCanonical,
  createAhaPdfFilename,
  createAhaPdfInput,
  renderAhaPdf,
} from "./aha-pdf";

const job: Job = jobSchema.parse({
  id: "job-1",
  name: "I-40: East/West? <Pilot>",
  cityLabel: "Raleigh, NC",
  defaults: {
    location: "Raleigh, NC",
    personInCharge: "Miguel Rodriguez",
    closestEmergencyCentre: "WakeMed Raleigh Campus",
    emergencyNumber: "911",
    musterPoint: "North parking lot",
    workOrderPermit: "WO-88213",
    jhaProcedureNumbers: "JHA-2026-0147",
  },
  roster: [],
});

function createAha(overrides: Partial<Aha> = {}): Aha {
  let counter = 0;
  const blank = createBlankAha(job, "2026-08-19", {
    createId: () => `id-${counter++}`,
    now: () => new Date("2026-08-19T12:00:00.000Z"),
  });
  return ahaSchema.parse({
    ...blank,
    status: "completed",
    header: { ...blank.header, rescuePlanRequired: true },
    description: "Excavation and directional bore for fiber conduit.",
    tasks: [
      {
        id: "task-1",
        task: "Excavation",
        hazards: "Cave-in",
        controls: "Daily inspection",
      },
    ],
    energySelections: [
      {
        category: "Gravity",
        examples: ["Excavation cave-in", "Slips/trips/falls"],
      },
    ],
    safetyCheck: "yes",
    completedAt: "2026-08-19T12:00:00.000Z",
    ...overrides,
  });
}

const signaturePng =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X4KZDwAAAABJRU5ErkJggg==";

test("PDF input preserves canonical examples and prints N/A values blank", () => {
  const aha = createAha({
    notApplicable: {
      workOrderPermit: true,
      jhaProcedureNumbers: true,
      meetingNotes: true,
    },
    meetingNotes: "Must not print",
    energySelections: ENERGY_CATEGORIES.map(({ category, examples }) => ({
      category,
      examples: [...examples],
    })),
  });
  const input = createAhaPdfInput(aha, job);
  assert.equal(input.workOrderPermit, "");
  assert.equal(input.jhaProcedureNumbers, "");
  assert.equal(input.meetingNotes, "");
  assert.deepEqual(input.energySelections, aha.energySelections);
  assertPdfEnergySourceIsCanonical();
});

test("filename replaces only filesystem-invalid characters", () => {
  assert.equal(
    createAhaPdfFilename(job.name, "2026-08-19"),
    "AHA_I-40_ East_West_ _Pilot__2026-08-19.pdf",
  );
});

test("adaptive allocation keeps six short tasks roomy and fits fifteen short tasks", async () => {
  const shortTask = (index: number) => ({
    id: `task-${index}`,
    task: `Task ${index}`,
    hazards: "Hazard",
    controls: "Control",
  });
  const six = await analyzeAhaPdfFit(
    createAha({
      tasks: Array.from({ length: 6 }, (_, index) => shortTask(index)),
    }),
    job,
  );
  assert.equal(six.issues.length, 0);
  assert.deepEqual(
    six.tasks.map(({ rowSpan }) => rowSpan),
    [2, 2, 2, 2, 2, 2],
  );

  const fifteen = await analyzeAhaPdfFit(
    createAha({
      tasks: Array.from({ length: 15 }, (_, index) => shortTask(index)),
    }),
    job,
  );
  assert.equal(fifteen.issues.length, 0);
  assert.deepEqual(
    fifteen.tasks.map(({ rowSpan }) => rowSpan),
    Array(15).fill(1),
  );
});

test("fit analysis targets unbroken text and total task-row overflow", async () => {
  const unbroken = await analyzeAhaPdfFit(
    createAha({ description: "X".repeat(1_000) }),
    job,
  );
  assert.ok(
    unbroken.issues.some(({ fieldPath }) => fieldPath === "description"),
  );

  const longTask = (index: number) => ({
    id: `task-${index}`,
    task: `Task ${index} ${"several separate words ".repeat(10)}`,
    hazards: `Hazards ${"several separate words ".repeat(10)}`,
    controls: `Controls ${"several separate words ".repeat(10)}`,
  });
  const overflow = await analyzeAhaPdfFit(
    createAha({
      tasks: Array.from({ length: 15 }, (_, index) => longTask(index)),
    }),
    job,
  );
  assert.ok(overflow.issues.some(({ code }) => code === "task_row_overflow"));
});

test("fit failure returns no PDF bytes and does not touch invalid assets", async () => {
  const result = await renderAhaPdf(
    createAha({ description: "X".repeat(1_000) }),
    job,
    { logoPng: new Uint8Array(), energyWheelPng: new Uint8Array() },
  );
  assert.equal(result.status, "fit_failed");
  assert.ok(!("bytes" in result));
});

test("rendered artifact reloads as two Letter pages with all ten signature slots", async () => {
  const crew = Array.from({ length: 10 }, (_, index) => ({
    workerId: `worker-${index}`,
    name: `Worker ${index + 1}`,
    signaturePng,
    signedAt: "2026-08-19T12:00:00.000Z",
  }));
  const [logoPng, energyWheelPng] = await Promise.all([
    readFile(new URL("../../../../assets/its-logo.png", import.meta.url)),
    readFile(
      new URL(
        "../../../../assets/aha-energy-wheel-recolored.png",
        import.meta.url,
      ),
    ),
  ]);
  const result = await renderAhaPdf(createAha({ crew }), job, {
    logoPng,
    energyWheelPng,
  });
  assert.equal(result.status, "rendered");
  if (result.status !== "rendered") return;
  const reloaded = await PDFDocument.load(result.bytes);
  assert.equal(reloaded.getPageCount(), 2);
  for (const page of reloaded.getPages()) {
    assert.deepEqual(page.getSize(), { width: 612, height: 792 });
  }
});

test("malformed saved signatures fail safely without producing an artifact", async () => {
  const [logoPng, energyWheelPng] = await Promise.all([
    readFile(new URL("../../../../assets/its-logo.png", import.meta.url)),
    readFile(
      new URL(
        "../../../../assets/aha-energy-wheel-recolored.png",
        import.meta.url,
      ),
    ),
  ]);
  const result = await renderAhaPdf(
    createAha({
      crew: [
        {
          workerId: "worker-bad",
          name: "Unreadable Signature",
          signaturePng: "data:image/png;base64,AAAA",
          signedAt: "2026-08-19T12:00:00.000Z",
        },
      ],
    }),
    job,
    { logoPng, energyWheelPng },
  );
  assert.equal(result.status, "failed");
  assert.ok(!("bytes" in result));
});
