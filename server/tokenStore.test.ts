import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { EncryptedTokenStore } from "./tokenStore.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("EncryptedTokenStore", () => {
  it("stores OAuth tokens encrypted and restores them for the matching provider", async () => {
    const directory = await mkdtemp(join(tmpdir(), "regali-vicini-"));
    directories.push(directory);
    const path = join(directory, "tokens.json");
    const store = new EncryptedTokenStore(
      path,
      "a-local-encryption-secret-with-enough-length",
    );

    await store.write("meta", {
      accessToken: "meta-access-token-that-must-not-be-plain-text",
      expiresAt: "2026-10-01T00:00:00.000Z",
    });

    expect(await store.read("meta")).toEqual({
      accessToken: "meta-access-token-that-must-not-be-plain-text",
      expiresAt: "2026-10-01T00:00:00.000Z",
    });
    expect(await store.read("gmail")).toBeUndefined();
    expect(await readFile(path, "utf8")).not.toContain(
      "meta-access-token-that-must-not-be-plain-text",
    );
  });
});
