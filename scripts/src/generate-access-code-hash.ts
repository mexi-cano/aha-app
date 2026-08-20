import { randomBytes, scrypt } from "node:crypto";

const SCRYPT_OPTIONS = { N: 16_384, r: 8, p: 1 } as const;

function readSecret(): Promise<string> {
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    const chunks: Buffer[] = [];
    if (!input.isTTY) {
      input.on("data", (chunk: Buffer) => chunks.push(chunk));
      input.on("end", () =>
        resolve(
          Buffer.concat(chunks)
            .toString("utf8")
            .replace(/[\r\n]+$/, ""),
        ),
      );
      input.on("error", reject);
      input.resume();
      return;
    }

    process.stderr.write("Access code (input hidden): ");
    input.setRawMode(true);
    input.setEncoding("utf8");
    let value = "";
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      input.off("data", onData);
      input.setRawMode(false);
      input.pause();
      process.stderr.write("\n");
      resolve(value);
    };
    const onData = (chunk: string) => {
      for (const character of chunk) {
        if (character === "\u0003") {
          input.setRawMode(false);
          process.exit(130);
        } else if (character === "\r" || character === "\n") {
          finish();
          return;
        } else if (character === "\u007f") {
          value = value.slice(0, -1);
        } else {
          value += character;
        }
      }
    };
    input.on("data", onData);
    input.on("error", reject);
    input.resume();
  });
}

function derive(value: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(value, salt, 32, SCRYPT_OPTIONS, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

const accessCode = await readSecret();
if (!accessCode || accessCode.length > 128) {
  throw new Error("The access code must contain 1 to 128 characters.");
}
const salt = randomBytes(16);
const digest = await derive(accessCode, salt);
process.stdout.write(
  `scrypt:v1:${salt.toString("base64url")}:${digest.toString("base64url")}\n`,
);
