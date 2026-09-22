import type { Category, Classification } from "./listing.js";

const giveawayPatterns = [
  /\bregal[oaie]\b/i,
  /\bgratuit[oaie]?\b/i,
  /\bfree\b/i,
  /\bcedo\b/i,
  /\bsi dona\b/i,
];

const categoryPatterns: Array<[Category, RegExp]> = [
  [
    "Arredamento",
    /\b(divano|tavolo|sedia|armadio|mobile|libreria|materasso)\b/i,
  ],
  [
    "Elettronica",
    /\b(tv|televisore|computer|pc|monitor|stampante|telefono|smartphone)\b/i,
  ],
  ["Bambini", /\b(passeggino|giocattol[oi]|neonat[oa]|bambin[oi])\b/i],
  ["Abbigliamento", /\b(vestit[oi]|scarpe|giacca|cappotto|abbigliamento)\b/i],
  ["Libri", /\b(libr[oi]|fumett[oi]|rivist[ae])\b/i],
  ["Casa", /\b(stoviglie|piatti|bicchieri|pentole|lampada|specchio)\b/i],
];

function titleFromText(text: string): string {
  const firstLine = text
    .split(/\r?\n|[.!?]/)[0]
    .replace(/\s+/g, " ")
    .trim();

  if (!firstLine) return "Oggetto da verificare";
  return firstLine.length > 72
    ? `${firstLine.slice(0, 69).trimEnd()}...`
    : firstLine;
}

export function classifyListing(text: string): Classification {
  const normalizedText = text.trim();
  const giveawayMatches = giveawayPatterns.filter((pattern) =>
    pattern.test(normalizedText),
  ).length;
  const category =
    categoryPatterns.find(([, pattern]) => pattern.test(normalizedText))?.[0] ??
    "Altro";

  return {
    title: titleFromText(normalizedText),
    category,
    isGiveaway: giveawayMatches > 0,
    score: Math.min(
      100,
      giveawayMatches * 35 + (category === "Altro" ? 0 : 25),
    ),
  };
}
