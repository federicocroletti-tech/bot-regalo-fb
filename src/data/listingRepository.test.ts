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

  it("keeps opaque notification links as candidates when requested", () => {
    const result = importAutomaticListings(
      [
        {
          url: "https://www.facebook.com/groups/regali/posts/789",
          sourceName: "Notifica Facebook",
          sourceText: "Hai una nuova attivita in un gruppo.",
        },
      ],
      [],
      { includeUnclassified: true },
    );

    expect(result).toMatchObject({
      added: 1,
      notGiveaway: 1,
      unclassified: 1,
    });
    expect(result.listings[0]).toMatchObject({ isGiveaway: false });
  });

  it("preserves the publication time reported by an authorized source", () => {
    const result = importAutomaticListings(
      [
        {
          url: "https://www.facebook.com/groups/regali/posts/999",
          sourceName: "Regali Milano",
          sourcePublishedAt: "2026-10-02T08:30:00.000Z",
          sourceText: "Regalo una lampada, ritiro a Milano.",
        },
      ],
      [],
    );

    expect(result.listings[0]?.sourcePublishedAt).toBe(
      "2026-10-02T08:30:00.000Z",
    );
  });
});
