import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FileCatalogStore } from "./catalogStore.js";

const directories: string[] = [];

async function createStore(): Promise<FileCatalogStore> {
  const directory = await mkdtemp(join(tmpdir(), "regali-vicini-catalog-"));
  directories.push(directory);
  return new FileCatalogStore(join(directory, "catalog.json"));
}

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("FileCatalogStore", () => {
  it("persists automatic imports and serializes simultaneous writes", async () => {
    const store = await createStore();

    const [first, second] = await Promise.all([
      store.importDrafts([
        {
          url: "https://www.facebook.com/groups/regali/posts/101",
          sourceName: "Regali Milano",
          sourceText: "Regalo tavolo in legno.",
        },
      ]),
      store.importDrafts([
        {
          url: "https://www.facebook.com/groups/regali/posts/202",
          sourceName: "Regali Milano",
          sourceText: "Regalo computer funzionante.",
        },
      ]),
    ]);

    expect(first.added + second.added).toBe(2);
    expect(await store.list()).toHaveLength(2);
  });

  it("updates and removes a saved listing", async () => {
    const store = await createStore();
    await store.importDrafts([
      {
        url: "https://www.facebook.com/groups/regali/posts/303",
        sourceName: "Regali Milano",
        sourceText: "Regalo passeggino completo.",
      },
    ]);
    const [listing] = await store.list();

    expect(await store.updateStatus(listing.id, "richiesto")).toMatchObject({
      status: "richiesto",
    });
    expect(await store.remove(listing.id)).toBe(true);
    expect(await store.list()).toEqual([]);
  });
});
