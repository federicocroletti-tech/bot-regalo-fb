import { describe, expect, it } from "vitest";
import { createMetaCallbackRedirectUrl } from "./metaCallbackProxy.js";

describe("Meta callback proxy", () => {
  it("forwards only the Meta OAuth callback to the loopback API", () => {
    const redirectUrl = createMetaCallbackRedirectUrl(
      "/api/auth/meta/callback?code=one-time-code&state=csrf-state",
      8787,
    );

    expect(redirectUrl).toBe(
      "http://127.0.0.1:8787/api/auth/meta/callback?code=one-time-code&state=csrf-state",
    );
  });

  it("rejects paths other than the OAuth callback", () => {
    expect(
      createMetaCallbackRedirectUrl("/api/listings", 8787),
    ).toBeUndefined();
    expect(createMetaCallbackRedirectUrl(undefined, 8787)).toBeUndefined();
  });
});
