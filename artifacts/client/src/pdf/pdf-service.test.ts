import assert from "node:assert/strict";
import test from "node:test";

import type { AhaPdfRecord } from "../data/database";

import { shareOrDownloadPdf } from "./pdf-service";
import { supportsNativeFileShare } from "./share-capability";

test("native file sharing requires both Web Share and positive file support", () => {
  assert.equal(supportsNativeFileShare(true, true), true);
  assert.equal(supportsNativeFileShare(true, false), false);
  assert.equal(supportsNativeFileShare(true, null), false);
  assert.equal(supportsNativeFileShare(false, true), false);
});

const record: AhaPdfRecord = {
  ahaId: "aha-1",
  filename: "aha-1.pdf",
  bytes: new Uint8Array([1, 2, 3, 4]).buffer,
  generatedAt: "2026-08-20T12:00:00.000Z",
  sourceRevision: 4,
};

test("native PDF sharing uses the stored filename and exact bytes", async () => {
  let sharedData: ShareData | undefined;
  const result = await shareOrDownloadPdf(record, {
    navigator: {
      canShare: () => true,
      share: async (data) => {
        sharedData = data;
      },
    },
    download: () => assert.fail("download should not run"),
    createFile: (value) =>
      new File([value.bytes.slice(0)], value.filename, {
        type: "application/pdf",
      }),
  });

  assert.deepEqual(result, { status: "shared" });
  const file = sharedData?.files?.[0];
  assert.ok(file instanceof File);
  assert.equal(file.name, record.filename);
  assert.deepEqual(
    new Uint8Array(await file.arrayBuffer()),
    new Uint8Array(record.bytes),
  );
});

test("unsupported sharing downloads and native cancellation stays silent", async () => {
  let downloaded: AhaPdfRecord | null = null;
  const fallback = await shareOrDownloadPdf(record, {
    navigator: {},
    download: (value) => {
      downloaded = value;
    },
    createFile: (value) => new File([], value.filename),
  });
  assert.deepEqual(fallback, { status: "downloaded" });
  assert.equal(downloaded, record);

  const cancelled = await shareOrDownloadPdf(record, {
    navigator: {
      canShare: () => true,
      share: async () => {
        throw new DOMException("cancelled", "AbortError");
      },
    },
    download: () => assert.fail("download should not run"),
    createFile: (value) => new File([], value.filename),
  });
  assert.deepEqual(cancelled, { status: "cancelled" });

  const nonDomCancellation = await shareOrDownloadPdf(record, {
    navigator: {
      canShare: () => true,
      share: async () => {
        throw { name: "AbortError" };
      },
    },
    download: () => assert.fail("download should not run"),
    createFile: (value) => new File([], value.filename),
  });
  assert.deepEqual(nonDomCancellation, { status: "cancelled" });
});
