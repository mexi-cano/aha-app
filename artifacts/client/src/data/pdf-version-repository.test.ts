import assert from "node:assert/strict";
import test from "node:test";

import { isStorageQuotaError } from "./pdf-version-repository";

test("PDF history caching recognizes browser and Dexie-wrapped quota failures", () => {
  assert.equal(isStorageQuotaError({ name: "QuotaExceededError" }), true);
  assert.equal(
    isStorageQuotaError({
      name: "DexieError",
      inner: { name: "QuotaExceededError" },
    }),
    true,
  );
  assert.equal(isStorageQuotaError(new Error("another failure")), false);
});
