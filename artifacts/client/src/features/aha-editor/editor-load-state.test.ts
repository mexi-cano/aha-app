import assert from "node:assert/strict";
import test from "node:test";

import { getEditorLoadView } from "./editor-load-state";

test("a route-specific load failure takes precedence over a stale snapshot", () => {
  assert.equal(
    getEditorLoadView({
      activeAhaId: "new-aha",
      isLoading: false,
      loadError: {
        ahaId: "new-aha",
        message: "This AHA is not available on this iPad.",
      },
      snapshotAhaId: "previous-aha",
    }),
    "failure",
  );
});

test("a previous route's load failure does not fail the active route", () => {
  assert.equal(
    getEditorLoadView({
      activeAhaId: "new-aha",
      isLoading: false,
      loadError: {
        ahaId: "previous-aha",
        message: "This AHA is not available on this iPad.",
      },
      snapshotAhaId: null,
    }),
    "loading",
  );
});

test("editor load state distinguishes route transitions and ready snapshots", () => {
  assert.equal(
    getEditorLoadView({
      activeAhaId: "new-aha",
      isLoading: false,
      loadError: null,
      snapshotAhaId: "previous-aha",
    }),
    "loading",
  );
  assert.equal(
    getEditorLoadView({
      activeAhaId: "new-aha",
      isLoading: false,
      loadError: null,
      snapshotAhaId: "new-aha",
    }),
    "ready",
  );
  assert.equal(
    getEditorLoadView({
      activeAhaId: "new-aha",
      isLoading: false,
      loadError: null,
      snapshotAhaId: null,
    }),
    "failure",
  );
});
