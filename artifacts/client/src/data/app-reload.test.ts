import assert from "node:assert/strict";
import test from "node:test";

import {
  createStartupDiagnostic,
  recordStartupDiagnostic,
  requestAppReload,
} from "./app-reload";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => void values.delete(key),
    setItem: (key: string, value: string) => void values.set(key, value),
    values,
  };
}

test("classifies only unmarked browser reloads as externally initiated", () => {
  assert.equal(
    createStartupDiagnostic({
      occurredAt: "2026-08-21T12:00:00.000Z",
      initialPath: "/ahas/aha-1/work",
      navigationType: "reload",
      requestedReloadReason: null,
    }).externallyInitiatedReload,
    true,
  );
  assert.equal(
    createStartupDiagnostic({
      occurredAt: "2026-08-21T12:00:00.000Z",
      initialPath: "/",
      navigationType: "reload",
      requestedReloadReason: "pwa_update",
    }).externallyInitiatedReload,
    false,
  );
});

test("intentional reload markers are consumed into one non-sensitive record", () => {
  const storage = memoryStorage();
  let reloaded = false;
  requestAppReload(
    "manual_error_retry",
    storage,
    () => void (reloaded = true),
  );
  assert.equal(reloaded, true);

  const diagnostic = recordStartupDiagnostic(
    storage,
    {
      getEntriesByType: () =>
        [{ type: "reload" }] as unknown as PerformanceEntryList,
    },
    "/ahas/aha-1/details?ignored=true",
    new Date("2026-08-21T12:00:00.000Z"),
    { info: () => undefined },
  );

  assert.deepEqual(diagnostic, {
    occurredAt: "2026-08-21T12:00:00.000Z",
    initialPath: "/ahas/aha-1/details?ignored=true",
    navigationType: "reload",
    requestedReloadReason: "manual_error_retry",
    externallyInitiatedReload: false,
  });
  assert.equal(storage.values.has("its-aha:requested-reload-reason"), false);
  assert.equal(storage.values.size, 1);
  assert.doesNotMatch(
    storage.values.get("its-aha:last-startup-diagnostic")!,
    /worker|signature|hazard/i,
  );
});

test("malformed markers and unavailable diagnostics storage never block reload", () => {
  const malformedStorage = memoryStorage({
    "its-aha:requested-reload-reason": "not-a-reload-reason",
  });
  const malformedDiagnostic = recordStartupDiagnostic(
    malformedStorage,
    {
      getEntriesByType: () =>
        [{ type: "reload" }] as unknown as PerformanceEntryList,
    },
    "/",
    new Date("2026-08-21T12:00:00.000Z"),
    { info: () => undefined },
  );
  assert.equal(malformedDiagnostic.requestedReloadReason, null);
  assert.equal(malformedDiagnostic.externallyInitiatedReload, true);
  assert.equal(
    malformedStorage.values.has("its-aha:requested-reload-reason"),
    false,
  );

  const throwingStorage = {
    getItem: () => {
      throw new Error("blocked");
    },
    removeItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  };
  let reloads = 0;
  requestAppReload(
    "storage_version_recovery",
    throwingStorage,
    () => void (reloads += 1),
  );
  assert.equal(reloads, 1);

  const diagnostic = recordStartupDiagnostic(
    throwingStorage,
    { getEntriesByType: () => [] },
    "/",
    new Date("2026-08-21T12:00:00.000Z"),
    { info: () => undefined },
  );
  assert.equal(diagnostic.requestedReloadReason, null);
  assert.equal(diagnostic.navigationType, "unknown");
});
