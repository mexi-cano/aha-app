import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";

import {
  BackupConstraintError,
  decodeCursor,
  InvalidCursorError,
  type BackupStore,
  translateBackupStoreError,
} from "./lib/backup-store";
import { issueAccessToken, type AuthConfig } from "./lib/auth";
import { createDataRouter } from "./routes/data";

test("backup store translates direct and wrapped database constraints", () => {
  assert.ok(
    translateBackupStoreError({ code: "23505" }) instanceof
      BackupConstraintError,
  );
  assert.ok(
    translateBackupStoreError({ cause: { code: "23503" } }) instanceof
      BackupConstraintError,
  );
});

test("backup store preserves unrelated database failures", () => {
  const failure = { code: "57014" };
  assert.equal(translateBackupStoreError(failure), failure);
});

test("restore cursors fail with a typed error", () => {
  assert.throws(() => decodeCursor("not-a-cursor"), InvalidCursorError);
  const invalidPayload = Buffer.from(
    JSON.stringify({ clientUpdatedAt: "not-a-date", id: "aha-1" }),
  ).toString("base64url");
  assert.throws(() => decodeCursor(invalidPayload), InvalidCursorError);
});

test("backup constraints return a generic 409 problem", async () => {
  const store: BackupStore = {
    async listJobs() {
      return [];
    },
    async putJob() {
      throw new Error("not used");
    },
    async listAhas() {
      return { items: [], nextCursor: null };
    },
    async putAha() {
      throw new Error("not used");
    },
    async getPdf() {
      return null;
    },
    async putPdf() {
      throw new BackupConstraintError({ code: "23505" });
    },
  };
  const config: AuthConfig = {
    accessCodeHash: "scrypt:v1:test:test",
    tokenSecret: "test-token-secret-with-at-least-32-bytes",
  };
  const { token } = issueAccessToken(config);
  const app = express();
  app.use(
    "/ahas/:ahaId/pdf",
    express.raw({ type: "application/pdf", limit: "5mb" }),
  );
  app.use(createDataRouter(store, () => config));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const { port } = server.address() as AddressInfo;
    const query = new URLSearchParams({
      filename: "completed.pdf",
      sourceRevision: "1",
      generatedAt: "2026-08-20T12:00:00.000Z",
    });
    const response = await fetch(
      `http://127.0.0.1:${port}/ahas/aha-1/pdf?${query}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/pdf",
        },
        body: Buffer.from("%PDF-test"),
      },
    );
    assert.equal(response.status, 409);
    assert.match(
      response.headers.get("content-type") ?? "",
      /^application\/problem\+json/,
    );
    assert.deepEqual(await response.json(), {
      type: "https://aha.its.example/problems/backup-conflict",
      title: "Backup needs support",
      status: 409,
      detail:
        "The backup conflicts with an existing record and was not applied.",
      code: "backup-conflict",
    });
  } finally {
    server.close();
    await once(server, "close");
  }
});
