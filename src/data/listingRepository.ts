import type { Listing } from "../domain/listing";
export {
  createListing,
  importAutomaticListings,
  normalizeFacebookUrl,
  updateListingStatus,
  type AutomaticImportResult,
} from "../domain/catalog.js";

const storageKey = "regali-facebook-catalogo/listings/v1";

export function loadListings(): Listing[] {
  const storedValue = window.localStorage.getItem(storageKey);
  if (!storedValue) return [];

  try {
    const parsed = JSON.parse(storedValue) as unknown;
    return Array.isArray(parsed) ? (parsed as Listing[]) : [];
  } catch {
    return [];
  }
}

export function saveListings(listings: Listing[]): void {
  window.localStorage.setItem(storageKey, JSON.stringify(listings));
}
