import { classifyListing } from "./classifier.js";
import type { Listing, ListingDraft, ListingStatus } from "./listing.js";

function createId(): string {
  const generatedId = globalThis.crypto?.randomUUID?.();
  return generatedId ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function normalizeFacebookUrl(rawUrl: string): string {
  let url: URL;

  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new Error("Inserisci un link Facebook valido.");
  }

  const host = url.hostname.toLowerCase();
  const isFacebookHost =
    host === "facebook.com" || host.endsWith(".facebook.com");
  const isShortFacebookHost = host === "fb.watch" || host.endsWith(".fb.watch");

  if (!isFacebookHost && !isShortFacebookHost) {
    throw new Error("Il link deve appartenere a facebook.com o fb.watch.");
  }

  ["ref", "mibextid", "rdid"].forEach((parameter) =>
    url.searchParams.delete(parameter),
  );
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export function createListing(
  draft: ListingDraft,
  existingListings: Listing[],
): Listing {
  const url = normalizeFacebookUrl(draft.url);
  const sourceText = draft.sourceText.trim();

  if (!sourceText) {
    throw new Error("Il contenuto della fonte non puo essere vuoto.");
  }

  if (existingListings.some((listing) => listing.url === url)) {
    throw new Error("Questo post e gia presente nel catalogo.");
  }

  const classification = classifyListing(sourceText);
  const now = new Date().toISOString();

  return {
    id: createId(),
    url,
    sourceName: draft.sourceName.trim() || "Facebook",
    sourceText,
    notes: draft.notes?.trim() ?? "",
    title: classification.title,
    category: classification.category,
    isGiveaway: classification.isGiveaway,
    score: classification.score,
    status: "nuovo",
    createdAt: now,
    updatedAt: now,
  };
}

export interface AutomaticImportResult {
  added: number;
  ignored: number;
  notGiveaway: number;
  listings: Listing[];
}

export function importAutomaticListings(
  drafts: ListingDraft[],
  existingListings: Listing[],
): AutomaticImportResult {
  const listings = [...existingListings];
  let added = 0;
  let ignored = 0;
  let notGiveaway = 0;

  for (const draft of drafts) {
    try {
      const listing = createListing(draft, listings);
      if (!listing.isGiveaway) {
        notGiveaway += 1;
        continue;
      }

      listings.unshift(listing);
      added += 1;
    } catch {
      ignored += 1;
    }
  }

  return { added, ignored, notGiveaway, listings };
}

export function updateListingStatus(
  listings: Listing[],
  id: string,
  status: ListingStatus,
): Listing[] {
  const updatedAt = new Date().toISOString();
  return listings.map((listing) =>
    listing.id === id ? { ...listing, status, updatedAt } : listing,
  );
}
