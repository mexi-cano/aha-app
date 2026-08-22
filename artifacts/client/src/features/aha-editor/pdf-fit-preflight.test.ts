import assert from "node:assert/strict";
import test from "node:test";
import { createBlankAha, jobSchema } from "@workspace/aha-domain";

import {
  describePdfFitIssue,
  pdfFitIssueEditorPath,
} from "./pdf-fit-navigation";
import { isCurrentAhaPdfFitPreflight } from "./pdf-fit-preflight";

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
  roster: [{ id: "worker-1", name: "Lead" }],
});

const aha = createBlankAha(job, "2026-08-22", {
  createId: () => "aha-1",
  now: () => new Date("2026-08-22T12:00:00.000Z"),
});

test("PDF fit preflight identity becomes stale after a document revision", () => {
  const preflight = {
    ahaId: aha.id,
    documentRevision: aha.documentRevision,
    issues: [],
  };
  assert.equal(isCurrentAhaPdfFitPreflight(preflight, aha), true);
  assert.equal(
    isCurrentAhaPdfFitPreflight(preflight, {
      ...aha,
      documentRevision: aha.documentRevision + 1,
    }),
    false,
  );
  assert.equal(
    isCurrentAhaPdfFitPreflight({ ...preflight, ahaId: "another" }, aha),
    false,
  );
});

test("task PDF fit issues identify a recognizable excerpt and exact field", () => {
  const withTask = {
    ...aha,
    tasks: [
      {
        id: "task-1",
        task: "Cut asphalt near the active traffic lane and prepare the trench",
        hazards: "Flying debris",
        controls: "Wear PPE",
      },
    ],
  };
  const issue = {
    code: "field_overflow" as const,
    fieldPath: "tasks.0.task",
    label: "Task",
    taskId: "task-1",
    message: "Task will not fit",
  };
  assert.match(describePdfFitIssue(issue, withTask), /Cut asphalt near/);
  assert.equal(
    pdfFitIssueEditorPath(aha.id, issue),
    "/ahas/aha-1/work?task=task-1&field=task",
  );
});
