import assert from "node:assert/strict";
import test from "node:test";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { PersonInChargeCrewChoices } from "@/components/aha/person-in-charge-field";

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
