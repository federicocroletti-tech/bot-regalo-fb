import { describe, expect, it } from "vitest";
import { importAutomaticListings } from "./listingRepository";

describe("importAutomaticListings", () => {
  it("adds giveaway matches once and filters out unrelated notifications", () => {
    const result = importAutomaticListings(
      [
        {
          url: "https://www.facebook.com/groups/regali/posts/123",
          sourceName: "Regali di quartiere",
          sourceText: "Regalo tavolo in legno, ritiro oggi.",
        },
        {
          url: "https://www.facebook.com/groups/regali/posts/123",
          sourceName: "Regali di quartiere",
          sourceText: "Regalo tavolo in legno, ritiro oggi.",
        },
        {
          url: "https://www.facebook.com/groups/regali/posts/456",
          sourceName: "Regali di quartiere",
          sourceText: "Vendo computer portatile in ottime condizioni.",
        },
      ],
      [],
    );

    expect(result).toMatchObject({ added: 1, ignored: 1, notGiveaway: 1 });
    expect(result.listings).toHaveLength(1);
    expect(result.listings[0]).toMatchObject({
      category: "Arredamento",
      isGiveaway: true,
    });
  });
});
