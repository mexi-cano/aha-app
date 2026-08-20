import assert from "node:assert/strict";
import test from "node:test";

import { getPdfOpenMode } from "./pdf-view-capability";

test("iOS and iPadOS use the native PDF viewer", () => {
  assert.equal(
    getPdfOpenMode({
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
      platform: "iPhone",
      maxTouchPoints: 5,
    }),
    "native",
  );
  assert.equal(
    getPdfOpenMode({
      userAgent: "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)",
      platform: "iPad",
      maxTouchPoints: 5,
    }),
    "native",
  );
  assert.equal(
    getPdfOpenMode({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)",
      platform: "MacIntel",
      maxTouchPoints: 5,
    }),
    "native",
  );
});

test("desktop and Android browsers retain the embedded PDF viewer", () => {
  for (const environment of [
    {
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      platform: "MacIntel",
      maxTouchPoints: 0,
    },
    {
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      platform: "Win32",
      maxTouchPoints: 0,
    },
    {
      userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel Tablet)",
      platform: "Linux armv8l",
      maxTouchPoints: 5,
    },
  ]) {
    assert.equal(getPdfOpenMode(environment), "embedded");
  }
});
