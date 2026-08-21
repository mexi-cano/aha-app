import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { TextAreaField, TextField } from "../components/aha/form-field";

test("field descriptions remain visible and are associated with their controls", () => {
  const input = renderToStaticMarkup(
    createElement(TextField, {
      id: "job-location",
      label: "Location",
      description: "The specific work location printed on each AHA.",
      "aria-describedby": "existing-help",
    }),
  );
  assert.match(input, /id="job-location-description"/);
  assert.match(
    input,
    /aria-describedby="existing-help job-location-description"/,
  );
  assert.match(input, /The specific work location printed on each AHA\./);

  const textarea = renderToStaticMarkup(
    createElement(TextAreaField, {
      id: "work-description",
      label: "Description",
      description: "Persistent help",
    }),
  );
  assert.match(textarea, /aria-describedby="work-description-description"/);
  assert.match(textarea, /Persistent help/);
});

test("field feedback and assistive actions are accessible and touch sized", () => {
  const input = renderToStaticMarkup(
    createElement(TextField, {
      id: "emergency-number",
      label: "Emergency number",
      feedback: {
        tone: "warning",
        message: "Check that this includes the number the crew should call.",
      },
      assistiveAction: {
        label: "Use job default",
        onClick: () => undefined,
      },
    }),
  );
  assert.match(input, /aria-describedby="emergency-number-feedback"/);
  assert.match(input, /id="emergency-number-feedback"/);
  assert.match(input, /Check that this includes the number/);
  assert.match(input, /min-h-12/);
  assert.match(input, />Use job default</);
  assert.doesNotMatch(input, /label="Use job default"/);
});
