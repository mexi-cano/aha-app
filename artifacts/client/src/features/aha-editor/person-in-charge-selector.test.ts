import assert from "node:assert/strict";
import test from "node:test";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  PersonInChargeCrewChoices,
  PersonInChargeField,
} from "@/components/aha/person-in-charge-field";
import {
  createBlankAha,
  enterCustomPersonInCharge,
  jobSchema,
} from "@workspace/aha-domain";

Object.assign(globalThis, { React });

test("person-in-charge crew choices use immediate pressed buttons", () => {
  const html = renderToStaticMarkup(
    createElement(PersonInChargeCrewChoices, {
      crew: [
        {
          workerId: "worker-1",
          name: "Miguel Rodriguez",
          signaturePng: null,
          signedAt: null,
        },
        {
          workerId: "worker-2",
          name: "Jordan Reed",
          signaturePng: null,
          signedAt: null,
        },
      ],
      selectedWorkerId: "worker-1",
      onSelect: () => undefined,
    }),
  );

  assert.match(html, /<button[^>]*aria-pressed="true"/);
  assert.match(html, /<button[^>]*aria-pressed="false"/);
  assert.ok(!html.includes('role="radio"'));
  assert.ok(!html.includes('role="radiogroup"'));
});

test("duplicate crew names receive non-printing chooser qualifiers", () => {
  const html = renderToStaticMarkup(
    createElement(PersonInChargeCrewChoices, {
      crew: [
        {
          workerId: "worker-1",
          name: "Alex Lee",
          signaturePng: null,
          signedAt: null,
        },
        {
          workerId: "worker-2",
          name: "Alex Lee",
          signaturePng: null,
          signedAt: null,
        },
      ],
      selectedWorkerId: null,
      onSelect: () => undefined,
    }),
  );

  assert.ok(html.includes("1 of 2"));
  assert.ok(html.includes("2 of 2"));
});

test("person-in-charge card has associated, custom, and empty states", () => {
  const job = jobSchema.parse({
    id: "job-1",
    name: "Job",
    cityLabel: "Raleigh, NC",
    defaults: {
      location: "Site",
      personInCharge: "Miguel Rodriguez",
      closestEmergencyCentre: "Hospital",
      emergencyNumber: "911",
      musterPoint: "Gate",
      workOrderPermit: "",
      jhaProcedureNumbers: "",
    },
    roster: [{ id: "worker-1", name: "Miguel Rodriguez" }],
  });
  const associated = createBlankAha(job, "2026-08-19", {
    createId: () => "aha-1",
    now: () => new Date("2026-08-19T12:00:00.000Z"),
  });
  const render = (aha: typeof associated) =>
    renderToStaticMarkup(
      createElement(PersonInChargeField, {
        aha,
        updateAha: () => undefined,
      }),
    );

  assert.ok(render(associated).includes("FOREMAN · Today’s crew"));
  assert.ok(
    render(enterCustomPersonInCharge(associated, "Pat Supervisor")).includes(
      "Not in today’s signing crew",
    ),
  );
  assert.ok(
    render(enterCustomPersonInCharge(associated, "")).includes(
      "Choose person in charge",
    ),
  );
  assert.ok(
    render(
      enterCustomPersonInCharge(associated, "  MIGUEL RODRIGUEZ  "),
    ).includes("Connect to Miguel Rodriguez in today&#x27;s crew"),
  );
});

test("person-in-charge connection is not offered for duplicate name matches", () => {
  const job = jobSchema.parse({
    id: "job-duplicates",
    name: "Job",
    cityLabel: "Raleigh, NC",
    defaults: {
      location: "Site",
      personInCharge: "Alex Lee",
      closestEmergencyCentre: "Hospital",
      emergencyNumber: "911",
      musterPoint: "Gate",
      workOrderPermit: "",
      jhaProcedureNumbers: "",
    },
    roster: [
      { id: "worker-1", name: "Alex Lee" },
      { id: "worker-2", name: "Alex Lee" },
    ],
  });
  const aha = enterCustomPersonInCharge(
    createBlankAha(job, "2026-08-19", {
      createId: () => "aha-duplicates",
      now: () => new Date("2026-08-19T12:00:00.000Z"),
    }),
    "Alex Lee",
  );
  const html = renderToStaticMarkup(
    createElement(PersonInChargeField, {
      aha,
      updateAha: () => undefined,
    }),
  );
  assert.ok(!html.includes("Connect to Alex Lee"));
});
