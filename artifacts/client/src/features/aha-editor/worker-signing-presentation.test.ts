import assert from "node:assert/strict";
import test from "node:test";

import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  WORKER_ACKNOWLEDGMENT,
  ahaSchema,
  createBlankAha,
  jobSchema,
} from "@workspace/aha-domain";

import { AhaSummary } from "@/components/aha/aha-summary";
import { WorkerReviewAndSign } from "@/components/aha/worker-review-and-sign";

Object.assign(globalThis, { React });

const job = jobSchema.parse({
  id: "job-1",
  name: "I-40 Utility Relocation",
  cityLabel: "Raleigh, NC",
  defaults: {
    location: "Eastbound shoulder near Exit 285",
    personInCharge: "Miguel Rodriguez",
    closestEmergencyCentre: "WakeMed Raleigh Campus",
    emergencyNumber: "911 / Site safety: (919) 555-0182",
    musterPoint: "North parking lot, gate 3",
    workOrderPermit: "WO-88213 / Permit E-4471",
    jhaProcedureNumbers: "JHA-2026-0147, SOP-114",
  },
  roster: [
    { id: "worker-1", name: "Miguel Rodriguez" },
    { id: "worker-2", name: "Jordan Reed" },
  ],
});

const blank = createBlankAha(job, "2026-08-19", {
  createId: () => "aha-1",
  now: () => new Date("2026-08-19T12:00:00.000Z"),
});

const aha = ahaSchema.parse({
  ...blank,
  status: "in_progress",
  header: { ...blank.header, rescuePlanRequired: true },
  description: "Excavation and directional bore for fiber conduit.",
  meetingNotes: "Coordinate truck access with the adjacent paving crew.",
  tasks: [
    {
      id: "task-1",
      task: "Excavation around existing utility",
      hazards: "Mobile equipment, cave-in, slips/trips",
      controls: "Locates verified and marked. Spotter for all digging.",
    },
  ],
  energySelections: [
    {
      category: "Gravity",
      examples: ["Excavation cave-in", "Slips/trips/falls"],
    },
  ],
  safetyCheck: "yes",
});

test("worker presentation contains the safety review and omits the crew roster", () => {
  const html = renderToStaticMarkup(
    createElement(WorkerReviewAndSign, {
      aha,
      job,
      signerName: "Miguel Rodriguez",
      isForeman: true,
      onConfirm: () => undefined,
    }),
  );

  for (const expected of [
    "READ ONLY",
    "FOREMAN",
    "I-40 Utility Relocation",
    "Closest emergency centre",
    "WakeMed Raleigh Campus",
    "Rescue plan required",
    "Excavation and directional bore for fiber conduit.",
    "Excavation around existing utility",
    "Mobile equipment, cave-in, slips/trips",
    "Locates verified and marked. Spotter for all digging.",
    "Gravity",
    "Excavation cave-in",
    "ENERGY WHEEL",
    "1 of 11 selected",
    "Safety check:",
    "Coordinate truck access with the adjacent paving crew.",
    "Acknowledgment and signature",
    WORKER_ACKNOWLEDGMENT,
    "Sign as Miguel Rodriguez",
  ]) {
    assert.ok(
      html.includes(expected),
      `expected worker review to include ${expected}`,
    );
  }

  assert.ok(!html.includes("TODAY&#x27;S CREW"));
  assert.ok(!html.includes("Jordan Reed"));
});

test("roster overview keeps the crew section", () => {
  const html = renderToStaticMarkup(
    createElement(AhaSummary, { aha, job, mode: "signing" }),
  );

  assert.ok(html.includes("TODAY&#x27;S CREW — 2"));
  assert.ok(html.includes("Miguel Rodriguez"));
  assert.ok(html.includes("Jordan Reed"));
  assert.ok(!html.includes("ENERGY WHEEL"));
});

test("added-worker presentation requires a name and begins with disabled confirmation", () => {
  const html = renderToStaticMarkup(
    createElement(WorkerReviewAndSign, {
      aha,
      job,
      signerName: "",
      nameInput: {
        value: "",
        onChange: () => undefined,
        helper: "joins today's crew",
      },
      confirmDisabled: true,
      onConfirm: () => undefined,
    }),
  );

  assert.match(html, /<input[^>]*required=""/);
  assert.match(
    html,
    /<button[^>]*disabled=""[^>]*>CONFIRM SIGNATURE<\/button>/,
  );
  assert.ok(html.includes(WORKER_ACKNOWLEDGMENT));
});

test("worker signing wheel handles no selected energy categories", () => {
  const html = renderToStaticMarkup(
    createElement(WorkerReviewAndSign, {
      aha: ahaSchema.parse({ ...aha, energySelections: [] }),
      job,
      signerName: "Jordan Reed",
      onConfirm: () => undefined,
    }),
  );

  assert.ok(html.includes("0 of 11 selected"));
  assert.ok(html.includes("No energy categories marked."));
});
