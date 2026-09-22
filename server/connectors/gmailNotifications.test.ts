import { describe, expect, it } from "vitest";
import { extractFacebookUrls } from "./gmailNotifications.js";

describe("Gmail notification connector", () => {
  it("extracts direct and Facebook redirect links while discarding other domains", () => {
    const urls = extractFacebookUrls(
      "Guarda https://l.facebook.com/l.php?u=https%3A%2F%2Fwww.facebook.com%2Fgroups%2Fregali%2Fposts%2F42%2F%3Fref%3Dshare e https://example.com/altro.",
    );

    expect(urls).toEqual(["https://www.facebook.com/groups/regali/posts/42"]);
  });
});
