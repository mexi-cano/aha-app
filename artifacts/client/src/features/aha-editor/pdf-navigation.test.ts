import assert from "node:assert/strict";
import test from "node:test";

import {
  createPdfNavigationState,
  parsePdfReturnDestination,
  resolvePdfReturnNavigation,
} from "./pdf-navigation";

test("PDF return navigation accepts only typed internal destinations", () => {
  assert.equal(
    parsePdfReturnDestination(createPdfNavigationState("home")),
    "home",
  );
  assert.equal(parsePdfReturnDestination({ pdfReturnTo: "/admin" }), null);
  assert.equal(
    parsePdfReturnDestination({ pdfReturnTo: "https://example.com" }),
    null,
  );
});

test("invalid PDF return state defaults by AHA date", () => {
  assert.deepEqual(
    resolvePdfReturnNavigation(
      { pdfReturnTo: "https://example.com" },
      "aha-today",
      "2026-08-20",
      "2026-08-20",
    ),
    { path: "/ahas/aha-today/completed", label: "Completed" },
  );
  assert.deepEqual(
    resolvePdfReturnNavigation(null, "aha-old", "2026-08-19", "2026-08-20"),
    { path: "/history", label: "History" },
  );
});
