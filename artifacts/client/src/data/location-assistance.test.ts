import assert from "node:assert/strict";
import test from "node:test";

import {
  cityOrAreaLocationSuggestion,
  jobDefaultLocationSuggestion,
} from "../features/location-assistance";

test("city or area suggestions are explicit, trimmed, and hidden when redundant", () => {
  assert.equal(cityOrAreaLocationSuggestion("  Raleigh  ", ""), "Raleigh");
  assert.equal(cityOrAreaLocationSuggestion("Raleigh", " Raleigh "), null);
  assert.equal(cityOrAreaLocationSuggestion("   ", "Site"), null);
});

test("job-default suggestions preserve the configured value exactly", () => {
  assert.equal(
    jobDefaultLocationSuggestion(" Gate 2 — south entrance ", "Other site"),
    " Gate 2 — south entrance ",
  );
  assert.equal(jobDefaultLocationSuggestion("Site", " Site "), null);
  assert.equal(jobDefaultLocationSuggestion("  ", "Other site"), null);
});
