import assert from "node:assert/strict";
import test from "node:test";

import {
  LocalDataInitializationError,
  classifyLocalDataError,
  openLocalDataWithRecovery,
} from "./local-data-initialization";

test("classifies stale-version errors separately from storage failures", () => {
  assert.equal(
    classifyLocalDataError({ name: "VersionError" }),
    "app_update_required",
  );
  assert.equal(
    classifyLocalDataError({ name: "DatabaseClosedError" }),
    "storage_unavailable",
  );
  assert.equal(
    classifyLocalDataError({
      name: "LocalDataInitializationError",
      kind: "app_update_required",
    }),
    "app_update_required",
  );
  assert.equal(
    classifyLocalDataError(new Error("no access")),
    "storage_unavailable",
  );
});

test("reopens once after a transient closed-database failure", async () => {
  let opens = 0;
  let closes = 0;
  await openLocalDataWithRecovery({
    async open() {
      opens += 1;
      if (opens === 1) throw { name: "DatabaseClosedError" };
    },
    close(options) {
      closes += 1;
      assert.deepEqual(options, { disableAutoOpen: false });
    },
  });
  assert.equal(opens, 2);
  assert.equal(closes, 1);
});

test("does not retry when the tab is running an older database version", async () => {
  let opens = 0;
  await assert.rejects(
    openLocalDataWithRecovery({
      async open() {
        opens += 1;
        throw { name: "VersionError" };
      },
      close() {
        assert.fail("a version mismatch must not be reopened in place");
      },
    }),
    (error: unknown) =>
      error instanceof LocalDataInitializationError &&
      error.kind === "app_update_required",
  );
  assert.equal(opens, 1);
});

test("reports the retry error when recovery cannot reopen storage", async () => {
  let opens = 0;
  await assert.rejects(
    openLocalDataWithRecovery({
      async open() {
        opens += 1;
        throw {
          name: opens === 1 ? "DatabaseClosedError" : "VersionError",
        };
      },
      close() {},
    }),
    (error: unknown) =>
      error instanceof LocalDataInitializationError &&
      error.kind === "app_update_required",
  );
});
