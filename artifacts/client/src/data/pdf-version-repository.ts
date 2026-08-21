import { customFetch } from "@workspace/api-client-react";

import { getStoredAuthToken } from "./auth-storage";
import {
  ahaDatabase,
  ahaPdfRevisionKey,
  type AhaPdfRevisionRecord,
} from "./database";
import {
  AUTHORIZATION_REQUIRED_EVENT,
  parseRemotePdfVersionMetadata,
  parseRestoredPdfMetadata,
  sha256Hex,
} from "./pdf-backup-metadata";

export class PdfVersionUnavailableOfflineError extends Error {
  readonly name = "PdfVersionUnavailableOfflineError";
}

export interface PdfVersionOpenResult {
  record: AhaPdfRevisionRecord & { bytes: ArrayBuffer };
  cached: boolean;
}

export function isStorageQuotaError(error: unknown): boolean {
  let current = error;
  const seen = new Set<unknown>();
  for (let depth = 0; depth < 4; depth += 1) {
    if (!current || typeof current !== "object" || seen.has(current)) {
      return false;
    }
    seen.add(current);
    const candidate = current as {
      name?: unknown;
      cause?: unknown;
      inner?: unknown;
    };
    if (candidate.name === "QuotaExceededError") return true;
    current = candidate.cause ?? candidate.inner;
  }
  return false;
}

export async function refreshPdfVersionMetadata(ahaId: string): Promise<void> {
  const values = await customFetch<unknown[]>(
    `/api/ahas/${encodeURIComponent(ahaId)}/pdf/versions`,
    { responseType: "json" },
  );
  const revisions = values
    .map(parseRemotePdfVersionMetadata)
    .filter((version) => !version.isCurrent);
  await ahaDatabase.transaction("rw", ahaDatabase.ahaPdfRevisions, async () => {
    for (const revision of revisions) {
      const key = ahaPdfRevisionKey(
        revision.ahaId,
        revision.sourceRevision,
        revision.generatedAt,
      );
      const existing = await ahaDatabase.ahaPdfRevisions.get(key);
      await ahaDatabase.ahaPdfRevisions.put({
        key,
        ahaId: revision.ahaId,
        filename: revision.filename,
        bytes: existing?.bytes ?? null,
        generatedAt: revision.generatedAt,
        sourceRevision: revision.sourceRevision,
        byteLength: revision.byteLength,
        sha256: revision.sha256,
        backedUpAt: revision.backedUpAt,
        supersededAt: revision.supersededAt ?? revision.backedUpAt,
      });
    }
  });
}

async function fetchExactPdfVersion(
  revision: AhaPdfRevisionRecord,
): Promise<ArrayBuffer> {
  const token = await getStoredAuthToken();
  const query = new URLSearchParams({ generatedAt: revision.generatedAt });
  const response = await fetch(
    `/api/ahas/${encodeURIComponent(revision.ahaId)}/pdf/versions/${revision.sourceRevision}?${query}`,
    { headers: token ? { Authorization: `Bearer ${token}` } : undefined },
  );
  if (response.status === 401) {
    window.dispatchEvent(new Event(AUTHORIZATION_REQUIRED_EVENT));
  }
  if (!response.ok) {
    throw new Error("The older PDF could not be downloaded.");
  }
  const bytes = await response.arrayBuffer();
  const checksum = await sha256Hex(bytes);
  const metadata = parseRestoredPdfMetadata(response.headers, checksum);
  if (
    metadata.sourceRevision !== revision.sourceRevision ||
    metadata.generatedAt !== revision.generatedAt ||
    (revision.sha256 &&
      revision.sha256.toLowerCase() !== checksum.toLowerCase())
  ) {
    throw new Error("The older PDF did not match its saved version metadata.");
  }
  return bytes;
}

export async function openPdfRevision(
  revision: AhaPdfRevisionRecord,
): Promise<PdfVersionOpenResult> {
  if (revision.bytes) {
    return {
      record: { ...revision, bytes: revision.bytes },
      cached: true,
    };
  }
  if (!navigator.onLine) {
    throw new PdfVersionUnavailableOfflineError(
      "Connect to download this older PDF. The current AHA remains saved.",
    );
  }
  const bytes = await fetchExactPdfVersion(revision);
  const record = { ...revision, bytes };
  try {
    await ahaDatabase.ahaPdfRevisions.put(record);
    return { record, cached: true };
  } catch (error) {
    if (isStorageQuotaError(error)) {
      return { record, cached: false };
    }
    throw error;
  }
}
