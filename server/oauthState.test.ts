import { describe, expect, it } from "vitest";
import { OAuthStateStore } from "./oauthState.js";

describe("OAuthStateStore", () => {
  it("accepts a state once for its provider", () => {
    const states = new OAuthStateStore();
    const state = states.issue("meta");

    expect(states.consume("meta", state)).toBe(true);
    expect(states.consume("meta", state)).toBe(false);
  });

  it("rejects expired states", () => {
    let currentTime = 10;
    const states = new OAuthStateStore(100, () => currentTime);
    const state = states.issue("gmail");
    currentTime += 100;

    expect(states.consume("gmail", state)).toBe(false);
  });
});
