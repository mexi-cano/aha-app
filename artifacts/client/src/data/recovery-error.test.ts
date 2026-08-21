import assert from "node:assert/strict";
import test from "node:test";

import { ApiError } from "@workspace/api-client-react";

import { recoveryErrorMessage } from "./recovery-error";

function apiError(status: number): ApiError {
  return new ApiError(new Response(null, { status }), null, {
    method: "GET",
    url: "/api/ahas",
  });
}

test("recovery failures use device-safe plain language", () => {
  assert.match(
    recoveryErrorMessage(new TypeError("network"), false),
    /connection/,
  );
  assert.match(recoveryErrorMessage(apiError(401), true), /access code/);
  assert.match(
    recoveryErrorMessage(apiError(404), true),
    /no longer available/,
  );
  assert.match(
    recoveryErrorMessage(apiError(503), true),
    /temporarily unavailable/,
  );
  assert.doesNotMatch(
    recoveryErrorMessage(apiError(503), true),
    /HTTP|503|Service Unavailable/,
  );
});
