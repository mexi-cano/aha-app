import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createApp } from "./app";

test("GET /api/healthz returns the skeleton health contract", async (t) => {
  const app = createApp({ NODE_ENV: "test" });
  const server = app.listen(0, "127.0.0.1");

  t.after(async () => {
    if (!server.listening) return;

    server.close();
    await once(server, "close");
  });

  await once(server, "listening");

  const address = server.address() as AddressInfo;
  const response = await fetch(
    `http://127.0.0.1:${address.port}/api/healthz`,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
});
