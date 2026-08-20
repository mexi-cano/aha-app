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
