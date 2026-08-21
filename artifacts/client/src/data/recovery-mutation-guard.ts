import { ahaDatabase, RESTORE_PROGRESS_SETTING } from "./database";

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
  if (await hasPendingRecovery()) throw new RecoveryPausedMutationError();
}
