import assert from "node:assert/strict";
import test from "node:test";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createBlankAha, jobSchema, type Aha } from "@workspace/aha-domain";

import { HomeStateCard } from "@/components/aha/home-state-card";

Object.assign(globalThis, { React });

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

const blank = createBlankAha(job, "2026-08-19", {
  createId: () => "aha-1",
  now: () => new Date("2026-08-19T12:00:00.000Z"),
});
const completed: Aha = {
  ...blank,
  status: "completed",
  completedAt: "2026-08-19T12:05:00.000Z",
};

test("Home distinguishes an unreadable preserved PDF from a missing PDF", () => {
  const html = renderToStaticMarkup(
    createElement(HomeStateCard, {
      todayAha: completed,
      todayPdfStatus: "unreadable",
      hasRecentAha: true,
      isStarting: false,
      onStart: () => undefined,
      onOpenEditor: () => undefined,
      onResumeInProgress: () => undefined,
      onViewCompleted: () => undefined,
      onUpdateCompleted: () => undefined,
    }),
  );

  assert.ok(html.includes("stored PDF cannot be opened"));
  assert.ok(html.includes("existing file was not deleted"));
  assert.ok(html.includes("REPAIR PDF"));
  assert.ok(!html.includes("still needs to be created"));
});
