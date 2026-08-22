import assert from "node:assert/strict";
import test from "node:test";

import {
  assertRecoveryMutationAllowedInTransaction,
  assertRecoveryMutationAllowedForSetting,
  RecoveryPausedMutationError,
} from "./recovery-mutation-guard";

test("the authoritative recovery guard blocks a marker discovered at transaction time", async () => {
  assert.doesNotThrow(() => assertRecoveryMutationAllowedForSetting(undefined));
  await assert.doesNotReject(() =>
    assertRecoveryMutationAllowedInTransaction(async () => undefined),
  );
  await assert.rejects(
    () =>
      assertRecoveryMutationAllowedInTransaction(async () => ({
        key: "restoreProgress",
        value: '{"version":1}',
      })),
    RecoveryPausedMutationError,
  );
});
