import assert from "node:assert/strict";
import test from "node:test";

import { supportsNativeFileShare } from "./share-capability";

test("native file sharing requires both Web Share and positive file support", () => {
  assert.equal(supportsNativeFileShare(true, true), true);
  assert.equal(supportsNativeFileShare(true, false), false);
  assert.equal(supportsNativeFileShare(true, null), false);
  assert.equal(supportsNativeFileShare(false, true), false);
});
