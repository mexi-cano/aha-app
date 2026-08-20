import { ahaDatabase } from "./database";

export const AUTH_TOKEN_SETTING = "authToken";
export const AUTH_EXPIRES_AT_SETTING = "authExpiresAt";
export const AUTHORIZED_BEFORE_SETTING = "authorizedBefore";

export async function getStoredAuthToken(): Promise<string | null> {
  return (await ahaDatabase.settings.get(AUTH_TOKEN_SETTING))?.value ?? null;
}

export async function storeAuthorization(
  token: string,
  expiresAt: string,
): Promise<void> {
  await ahaDatabase.transaction("rw", ahaDatabase.settings, async () => {
    await ahaDatabase.settings.bulkPut([
      { key: AUTH_TOKEN_SETTING, value: token },
      { key: AUTH_EXPIRES_AT_SETTING, value: expiresAt },
      { key: AUTHORIZED_BEFORE_SETTING, value: "true" },
    ]);
  });
}

export async function hasAuthorizedBefore(): Promise<boolean> {
  return Boolean(await ahaDatabase.settings.get(AUTHORIZED_BEFORE_SETTING));
}
