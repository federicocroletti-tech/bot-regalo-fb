import { describe, expect, it } from "vitest";
import type { CatalogStore } from "./catalogStore.js";
import { readServerConfig } from "./config.js";
import { ConnectorSyncService } from "./syncService.js";
import type { TokenStore } from "./tokenStore.js";

const config = readServerConfig({
  META_APP_ID: "app-id",
  META_APP_SECRET: "app-secret",
  META_REDIRECT_URI: "http://127.0.0.1:8787/api/auth/meta/callback",
  META_PAGE_IDS: "12345",
  TOKEN_ENCRYPTION_KEY: "a-long-local-encryption-key-for-testing",
});

describe("ConnectorSyncService", () => {
  it("stores candidates returned by an authorized Meta Page", async () => {
    let importedSourceText = "";
    const catalogStore: CatalogStore = {
      list: async () => [],
      importDrafts: async (drafts) => {
        importedSourceText = drafts[0]?.sourceText ?? "";
        return { added: 1, ignored: 0, notGiveaway: 0, listings: [] };
      },
      remove: async () => false,
      updateStatus: async () => undefined,
    };
    const tokenStore: TokenStore = {
      read: async () => ({
        accessToken: "user-token",
        expiresAt: "2030-01-01T00:00:00.000Z",
      }),
      remove: async () => undefined,
      write: async () => undefined,
    };
    const syncService = new ConnectorSyncService(
      config,
      catalogStore,
      tokenStore,
      async (request) =>
        new Response(
          JSON.stringify(
            request.toString().includes("/me/accounts")
              ? {
                  data: [
                    {
                      id: "12345",
                      name: "Pagina di prova",
                      access_token: "page-token",
                    },
                  ],
                }
              : {
                  data: [
                    { id: "12345_678", message: "Regalo una sedia in legno." },
                  ],
                },
          ),
        ),
    );

    await expect(syncService.sync("meta-pages")).resolves.toMatchObject({
      added: 1,
      connector: "meta-pages",
    });
    expect(importedSourceText).toBe("Regalo una sedia in legno.");
  });
});
