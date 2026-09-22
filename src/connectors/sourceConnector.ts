import type { ListingDraft } from "../domain/listing";

export interface SourceConnector {
  readonly id: string;
  readonly displayName: string;
  importRecentListings(): Promise<ListingDraft[]>;
}

// A Meta Graph API connector belongs here only after the app has the documented
// access token, permissions, app review, and an eligible Page or approved source.
