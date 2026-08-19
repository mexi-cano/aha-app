import assert from "node:assert/strict";
import test from "node:test";

import { getForemanWorkerId } from "./crew-presentation";

const crew = [
  { workerId: "worker-1", name: "  Crew Lead " },
  { workerId: "worker-2", name: "CREW LEAD" },
  { workerId: "worker-3", name: "Jordan Reed" },
];

test("foreman matching ignores surrounding whitespace and letter case", () => {
  assert.equal(getForemanWorkerId(crew, " crew lead "), "worker-1");
});

test("duplicate foreman names consistently select the first crew member", () => {
  assert.equal(getForemanWorkerId(crew, "CREW LEAD"), "worker-1");
});

test("a blank person in charge does not mark a blank crew name as foreman", () => {
  assert.equal(
    getForemanWorkerId([{ workerId: "worker-1", name: " " }], "  "),
    null,
  );
});
