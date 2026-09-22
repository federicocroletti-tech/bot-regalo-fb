import { describe, expect, it } from "vitest";
import { classifyListing } from "./classifier";

describe("classifyListing", () => {
  it("identifies and categorizes an Italian giveaway listing", () => {
    const listing = classifyListing(
      "Regalo divano tre posti, ritiro a Milano entro venerdi.",
    );

    expect(listing).toMatchObject({
      category: "Arredamento",
      isGiveaway: true,
      score: 60,
    });
    expect(listing.title).toBe(
      "Regalo divano tre posti, ritiro a Milano entro venerdi",
    );
  });

  it("keeps posts without giveaway language as candidates to review", () => {
    const listing = classifyListing(
      "Vendo tavolo da cucina in ottime condizioni",
    );

    expect(listing).toMatchObject({
      category: "Arredamento",
      isGiveaway: false,
      score: 25,
    });
  });
});
