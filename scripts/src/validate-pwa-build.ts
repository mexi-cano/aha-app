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
const html = await readFile(path.join(publicDirectory, "index.html"), "utf8");
const manifest = JSON.parse(
  await readFile(path.join(publicDirectory, "manifest.webmanifest"), "utf8"),
) as {
  scope?: string;
  start_url?: string;
  icons?: Array<{
    src?: string;
    sizes?: string;
    type?: string;
    purpose?: string;
  }>;
};

const expectedIcons = [
  {
    src: "its-pwa-192.png",
    sizes: "192x192",
    type: "image/png",
  },
  {
    src: "its-pwa-512.png",
    sizes: "512x512",
    type: "image/png",
  },
  {
    src: "its-pwa-maskable-512.png",
    sizes: "512x512",
    type: "image/png",
    purpose: "maskable",
  },
];

async function assertOpaqueSquarePng(
  filename: string,
  expectedSize: number,
): Promise<void> {
  const bytes = await readFile(path.join(publicDirectory, filename));
  assert.deepEqual(
    Array.from(bytes.subarray(0, 8)),
    [137, 80, 78, 71, 13, 10, 26, 10],
    `${filename} must be a PNG.`,
  );
  assert.equal(bytes.toString("ascii", 12, 16), "IHDR");
  assert.equal(bytes.readUInt32BE(16), expectedSize);
  assert.equal(bytes.readUInt32BE(20), expectedSize);
  assert.equal(
    bytes[25],
    2,
    `${filename} must use opaque RGB pixels so masked icons never reveal an unintended background.`,
  );
}

const precacheMatch = serviceWorker.match(/precacheAndRoute\((\[.*?\]),\{\}\)/);
assert.ok(
  precacheMatch,
  "The service worker must contain a precache manifest.",
);
const urls = Array.from(
  precacheMatch[1]!.matchAll(/(?:^|\{)url:"([^"]+)"/g),
  (match) => match[1]!,
);
const assetBasenames = new Set(
  urls.map((url) => url.split("?")[0]!.split("/").at(-1)),
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
  /its-favicon-32\.png$/,
  /its-apple-touch-icon\.png$/,
  /its-pwa-192\.png$/,
  /its-pwa-512\.png$/,
  /its-pwa-maskable-512\.png$/,
]) {
  assert.ok(
    urls.some((url) => pattern.test(url)),
    `Missing precache asset: ${pattern}`,
  );
}
for (const retiredAsset of [
  "favicon.svg",
  "apple-touch-icon.png",
  "pwa-192.png",
  "pwa-512.png",
]) {
  assert.equal(
    assetBasenames.has(retiredAsset),
    false,
    `Retired placeholder icon is still precached: ${retiredAsset}`,
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
assert.deepEqual(manifest.icons, expectedIcons);
assert.match(html, /its-favicon-32\.png/);
assert.match(html, /its-apple-touch-icon\.png/);

await Promise.all([
  assertOpaqueSquarePng("its-favicon-32.png", 32),
  assertOpaqueSquarePng("its-apple-touch-icon.png", 180),
  assertOpaqueSquarePng("its-pwa-192.png", 192),
  assertOpaqueSquarePng("its-pwa-512.png", 512),
  assertOpaqueSquarePng("its-pwa-maskable-512.png", 512),
]);

process.stdout.write(
  `Validated ${urls.length} unique offline assets and safe update behavior.\n`,
);
