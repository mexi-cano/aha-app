import {
  canonicalizePdfTimestamp,
  isSamePdfVersionIdentity,
} from "@workspace/aha-domain";
import { customFetch } from "@workspace/api-client-react";

import { getStoredAuthToken } from "./auth-storage";
import {
  ahaDatabase,
  ahaPdfRevisionKey,
  type AppSetting,
  type AhaPdfRevisionRecord,
} from "./database";
import {
  AUTHORIZATION_REQUIRED_EVENT,
  parseRemotePdfVersionMetadata,
  parseRestoredPdfMetadata,
  sha256Hex,
  type RemotePdfVersionMetadata,
} from "./pdf-backup-metadata";

export type PdfVersionFailureKind =
  | "offline"
  | "authorization"
  | "not_found"
  | "unavailable"
  | "integrity"
  | "request";

export class PdfVersionOpenError extends Error {
  readonly name: string = "PdfVersionOpenError";

  constructor(
    readonly kind: PdfVersionFailureKind,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export class PdfVersionUnavailableOfflineError extends PdfVersionOpenError {
  readonly name = "PdfVersionUnavailableOfflineError";

  constructor() {
    super(
      "offline",
      "Connect to download this older PDF. The current AHA remains saved.",
    );
  }
}

export class PdfVersionIntegrityError extends PdfVersionOpenError {
  readonly name = "PdfVersionIntegrityError";

  constructor(message: string, options?: ErrorOptions) {
    super("integrity", message, options);
  }
}

export interface PdfVersionOpenResult {
  record: AhaPdfRevisionRecord & { bytes: ArrayBuffer };
  cached: boolean;
}

export interface PdfRevisionReconciliationPlan {
  puts: AhaPdfRevisionRecord[];
  deleteKeys: string[];
  conflictKeys: string[];
  conflicts: PdfVersionIntegrityConflict[];
}

export interface PdfVersionIntegrityConflict {
  key: string;
  sourceRevision: number;
  generatedAt: string;
  localKeys: string[];
}

export interface PdfVersionIntegrityState {
  version: 1;
  ahaId: string;
  detectedAt: string;
  conflicts: PdfVersionIntegrityConflict[];
}

export interface PdfVersionMetadataRefreshResult {
  conflicts: PdfVersionIntegrityConflict[];
}

const PDF_VERSION_INTEGRITY_SETTING_PREFIX = "pdfVersionIntegrity:";

function pdfVersionIntegritySettingKey(ahaId: string): string {
  return `${PDF_VERSION_INTEGRITY_SETTING_PREFIX}${ahaId}`;
}

function parsePdfVersionIntegritySetting(
  setting: AppSetting | undefined,
): PdfVersionIntegrityState | null {
  if (!setting) return null;
  try {
    const value = JSON.parse(
      setting.value,
    ) as Partial<PdfVersionIntegrityState>;
    if (
      value.version !== 1 ||
      typeof value.ahaId !== "string" ||
      typeof value.detectedAt !== "string" ||
      !Array.isArray(value.conflicts)
    ) {
      return null;
    }
    const conflicts = value.conflicts.filter(
      (conflict): conflict is PdfVersionIntegrityConflict =>
        Boolean(conflict) &&
        typeof conflict.key === "string" &&
        Number.isInteger(conflict.sourceRevision) &&
        typeof conflict.generatedAt === "string" &&
        Array.isArray(conflict.localKeys) &&
        conflict.localKeys.every((key) => typeof key === "string"),
    );
    return {
      version: 1,
      ahaId: value.ahaId,
      detectedAt: value.detectedAt,
      conflicts,
    };
  } catch {
    return null;
  }
}

export async function getPdfVersionIntegrityState(
  ahaId: string,
): Promise<PdfVersionIntegrityState | null> {
  return parsePdfVersionIntegritySetting(
    await ahaDatabase.settings.get(pdfVersionIntegritySettingKey(ahaId)),
  );
}

export function isPdfRevisionAffectedByIntegrityConflict(
  revision: Pick<
    AhaPdfRevisionRecord,
    "key" | "ahaId" | "sourceRevision" | "generatedAt"
  >,
  state: PdfVersionIntegrityState | null,
): boolean {
  if (!state || state.ahaId !== revision.ahaId) return false;
  let canonicalKey: string | null = null;
  try {
    canonicalKey = ahaPdfRevisionKey(
      revision.ahaId,
      revision.sourceRevision,
      revision.generatedAt,
    );
  } catch {
    // Invalid legacy aliases can still be identified by their stored key.
  }
  return state.conflicts.some(
    (conflict) =>
      conflict.key === canonicalKey ||
      conflict.localKeys.includes(revision.key),
  );
}

export function mergePdfVersionIntegrityConflicts(
  detected: readonly PdfVersionIntegrityConflict[],
  previous: readonly PdfVersionIntegrityConflict[],
  remoteKeys: ReadonlySet<string>,
): PdfVersionIntegrityConflict[] {
  const conflictsByKey = new Map(
    detected.map((conflict) => [conflict.key, conflict]),
  );
  for (const conflict of previous) {
    if (!remoteKeys.has(conflict.key) && !conflictsByKey.has(conflict.key)) {
      conflictsByKey.set(conflict.key, conflict);
    }
  }
  return [...conflictsByKey.values()];
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

function isCanonicalAlias(
  local: AhaPdfRevisionRecord,
  remote: RemotePdfVersionMetadata,
): boolean {
  if (
    local.ahaId !== remote.ahaId ||
    local.sourceRevision !== remote.sourceRevision
  ) {
    return false;
  }
  try {
    return canonicalizePdfTimestamp(local.generatedAt) === remote.generatedAt;
  } catch {
    return false;
  }
}

export async function planPdfRevisionReconciliation(
  existing: readonly AhaPdfRevisionRecord[],
  remoteValues: readonly RemotePdfVersionMetadata[],
  checksum: (bytes: ArrayBuffer) => Promise<string> = sha256Hex,
): Promise<PdfRevisionReconciliationPlan> {
  const puts: AhaPdfRevisionRecord[] = [];
  const deleteKeys = new Set<string>();
  const conflictKeys = new Set<string>();
  const remoteByKey = new Map<string, RemotePdfVersionMetadata>();

  for (const remote of remoteValues) {
    const key = ahaPdfRevisionKey(
      remote.ahaId,
      remote.sourceRevision,
      remote.generatedAt,
    );
    const duplicate = remoteByKey.get(key);
    if (
      duplicate &&
      duplicate.sha256.toLowerCase() !== remote.sha256.toLowerCase()
    ) {
      conflictKeys.add(key);
      continue;
    }
    remoteByKey.set(key, remote);
  }

  for (const [key, remote] of remoteByKey) {
    if (conflictKeys.has(key)) continue;
    const aliases = existing.filter((record) =>
      isCanonicalAlias(record, remote),
    );
    let conflict = aliases.some(
      (record) =>
        record.sha256 !== null &&
        record.sha256.toLowerCase() !== remote.sha256.toLowerCase(),
    );

    for (const record of aliases) {
      if (!record.bytes) continue;
      if (
        (await checksum(record.bytes)).toLowerCase() !==
        remote.sha256.toLowerCase()
      ) {
        conflict = true;
      }
    }

    if (conflict) {
      conflictKeys.add(key);
      continue;
    }

    const cached = aliases.find((record) => record.bytes !== null);
    puts.push({
      key,
      ahaId: remote.ahaId,
      filename: remote.filename,
      bytes: cached?.bytes ?? null,
      generatedAt: remote.generatedAt,
      sourceRevision: remote.sourceRevision,
      byteLength: remote.byteLength,
      sha256: remote.sha256,
      backedUpAt: remote.backedUpAt,
      supersededAt: remote.supersededAt ?? remote.backedUpAt,
    });
    for (const alias of aliases) {
      if (alias.key !== key) deleteKeys.add(alias.key);
    }
  }

  return {
    puts,
    deleteKeys: [...deleteKeys],
    conflictKeys: [...conflictKeys],
    conflicts: [...conflictKeys].flatMap((key) => {
      const remote = remoteByKey.get(key);
      if (!remote) return [];
      return [
        {
          key,
          sourceRevision: remote.sourceRevision,
          generatedAt: remote.generatedAt,
          localKeys: existing
            .filter((record) => isCanonicalAlias(record, remote))
            .map((record) => record.key),
        },
      ];
    }),
  };
}

export async function refreshPdfVersionMetadata(
  ahaId: string,
): Promise<PdfVersionMetadataRefreshResult> {
  const values = await customFetch<unknown[]>(
    `/api/ahas/${encodeURIComponent(ahaId)}/pdf/versions`,
    { responseType: "json" },
  );
  const revisions = values
    .map(parseRemotePdfVersionMetadata)
    .filter((version) => !version.isCurrent);
  const existing = await ahaDatabase.ahaPdfRevisions
    .where("ahaId")
    .equals(ahaId)
    .toArray();
  const plan = await planPdfRevisionReconciliation(existing, revisions);
  const remoteKeys = new Set(
    revisions.map((revision) =>
      ahaPdfRevisionKey(
        revision.ahaId,
        revision.sourceRevision,
        revision.generatedAt,
      ),
    ),
  );

  const integritySettingKey = pdfVersionIntegritySettingKey(ahaId);
  let persistedConflicts = plan.conflicts;
  await ahaDatabase.transaction(
    "rw",
    ahaDatabase.ahaPdfRevisions,
    ahaDatabase.settings,
    async () => {
      for (const record of plan.puts) {
        await ahaDatabase.ahaPdfRevisions.put(record);
      }
      if (plan.deleteKeys.length) {
        await ahaDatabase.ahaPdfRevisions.bulkDelete(plan.deleteKeys);
      }
      const previous = parsePdfVersionIntegritySetting(
        await ahaDatabase.settings.get(integritySettingKey),
      );
      persistedConflicts = mergePdfVersionIntegrityConflicts(
        plan.conflicts,
        previous?.conflicts ?? [],
        remoteKeys,
      );
      if (persistedConflicts.length) {
        const state: PdfVersionIntegrityState = {
          version: 1,
          ahaId,
          detectedAt: previous?.detectedAt ?? new Date().toISOString(),
          conflicts: persistedConflicts,
        };
        await ahaDatabase.settings.put({
          key: integritySettingKey,
          value: JSON.stringify(state),
        });
      } else {
        await ahaDatabase.settings.delete(integritySettingKey);
      }
    },
  );
  return { conflicts: persistedConflicts };
}

async function fetchExactPdfVersion(
  revision: AhaPdfRevisionRecord,
): Promise<ArrayBuffer> {
  const token = await getStoredAuthToken();
  const generatedAt = canonicalizePdfTimestamp(revision.generatedAt);
  const query = new URLSearchParams({ generatedAt });
  let response: Response;
  try {
    response = await fetch(
      `/api/ahas/${encodeURIComponent(revision.ahaId)}/pdf/versions/${revision.sourceRevision}?${query}`,
      { headers: token ? { Authorization: `Bearer ${token}` } : undefined },
    );
  } catch (cause) {
    throw new PdfVersionOpenError(
      "unavailable",
      "Saved PDF history is temporarily unavailable. Try again.",
      { cause },
    );
  }
  if (response.status === 401) {
    window.dispatchEvent(new Event(AUTHORIZATION_REQUIRED_EVENT));
    throw new PdfVersionOpenError(
      "authorization",
      "Enter the crew access code, then try this PDF again.",
    );
  }
  if (response.status === 404) {
    throw new PdfVersionOpenError(
      "not_found",
      "This saved version is listed, but its PDF is not available to download. Its metadata remains saved.",
    );
  }
  if (response.status >= 500) {
    throw new PdfVersionOpenError(
      "unavailable",
      "Saved PDF history is temporarily unavailable. Try again.",
    );
  }
  if (!response.ok) {
    throw new PdfVersionOpenError(
      "request",
      "We couldn't download that older PDF. Try again.",
    );
  }

  const bytes = await response.arrayBuffer();
  const checksum = await sha256Hex(bytes);
  let metadata: ReturnType<typeof parseRestoredPdfMetadata>;
  try {
    metadata = parseRestoredPdfMetadata(response.headers, checksum);
  } catch (cause) {
    throw new PdfVersionIntegrityError(
      "That PDF failed verification and was not opened or saved.",
      { cause },
    );
  }
  if (
    !isSamePdfVersionIdentity(metadata, revision) ||
    (revision.sha256 &&
      revision.sha256.toLowerCase() !== checksum.toLowerCase())
  ) {
    throw new PdfVersionIntegrityError(
      "That PDF did not match its saved version and was not opened or saved.",
    );
  }
  return bytes;
}

export async function openPdfRevision(
  revision: AhaPdfRevisionRecord,
): Promise<PdfVersionOpenResult> {
  if (
    isPdfRevisionAffectedByIntegrityConflict(
      revision,
      await getPdfVersionIntegrityState(revision.ahaId),
    )
  ) {
    throw new PdfVersionIntegrityError(
      "This PDF version has conflicting verification details. It was not opened or changed.",
    );
  }
  if (revision.bytes) {
    if (
      revision.sha256 &&
      (await sha256Hex(revision.bytes)).toLowerCase() !==
        revision.sha256.toLowerCase()
    ) {
      throw new PdfVersionIntegrityError(
        "That offline PDF failed verification and was not opened.",
      );
    }
    return {
      record: { ...revision, bytes: revision.bytes },
      cached: true,
    };
  }
  if (!navigator.onLine) throw new PdfVersionUnavailableOfflineError();

  const bytes = await fetchExactPdfVersion(revision);
  const generatedAt = canonicalizePdfTimestamp(revision.generatedAt);
  const record = {
    ...revision,
    key: ahaPdfRevisionKey(
      revision.ahaId,
      revision.sourceRevision,
      generatedAt,
    ),
    generatedAt,
    bytes,
  };
  try {
    await ahaDatabase.ahaPdfRevisions.put(record);
    return { record, cached: true };
  } catch (error) {
    if (isStorageQuotaError(error)) return { record, cached: false };
    throw error;
  }
}
