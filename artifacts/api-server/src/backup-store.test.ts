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
    async listPdfVersions() {
      return [];
    },
    async getPdfVersion() {
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

test("PDF version routes list metadata and return one exact no-store artifact", async () => {
  const generatedAt = "2026-08-20T12:00:00.000Z";
  const bytes = Buffer.from("%PDF-history");
  const sha256 = "ab".repeat(32);
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
    async listPdfVersions(ahaId) {
      return [
        {
          ahaId,
          filename: "completed history.pdf",
          sourceRevision: 2,
          generatedAt,
          byteLength: bytes.byteLength,
          sha256,
          backedUpAt: "2026-08-20T12:01:00.000Z",
          supersededAt: "2026-08-20T13:00:00.000Z",
          isCurrent: false,
        },
      ];
    },
    async getPdfVersion(ahaId, sourceRevision, requestedGeneratedAt) {
      return ahaId === "aha-1" &&
        sourceRevision === 2 &&
        requestedGeneratedAt === generatedAt
        ? {
            ahaId,
            filename: "completed history.pdf",
            sourceRevision,
            generatedAt,
            bytes,
            sha256,
            backedUpAt: "2026-08-20T12:01:00.000Z",
          }
        : null;
    },
    async putPdf() {
      throw new Error("not used");
    },
  };
  const config: AuthConfig = {
    accessCodeHash: "scrypt:v1:test:test",
    tokenSecret: "test-token-secret-with-at-least-32-bytes",
  };
  const { token } = issueAccessToken(config);
  const app = express();
  app.use(createDataRouter(store, () => config));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const { port } = server.address() as AddressInfo;
    const headers = { Authorization: `Bearer ${token}` };
    const listResponse = await fetch(
      `http://127.0.0.1:${port}/ahas/aha-1/pdf/versions`,
      { headers },
    );
    assert.equal(listResponse.status, 200);
    assert.deepEqual(
      await listResponse.json(),
      await store.listPdfVersions("aha-1"),
    );

    const query = new URLSearchParams({ generatedAt });
    const versionResponse = await fetch(
      `http://127.0.0.1:${port}/ahas/aha-1/pdf/versions/2?${query}`,
      { headers },
    );
    assert.equal(versionResponse.status, 200);
    assert.equal(versionResponse.headers.get("cache-control"), "no-store");
    assert.equal(versionResponse.headers.get("x-content-sha256"), sha256);
    assert.equal(
      decodeURIComponent(versionResponse.headers.get("x-aha-filename") ?? ""),
      "completed history.pdf",
    );
    assert.deepEqual(Buffer.from(await versionResponse.arrayBuffer()), bytes);
  } finally {
    server.close();
    await once(server, "close");
  }
});
