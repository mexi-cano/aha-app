import assert from "node:assert/strict";
import test from "node:test";

import { createRetryableMemoizedLoader } from "./retryable-memo";

test("retryable memoization retries failures and shares successful loads", async () => {
  let attempts = 0;
  const load = createRetryableMemoizedLoader(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("temporary asset failure");
    return { attempt: attempts };
  });

  await assert.rejects(load(), /temporary asset failure/);
  const firstSuccess = load();
  const concurrentSuccess = load();
  assert.equal(firstSuccess, concurrentSuccess);
  assert.deepEqual(await firstSuccess, { attempt: 2 });
  assert.deepEqual(await load(), { attempt: 2 });
  assert.equal(attempts, 2);
});
