import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyEmergencyContact,
  normalizeStandaloneEmergencyContact,
} from "../src/index";

test("standalone North American emergency numbers normalize idempotently", () => {
  const examples = [
    ["9195550182", "(919) 555-0182"],
    ["919-555-0182", "(919) 555-0182"],
    ["(919) 555.0182", "(919) 555-0182"],
    ["1 919 555 0182", "+1 (919) 555-0182"],
    ["+1 (919) 555-0182", "+1 (919) 555-0182"],
    ["9-1-1", "911"],
    ["911", "911"],
  ] as const;

  for (const [input, expected] of examples) {
    const normalized = normalizeStandaloneEmergencyContact(input);
    assert.equal(normalized, expected);
    assert.equal(normalizeStandaloneEmergencyContact(normalized), expected);
  }
});

test("compound, extended, international, and ambiguous contacts remain exact", () => {
  const values = [
    "911 / Site safety: (919) 555-0182",
    "(919) 555-0182 ext. 4",
    "+44 20 7946 0958",
    "Call the site radio",
    "919555018",
    "  compound instructions  ",
  ];
  for (const value of values) {
    assert.equal(normalizeStandaloneEmergencyContact(value), value);
  }
});

test("contact classification recognizes supported dialable instructions", () => {
  assert.equal(classifyEmergencyContact(" \n "), "blank");
  assert.equal(classifyEmergencyContact("911"), "recognized");
  assert.equal(classifyEmergencyContact("9-1-1"), "recognized");
  assert.equal(
    classifyEmergencyContact("911 / Site safety: (919) 555-0182"),
    "recognized",
  );
  assert.equal(
    classifyEmergencyContact("Call (919) 555-0182 ext. 4"),
    "recognized",
  );
  assert.equal(classifyEmergencyContact("+44 20 7946 0958"), "recognized");
  assert.equal(classifyEmergencyContact("919555018"), "unrecognized");
  assert.equal(classifyEmergencyContact("Call the site radio"), "unrecognized");
});
