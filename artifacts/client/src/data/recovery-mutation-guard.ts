import {
  ahaDatabase,
  RESTORE_PROGRESS_SETTING,
  type AppSetting,
} from "./database";

export class RecoveryPausedMutationError extends Error {
  readonly name = "RecoveryPausedMutationError";

  constructor() {
    super("Finish the paused recovery before changing safety records.");
  }
}

export async function hasPendingRecovery(): Promise<boolean> {
  return Boolean(await ahaDatabase.settings.get(RESTORE_PROGRESS_SETTING));
}

export async function assertRecoveryMutationAllowed(): Promise<void> {
  assertRecoveryMutationAllowedForSetting(
    await ahaDatabase.settings.get(RESTORE_PROGRESS_SETTING),
  );
}

export function assertRecoveryMutationAllowedForSetting(
  setting: AppSetting | undefined,
): void {
  if (setting) throw new RecoveryPausedMutationError();
}

/**
 * Call only from a Dexie transaction that includes the settings table. This
 * second check is authoritative when recovery starts in another tab after the
 * fast preflight guard has passed.
 */
export async function assertRecoveryMutationAllowedInTransaction(
  readSetting: () => Promise<AppSetting | undefined> = () =>
    ahaDatabase.settings.get(RESTORE_PROGRESS_SETTING),
): Promise<void> {
  assertRecoveryMutationAllowedForSetting(await readSetting());
}
