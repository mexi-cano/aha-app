export type LocalDataFailureKind =
  "app_update_required" | "storage_unavailable";

interface LocalDatabaseHandle {
  open(): PromiseLike<unknown>;
  close(options: { disableAutoOpen: boolean }): void;
}

const APP_UPDATE_ERROR_NAMES = new Set(["VersionError", "VersionChangeError"]);
const RETRYABLE_ERROR_NAMES = new Set([
  "AbortError",
  "DatabaseClosedError",
  "InvalidStateError",
  "UnknownError",
]);

function errorName(error: unknown): string | null {
  if (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    typeof error.name === "string"
  ) {
    return error.name;
  }
  return null;
}

export function classifyLocalDataError(error: unknown): LocalDataFailureKind {
  if (
    typeof error === "object" &&
    error !== null &&
    "kind" in error &&
    (error.kind === "app_update_required" ||
      error.kind === "storage_unavailable")
  ) {
    return error.kind;
  }
  return APP_UPDATE_ERROR_NAMES.has(errorName(error) ?? "")
    ? "app_update_required"
    : "storage_unavailable";
}

export class LocalDataInitializationError extends Error {
  readonly kind: LocalDataFailureKind;
  readonly cause: unknown;

  constructor(cause: unknown) {
    const kind = classifyLocalDataError(cause);
    super(
      kind === "app_update_required"
        ? "This tab needs the latest app version before it can open local data."
        : "The local database could not be opened.",
    );
    this.name = "LocalDataInitializationError";
    this.kind = kind;
    this.cause = cause;
  }
}

export async function openLocalDataWithRecovery(
  database: LocalDatabaseHandle,
): Promise<void> {
  try {
    await database.open();
    return;
  } catch (error) {
    if (!RETRYABLE_ERROR_NAMES.has(errorName(error) ?? "")) {
      throw new LocalDataInitializationError(error);
    }
  }

  try {
    database.close({ disableAutoOpen: false });
    await database.open();
  } catch (error) {
    throw new LocalDataInitializationError(error);
  }
}
