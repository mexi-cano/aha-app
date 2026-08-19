import assert from "node:assert/strict";
import test from "node:test";

import {
  ignoreConfirmedConstraint,
  shouldCreateDevSourceAha,
} from "./dev-fixture";

test("an empty development fixture slot is seeded once across repeated initialization", () => {
  let hasSourceId = false;
  let hasJobDate = false;
  let created = 0;
  const initialize = () => {
    if (!shouldCreateDevSourceAha(hasSourceId, hasJobDate)) return;
    created += 1;
    hasSourceId = true;
    hasJobDate = true;
  };

  initialize();
  initialize();
  assert.equal(created, 1);
});

test("a real AHA occupying the fixture job/date is never replaced", () => {
  assert.equal(shouldCreateDevSourceAha(false, true), false);
  assert.equal(shouldCreateDevSourceAha(true, false), false);
  assert.equal(shouldCreateDevSourceAha(true, true), false);
});

test("a concurrent constraint is ignored only after the target is confirmed", async () => {
  await ignoreConfirmedConstraint(
    async () => {
      throw { name: "ConstraintError" };
    },
    async () => true,
  );

  await assert.rejects(
    ignoreConfirmedConstraint(
      async () => {
        throw { name: "ConstraintError" };
      },
      async () => false,
    ),
    (error: unknown) =>
      typeof error === "object" &&
      error !== null &&
      "name" in error &&
      error.name === "ConstraintError",
  );

  await assert.rejects(
    ignoreConfirmedConstraint(
      async () => {
        throw { name: "DataError" };
      },
      async () => true,
    ),
  );
});
