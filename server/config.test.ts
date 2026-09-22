import { describe, expect, it } from "vitest";
import { getConnectorStatuses, readServerConfig } from "./config.js";

describe("connector configuration", () => {
  it("reports every required setting when no credentials are present", () => {
    const statuses = getConnectorStatuses(readServerConfig({}));

    expect(statuses).toEqual([
      expect.objectContaining({
        id: "meta-pages",
        configured: false,
        missing: expect.arrayContaining(["META_APP_ID", "META_PAGE_IDS"]),
      }),
      expect.objectContaining({
        id: "gmail-notifications",
        configured: false,
        missing: expect.arrayContaining(["GMAIL_CLIENT_ID"]),
      }),
    ]);
  });

  it("recognizes complete local Meta Pages configuration", () => {
    const statuses = getConnectorStatuses(
      readServerConfig({
        META_APP_ID: "123",
        META_APP_SECRET: "a-secret-value",
        META_REDIRECT_URI: "http://127.0.0.1:8787/api/auth/meta/callback",
        META_PAGE_IDS: "101, 202",
        TOKEN_ENCRYPTION_KEY: "a-long-local-encryption-key-for-testing",
      }),
    );

    expect(statuses[0]).toEqual({
      id: "meta-pages",
      configured: true,
      missing: [],
    });
  });
});
