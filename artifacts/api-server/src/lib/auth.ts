import {
  createHash,
  createHmac,
  randomBytes,
  scrypt,
  timingSafeEqual,
} from "node:crypto";

const ACCESS_HASH_PREFIX = "scrypt:v1";
const TOKEN_PREFIX = "v1";
const TOKEN_LIFETIME_MS = 30 * 24 * 60 * 60 * 1_000;
const SCRYPT_KEY_LENGTH = 32;
const SCRYPT_OPTIONS = { N: 16_384, r: 8, p: 1 } as const;

export interface AuthConfig {
  accessCodeHash: string;
  tokenSecret: string;
}

interface TokenPayload {
  v: 1;
  iat: number;
  exp: number;
  codeVersion: string;
}

function scryptAsync(value: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      value,
      salt,
      SCRYPT_KEY_LENGTH,
      SCRYPT_OPTIONS,
      (error, derivedKey) => {
        if (error) reject(error);
        else resolve(derivedKey);
      },
    );
  });
}

function parseAccessCodeHash(value: string): {
  salt: Buffer;
  digest: Buffer;
} {
  const [algorithm, version, saltValue, digestValue, extra] = value.split(":");
  if (
    `${algorithm}:${version}` !== ACCESS_HASH_PREFIX ||
    !saltValue ||
    !digestValue ||
    extra !== undefined
  ) {
    throw new Error("ACCESS_CODE_HASH has an unsupported format.");
  }
  const salt = Buffer.from(saltValue, "base64url");
  const digest = Buffer.from(digestValue, "base64url");
  if (salt.length !== 16 || digest.length !== SCRYPT_KEY_LENGTH) {
    throw new Error("ACCESS_CODE_HASH has an invalid salt or digest length.");
  }
  return { salt, digest };
}

export function getAuthConfigFromEnv(
  environment: NodeJS.ProcessEnv = process.env,
): AuthConfig {
  const accessCodeHash = environment.ACCESS_CODE_HASH;
  const tokenSecret = environment.AUTH_TOKEN_SECRET;
  if (!accessCodeHash) throw new Error("ACCESS_CODE_HASH must be set.");
  parseAccessCodeHash(accessCodeHash);
  if (!tokenSecret || Buffer.byteLength(tokenSecret) < 32) {
    throw new Error("AUTH_TOKEN_SECRET must contain at least 32 bytes.");
  }
  return { accessCodeHash, tokenSecret };
}

export async function hashAccessCode(accessCode: string): Promise<string> {
  if (!accessCode || accessCode.length > 128) {
    throw new Error("The access code must contain 1 to 128 characters.");
  }
  const salt = randomBytes(16);
  const digest = await scryptAsync(accessCode, salt);
  return `${ACCESS_HASH_PREFIX}:${salt.toString("base64url")}:${digest.toString("base64url")}`;
}

export async function verifyAccessCode(
  accessCode: string,
  storedHash: string,
): Promise<boolean> {
  const { salt, digest } = parseAccessCodeHash(storedHash);
  const candidate = await scryptAsync(accessCode, salt);
  return timingSafeEqual(candidate, digest);
}

function accessCodeVersion(accessCodeHash: string): string {
  return createHash("sha256").update(accessCodeHash).digest("base64url");
}

function tokenSignature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function issueAccessToken(
  config: AuthConfig,
  now = new Date(),
): { token: string; expiresAt: string } {
  const issuedAt = now.getTime();
  const expiresAt = new Date(issuedAt + TOKEN_LIFETIME_MS);
  const payload: TokenPayload = {
    v: 1,
    iat: issuedAt,
    exp: expiresAt.getTime(),
    codeVersion: accessCodeVersion(config.accessCodeHash),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = tokenSignature(encoded, config.tokenSecret);
  return {
    token: `${TOKEN_PREFIX}.${encoded}.${signature}`,
    expiresAt: expiresAt.toISOString(),
  };
}

export function verifyAccessToken(
  token: string,
  config: AuthConfig,
  now = new Date(),
): boolean {
  const [prefix, encoded, signature, extra] = token.split(".");
  if (
    prefix !== TOKEN_PREFIX ||
    !encoded ||
    !signature ||
    extra !== undefined
  ) {
    return false;
  }
  const expected = tokenSignature(encoded, config.tokenSecret);
  const actualBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (
    actualBytes.length !== expectedBytes.length ||
    !timingSafeEqual(actualBytes, expectedBytes)
  ) {
    return false;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as Partial<TokenPayload>;
    return (
      payload.v === 1 &&
      typeof payload.iat === "number" &&
      typeof payload.exp === "number" &&
      payload.iat <= now.getTime() &&
      payload.exp > now.getTime() &&
      payload.codeVersion === accessCodeVersion(config.accessCodeHash)
    );
  } catch {
    return false;
  }
}
