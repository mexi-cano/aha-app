import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const publicDirectory = path.resolve(
  import.meta.dirname,
  "../../artifacts/client/dist/public",
);
const serviceWorker = await readFile(
  path.join(publicDirectory, "sw.js"),
  "utf8",
);
const manifest = JSON.parse(
  await readFile(path.join(publicDirectory, "manifest.webmanifest"), "utf8"),
) as { scope?: string; start_url?: string };

const precacheMatch = serviceWorker.match(/precacheAndRoute\((\[.*?\]),\{\}\)/);
assert.ok(
  precacheMatch,
  "The service worker must contain a precache manifest.",
);
const urls = Array.from(
  precacheMatch[1]!.matchAll(/(?:^|\{)url:"([^"]+)"/g),
  (match) => match[1]!,
);
assert.ok(urls.length > 0, "The precache manifest must contain URLs.");
assert.equal(
  new Set(urls).size,
  urls.length,
  "Every offline URL must be precached once.",
);
for (const pattern of [
  /index\.html$/,
  /aha-app-.*\.js$/,
  /aha-pdf-.*\.js$/,
  /Barlow-.*\.ttf$/,
  /its-logo-.*\.png$/,
  /aha-energy-wheel-.*\.png$/,
  /pwa-192\.png$/,
  /pwa-512\.png$/,
]) {
  assert.ok(
    urls.some((url) => pattern.test(url)),
    `Missing precache asset: ${pattern}`,
  );
}
assert.equal(
  urls.some((url) => url.includes("/api")),
  false,
);
assert.match(serviceWorker, /cleanupOutdatedCaches/);
assert.match(serviceWorker, /denylist:\[\/\^\\\/api/);
assert.match(serviceWorker, /SKIP_WAITING/);
assert.equal((serviceWorker.match(/skipWaiting\(\)/g) ?? []).length, 1);
assert.equal(serviceWorker.includes("clientsClaim"), false);
assert.match(serviceWorker, /NetworkOnly/);
assert.equal(typeof manifest.scope, "string");
assert.equal(manifest.scope, manifest.start_url);

process.stdout.write(
  `Validated ${urls.length} unique offline assets and safe update behavior.\n`,
);
