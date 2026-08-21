export const AUTHORIZATION_REQUIRED_EVENT = "aha-authorization-required";

export interface RemotePdfVersionMetadata {
  ahaId: string;
  filename: string;
  sourceRevision: number;
  generatedAt: string;
  byteLength: number;
  sha256: string;
  backedUpAt: string;
  supersededAt: string | null;
  isCurrent: boolean;
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function parseRestoredPdfMetadata(
  headers: Headers,
  computedChecksum: string,
): {
  filename: string;
  sourceRevision: number;
  generatedAt: string;
} {
  const expectedChecksum = headers.get("X-Content-SHA256")?.trim();
  if (
    !expectedChecksum ||
    !/^[a-f0-9]{64}$/i.test(expectedChecksum) ||
    computedChecksum.toLowerCase() !== expectedChecksum.toLowerCase()
  ) {
    throw new Error("A restored PDF did not pass its checksum check.");
  }

  const filenameHeader = headers.get("X-AHA-Filename");
  const revisionHeader = headers.get("X-AHA-Source-Revision");
  const generatedAt = headers.get("X-AHA-Generated-At");
  const sourceRevision =
    revisionHeader === null ? Number.NaN : Number(revisionHeader);
  if (
    !filenameHeader ||
    !Number.isInteger(sourceRevision) ||
    sourceRevision < 0 ||
    !generatedAt ||
    Number.isNaN(Date.parse(generatedAt))
  ) {
    throw new Error("A restored PDF has invalid metadata.");
  }

  let filename: string;
  try {
    filename = decodeURIComponent(filenameHeader);
  } catch {
    throw new Error("A restored PDF has invalid metadata.");
  }
  if (!filename) throw new Error("A restored PDF has invalid metadata.");

  return { filename, sourceRevision, generatedAt };
}

export function parseRemotePdfVersionMetadata(
  value: unknown,
): RemotePdfVersionMetadata {
  if (!value || typeof value !== "object") {
    throw new Error("Saved PDF history is invalid.");
  }
  const record = value as Partial<RemotePdfVersionMetadata>;
  if (
    typeof record.ahaId !== "string" ||
    !record.ahaId ||
    typeof record.filename !== "string" ||
    !record.filename ||
    !Number.isInteger(record.sourceRevision) ||
    record.sourceRevision! < 0 ||
    typeof record.generatedAt !== "string" ||
    Number.isNaN(Date.parse(record.generatedAt)) ||
    !Number.isInteger(record.byteLength) ||
    record.byteLength! < 1 ||
    typeof record.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/i.test(record.sha256) ||
    typeof record.backedUpAt !== "string" ||
    Number.isNaN(Date.parse(record.backedUpAt)) ||
    !(
      record.supersededAt === null ||
      (typeof record.supersededAt === "string" &&
        !Number.isNaN(Date.parse(record.supersededAt)))
    ) ||
    typeof record.isCurrent !== "boolean"
  ) {
    throw new Error("Saved PDF history is invalid.");
  }
  return record as RemotePdfVersionMetadata;
}
