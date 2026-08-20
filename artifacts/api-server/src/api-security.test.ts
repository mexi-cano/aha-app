import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { createApp, shouldTrustPlatformProxy } from "./app";
import { hashAccessCode } from "./lib/auth";

async function withServer(
  run: (baseUrl: string) => Promise<void>,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const app = createApp(environment);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const { port } = server.address() as AddressInfo;
    await run(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

test("data routes require bearer auth and auth errors redact secrets", async () => {
  const previousHash = process.env.ACCESS_CODE_HASH;
  const previousSecret = process.env.AUTH_TOKEN_SECRET;
  process.env.ACCESS_CODE_HASH = await hashAccessCode("never-log-this-code");
  process.env.AUTH_TOKEN_SECRET = "independent-test-token-secret-with-32-bytes";
  try {
    await withServer(async (baseUrl) => {
      const protectedResponse = await fetch(`${baseUrl}/api/jobs`);
      assert.equal(protectedResponse.status, 401);

      const accepted = await fetch(`${baseUrl}/api/auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessCode: "never-log-this-code" }),
      });
      assert.equal(accepted.status, 200);
      const responseText = await accepted.text();
      assert.equal(responseText.includes("never-log-this-code"), false);
      const token = JSON.parse(responseText) as { token: string };
      assert.ok(token.token.length > 40);

      const lowercaseBearer = await fetch(`${baseUrl}/api/ahas?limit=0`, {
        headers: { Authorization: `bearer ${token.token}` },
      });
      assert.equal(lowercaseBearer.status, 400);

      const tabBearer = await fetch(`${baseUrl}/api/ahas?limit=0`, {
        headers: { Authorization: `BEARER\t${token.token}` },
      });
      assert.equal(tabBearer.status, 400);

      for (const authorization of [
        "Bearer",
        "Bearer    ",
        `Bearer ${token.token} extra`,
      ]) {
        const rejected = await fetch(`${baseUrl}/api/ahas?limit=0`, {
          headers: { Authorization: authorization },
        });
        assert.equal(rejected.status, 401);
      }
    });
  } finally {
    if (previousHash === undefined) delete process.env.ACCESS_CODE_HASH;
    else process.env.ACCESS_CODE_HASH = previousHash;
    if (previousSecret === undefined) delete process.env.AUTH_TOKEN_SECRET;
    else process.env.AUTH_TOKEN_SECRET = previousSecret;
  }
});

test("auth limits the sixth failed attempt from one IP", async () => {
  const previousHash = process.env.ACCESS_CODE_HASH;
  const previousSecret = process.env.AUTH_TOKEN_SECRET;
  process.env.ACCESS_CODE_HASH = await hashAccessCode("rate-limit-code");
  process.env.AUTH_TOKEN_SECRET = "another-independent-secret-with-32-bytes";
  try {
    await withServer(async (baseUrl) => {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const response = await fetch(`${baseUrl}/api/auth`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accessCode: "wrong" }),
        });
        assert.equal(response.status, 401);
      }
      const limited = await fetch(`${baseUrl}/api/auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessCode: "wrong" }),
      });
      assert.equal(limited.status, 429);
    });

    await withServer(async (baseUrl) => {
      const freshLimiter = await fetch(`${baseUrl}/api/auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessCode: "wrong" }),
      });
      assert.equal(freshLimiter.status, 401);
    });
  } finally {
    if (previousHash === undefined) delete process.env.ACCESS_CODE_HASH;
    else process.env.ACCESS_CODE_HASH = previousHash;
    if (previousSecret === undefined) delete process.env.AUTH_TOKEN_SECRET;
    else process.env.AUTH_TOKEN_SECRET = previousSecret;
  }
});

test("Replit preview trusts one proxy hop for per-IP rate limiting", async () => {
  assert.equal(
    shouldTrustPlatformProxy({ NODE_ENV: "development", REPL_ID: "preview" }),
    true,
  );
  assert.equal(shouldTrustPlatformProxy({ NODE_ENV: "development" }), false);

  const previousHash = process.env.ACCESS_CODE_HASH;
  const previousSecret = process.env.AUTH_TOKEN_SECRET;
  process.env.ACCESS_CODE_HASH = await hashAccessCode(
    "forwarded-rate-limit-code",
  );
  process.env.AUTH_TOKEN_SECRET = "forwarded-rate-limit-secret-with-32-bytes";

  try {
    await withServer(
      async (baseUrl) => {
        const attempt = (address: string) =>
          fetch(`${baseUrl}/api/auth`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Forwarded-For": address,
            },
            body: JSON.stringify({ accessCode: "wrong" }),
          });

        for (let count = 0; count < 5; count += 1) {
          assert.equal((await attempt("198.51.100.10")).status, 401);
        }
        assert.equal((await attempt("198.51.100.11")).status, 401);
        assert.equal((await attempt("198.51.100.10")).status, 429);
      },
      { ...process.env, NODE_ENV: "development", REPL_ID: "preview" },
    );
  } finally {
    if (previousHash === undefined) delete process.env.ACCESS_CODE_HASH;
    else process.env.ACCESS_CODE_HASH = previousHash;
    if (previousSecret === undefined) delete process.env.AUTH_TOKEN_SECRET;
    else process.env.AUTH_TOKEN_SECRET = previousSecret;
  }
});

test("malformed and oversized JSON receive bounded generic problems", async () => {
  await withServer(async (baseUrl) => {
    const malformed = await fetch(`${baseUrl}/api/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not-json",
    });
    assert.equal(malformed.status, 400);
    assert.match(
      malformed.headers.get("content-type") ?? "",
      /^application\/problem\+json/,
    );
    assert.equal(
      ((await malformed.json()) as { code: string }).code,
      "invalid-request-body",
    );

    const oversized = await fetch(`${baseUrl}/api/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessCode: "x".repeat(8 * 1024) }),
    });
    assert.equal(oversized.status, 413);
    assert.equal(
      ((await oversized.json()) as { code: string }).code,
      "request-too-large",
    );

    const oversizedData = await fetch(`${baseUrl}/api/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: "x".repeat(1024 * 1024) }),
    });
    assert.equal(oversizedData.status, 413);

    const oversizedPdf = await fetch(`${baseUrl}/api/ahas/aha-1/pdf`, {
      method: "PUT",
      headers: { "Content-Type": "application/pdf" },
      body: Buffer.alloc(5 * 1024 * 1024 + 1, 65),
    });
    assert.equal(oversizedPdf.status, 413);

    const missing = await fetch(`${baseUrl}/api/not-a-route`);
    assert.equal(missing.status, 404);
    assert.match(
      missing.headers.get("content-type") ?? "",
      /^application\/problem\+json/,
    );
  });
});
