import assert from "node:assert/strict";
import test from "node:test";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ENERGY_CATEGORIES,
  WORKER_ACKNOWLEDGMENT,
  ahaSchema,
  createBlankAha,
  jobSchema,
} from "@workspace/aha-domain";

import { WorkerReviewAndSign } from "@/components/aha/worker-review-and-sign";
import {
  WORKER_REVIEW_COPY,
  WORKER_REVIEW_SPANISH_ENERGY_CATEGORIES,
  WORKER_REVIEW_SPANISH_ENERGY_EXAMPLES,
} from "@/features/aha-editor/worker-review-copy";

Object.assign(globalThis, { React });

const job = jobSchema.parse({
  id: "job-1",
  name: "Proyecto I-40",
  cityLabel: "Raleigh, NC",
  defaults: {
    location: "Eastbound shoulder near Exit 285",
    personInCharge: "Miguel Rodriguez",
    closestEmergencyCentre: "WakeMed Raleigh Campus",
    emergencyNumber: "911 / Site safety: (919) 555-0182",
    musterPoint: "North parking lot, gate 3",
    workOrderPermit: "WO-88213",
    jhaProcedureNumbers: "JHA-2026-0147",
  },
  roster: [{ id: "worker-1", name: "Miguel Rodriguez" }],
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
      hazards: "Mobile equipment, cave-in",
      controls: "Locates verified and marked.",
    },
  ],
  energySelections: ENERGY_CATEGORIES.map(({ category, examples }) => ({
    category,
    examples: [...examples],
  })),
  safetyCheck: "yes",
});

test("Spanish energy presentation exhaustively covers canonical values", () => {
  assert.deepEqual(
    Object.keys(WORKER_REVIEW_SPANISH_ENERGY_CATEGORIES).sort(),
    ENERGY_CATEGORIES.map(({ category }) => category).sort(),
  );

  const canonicalExamples = [
    ...new Set(ENERGY_CATEGORIES.flatMap(({ examples }) => examples)),
  ].sort();
  assert.deepEqual(
    Object.keys(WORKER_REVIEW_SPANISH_ENERGY_EXAMPLES).sort(),
    canonicalExamples,
  );
  assert.equal(WORKER_REVIEW_COPY.en.acknowledgment, WORKER_ACKNOWLEDGMENT);
});

test("Spanish worker review translates fixed safety copy and preserves entered values", () => {
  const html = renderToStaticMarkup(
    createElement(WorkerReviewAndSign, {
      aha,
      job,
      signerName: "Miguel Rodriguez",
      isForeman: true,
      language: "es",
      onLanguageChange: () => undefined,
      onConfirm: () => undefined,
    }),
  );

  for (const expected of [
    'lang="es-US"',
    "Español",
    "SOLO LECTURA",
    "CAPATAZ",
    "miércoles, 19 de agosto",
    "no se traducen automáticamente",
    "Centro de emergencias más cercano",
    "Se requiere un plan de rescate",
    "Derrumbe de excavación",
    "RUEDA DE ENERGÍA",
    "11 de 11 seleccionadas",
    "Refleja las selecciones de hoy",
    "Rueda de energía que muestra 11 de 11 categorías seleccionadas",
    "Verificación de seguridad",
    "Reconocimiento y firma",
    WORKER_REVIEW_COPY.es.acknowledgment,
    "Firme aquí con el dedo",
    'aria-label="Área para dibujar la firma. Firme aquí con el dedo."',
    "CONFIRMAR FIRMA",
    "Excavation and directional bore for fiber conduit.",
    "Excavation around existing utility",
    "Mobile equipment, cave-in",
    "Locates verified and marked.",
    "Coordinate truck access with the adjacent paving crew.",
  ]) {
    assert.ok(
      html.includes(expected),
      `expected Spanish review to include ${expected}`,
    );
  }

  assert.ok(!html.includes(WORKER_ACKNOWLEDGMENT));
});

test("worker review defaults to English and exposes pressed language buttons", () => {
  const html = renderToStaticMarkup(
    createElement(WorkerReviewAndSign, {
      aha,
      job,
      signerName: "Miguel Rodriguez",
      onConfirm: () => undefined,
    }),
  );

  assert.ok(html.includes(WORKER_ACKNOWLEDGMENT));
  assert.match(html, /<button[^>]*aria-pressed="true"[^>]*>English<\/button>/);
  assert.match(html, /<button[^>]*aria-pressed="false"[^>]*>Español<\/button>/);
  assert.ok(!html.includes(WORKER_REVIEW_COPY.es.acknowledgment));
});
