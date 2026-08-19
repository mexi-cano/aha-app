import assert from "node:assert/strict";
import test from "node:test";

import { createSerializedPersistence } from "./persistence-queue";

test("serialized persistence runs writes one at a time in enqueue order", async () => {
  let releaseFirst!: () => void;
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const started: string[] = [];
  let activeWrites = 0;
  let maximumActiveWrites = 0;

  const persist = createSerializedPersistence(async (value: string) => {
    started.push(value);
    activeWrites += 1;
    maximumActiveWrites = Math.max(maximumActiveWrites, activeWrites);
    if (value === "first") await firstGate;
    activeWrites -= 1;
    return `${value}-saved`;
  });

  const first = persist("first");
  const second = persist("second");
  await Promise.resolve();

  assert.deepEqual(started, ["first"]);
  assert.equal(maximumActiveWrites, 1);

  releaseFirst();
  assert.deepEqual(await Promise.all([first, second]), [
    "first-saved",
    "second-saved",
  ]);
  assert.deepEqual(started, ["first", "second"]);
  assert.equal(maximumActiveWrites, 1);
});

test("serialized persistence continues after a failed write", async () => {
  const started: string[] = [];
  const persist = createSerializedPersistence(async (value: string) => {
    started.push(value);
    if (value === "first") throw new Error("first write failed");
    return `${value}-saved`;
  });

  const first = persist("first");
  const second = persist("second");

  await assert.rejects(first, /first write failed/);
  assert.equal(await second, "second-saved");
  assert.deepEqual(started, ["first", "second"]);
});
