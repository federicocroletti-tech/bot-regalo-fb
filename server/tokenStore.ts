import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { OAuthProvider } from "./oauthState.js";

export interface OAuthToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
}

export interface TokenStore {
  read(provider: OAuthProvider): Promise<OAuthToken | undefined>;
  write(provider: OAuthProvider, token: OAuthToken): Promise<void>;
  remove(provider: OAuthProvider): Promise<void>;
}

interface EncryptedToken {
  ciphertext: string;
  iv: string;
  tag: string;
}

type StoredTokens = Partial<Record<OAuthProvider, EncryptedToken>>;

function encryptionKey(secret: string): Buffer {
  return scryptSync(secret, "regali-vicini/local-token-store", 32);
}

function encrypt(value: string, key: Buffer): EncryptedToken {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);

  return {
    ciphertext: ciphertext.toString("base64url"),
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
  };
}

function decrypt(value: EncryptedToken, key: Buffer): string {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(value.iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(value.tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(value.ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function isEncryptedToken(value: unknown): value is EncryptedToken {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return ["ciphertext", "iv", "tag"].every(
    (key) => typeof candidate[key] === "string" && candidate[key].length > 0,
  );
}

export class EncryptedTokenStore implements TokenStore {
  private readonly key: Buffer;

  constructor(
    private readonly filePath: string,
    secret: string,
  ) {
    this.key = encryptionKey(secret);
  }

  async read(provider: OAuthProvider): Promise<OAuthToken | undefined> {
    const storedToken = (await this.readAll())[provider];
    if (!storedToken) return undefined;

    try {
      return JSON.parse(decrypt(storedToken, this.key)) as OAuthToken;
    } catch {
      throw new Error(
        "I token locali non possono essere letti. Ricollega il provider.",
      );
    }
  }

  async write(provider: OAuthProvider, token: OAuthToken): Promise<void> {
    const tokens = await this.readAll();
    tokens[provider] = encrypt(JSON.stringify(token), this.key);
    await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 });
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(tokens), {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(temporaryPath, this.filePath);
  }

  async remove(provider: OAuthProvider): Promise<void> {
    const tokens = await this.readAll();
    delete tokens[provider];
    await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 });
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(tokens), {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(temporaryPath, this.filePath);
  }

  private async readAll(): Promise<StoredTokens> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const tokens: StoredTokens = {};

      for (const provider of ["meta", "gmail"] as const) {
        if (isEncryptedToken(parsed[provider]))
          tokens[provider] = parsed[provider];
      }

      return tokens;
    } catch (error) {
      if (isMissingFile(error)) return {};
      throw new Error("L'archivio locale dei token non e valido.");
    }
  }
}

function isMissingFile(error: unknown): error is NodeJS.ErrnoException {
  return Boolean(
    error &&
    typeof error === "object" &&
    (error as NodeJS.ErrnoException).code === "ENOENT",
  );
}

export function localTokenPath(projectRoot = process.cwd()): string {
  return join(projectRoot, ".data", "connector-tokens.json");
}
