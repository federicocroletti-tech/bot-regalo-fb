import { describe, expect, it } from "vitest";
import { createMetaAuthorizationUrl, syncMetaPagePosts } from "./metaPages.js";
import { readServerConfig } from "../config.js";

const config = readServerConfig({
  META_APP_ID: "app-id",
  META_APP_SECRET: "app-secret",
  META_REDIRECT_URI: "http://127.0.0.1:8787/api/auth/meta/callback",
  META_PAGE_IDS: "12345",
  TOKEN_ENCRYPTION_KEY: "a-long-local-encryption-key-for-testing",
});

describe("Meta Pages connector", () => {
  it("creates a least-privilege authorization URL without exposing the app secret", () => {
    const url = new URL(createMetaAuthorizationUrl(config, "state-value"));

    expect(url.searchParams.get("scope")).toBe(
      "pages_show_list,pages_read_engagement",
    );
    expect(url.searchParams.get("state")).toBe("state-value");
    expect(url.search).not.toContain("app-secret");
  });

  it("turns authorized Page posts into catalog candidates", async () => {
    const requests: URL[] = [];
    const result = await syncMetaPagePosts(
      config,
      "user-access-token",
      async (request) => {
        requests.push(new URL(request.toString()));
        const isAccountsRequest = request.toString().includes("/me/accounts");
        return new Response(
          JSON.stringify(
            isAccountsRequest
              ? {
                  data: [
                    {
                      access_token: "page-access-token",
                      id: "12345",
                      name: "Pagina di prova",
                    },
                  ],
                }
              : {
                  data: [
                    {
                      id: "12345_67890",
                      message: "Regalo un tavolo in legno, ritiro oggi.",
                      permalink_url: "https://www.facebook.com/12345_67890",
                      created_time: "2026-09-22T10:00:00+0000",
                    },
                  ],
                },
          ),
          { status: 200 },
        );
      },
    );

    expect(result.listings).toEqual([
      expect.objectContaining({
        externalId: "meta:12345_67890",
        sourceName: "Pagina di prova",
        url: "https://www.facebook.com/12345_67890",
      }),
    ]);
    expect(requests).toHaveLength(2);
    expect(requests[1].searchParams.get("access_token")).toBe(
      "page-access-token",
    );
    expect(requests[1].searchParams.get("appsecret_proof")).toMatch(
      /^[a-f0-9]{64}$/,
    );
  });
});
