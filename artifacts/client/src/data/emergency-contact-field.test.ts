import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  EmergencyContactField,
  emergencyContactValueAfterBlur,
} from "../components/aha/emergency-contact-field";

test("emergency contact field requests a telephone keyboard without personal autofill", () => {
  const markup = renderToStaticMarkup(
    createElement(EmergencyContactField, {
      id: "emergency-number",
      value: "919-555-0182",
      onValueChange: () => undefined,
    }),
  );
  assert.match(markup, /inputMode="tel"|inputmode="tel"/);
  assert.match(markup, /autoComplete="off"|autocomplete="off"/);
  assert.doesNotMatch(markup, /emergency-number-feedback/);
});

test("blur formatting requires an actual edit", () => {
  assert.equal(
    emergencyContactValueAfterBlur("919-555-0182", false),
    "919-555-0182",
  );
  assert.equal(
    emergencyContactValueAfterBlur("919-555-0182", true),
    "(919) 555-0182",
  );
  const compound = "911 / Site safety: (919) 555-0182";
  assert.equal(emergencyContactValueAfterBlur(compound, true), compound);
});
