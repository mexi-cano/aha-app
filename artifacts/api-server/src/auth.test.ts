import assert from "node:assert/strict";
import test from "node:test";

import {
  hashAccessCode,
  issueAccessToken,
  verifyAccessCode,
  verifyAccessToken,
  type AuthConfig,
} from "./lib/auth";

test("access codes use salted versioned scrypt hashes", async () => {
  const first = await hashAccessCode("crew-only-code");
  const second = await hashAccessCode("crew-only-code");
  assert.match(first, /^scrypt:v1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/);
  assert.notEqual(first, second);
  assert.equal(first.includes("crew-only-code"), false);
  assert.equal(await verifyAccessCode("crew-only-code", first), true);
  assert.equal(await verifyAccessCode("wrong-code", first), false);
});

test("bearer tokens reject tampering, expiry, and access-code rotation", async () => {
  const now = new Date("2026-08-20T12:00:00.000Z");
  const config: AuthConfig = {
    accessCodeHash: await hashAccessCode("pilot-code"),
    tokenSecret: "a-long-independent-token-secret-with-32-bytes",
  };
  const { token, expiresAt } = issueAccessToken(config, now);
  assert.equal(expiresAt, "2026-09-19T12:00:00.000Z");
  assert.equal(verifyAccessToken(token, config, now), true);
  assert.equal(verifyAccessToken(`${token.slice(0, -1)}x`, config, now), false);
  assert.equal(verifyAccessToken(token, config, new Date(expiresAt)), false);
  assert.equal(
    verifyAccessToken(
      token,
      { ...config, accessCodeHash: await hashAccessCode("rotated-code") },
      now,
    ),
    false,
  );
});
