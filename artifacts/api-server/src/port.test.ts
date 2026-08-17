import assert from "node:assert/strict";
import test from "node:test";
import { parsePort } from "./lib/port";

test("parsePort accepts the valid port boundaries", () => {
  assert.equal(parsePort("1"), 1);
  assert.equal(parsePort("65535"), 65535);
});

test("parsePort rejects missing input", () => {
  assert.throws(
    () => parsePort(undefined),
    /PORT environment variable is required but was not provided/,
  );
});

for (const rawPort of ["Infinity", "1.5", "65536", "0", "-1", "NaN"]) {
  test(`parsePort rejects invalid PORT value ${rawPort}`, () => {
    assert.throws(
      () => parsePort(rawPort),
      new Error(`Invalid PORT value: "${rawPort}"`),
    );
  });
}
