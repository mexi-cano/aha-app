import assert from "node:assert/strict";
import test from "node:test";

import {
  BackupConstraintError,
  translateBackupStoreError,
} from "./lib/backup-store";

test("backup store translates direct and wrapped database constraints", () => {
  assert.ok(
    translateBackupStoreError({ code: "23505" }) instanceof
      BackupConstraintError,
  );
  assert.ok(
    translateBackupStoreError({ cause: { code: "23503" } }) instanceof
      BackupConstraintError,
  );
});

test("backup store preserves unrelated database failures", () => {
  const failure = { code: "57014" };
  assert.equal(translateBackupStoreError(failure), failure);
});
