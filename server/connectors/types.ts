export interface ImportedListing {
  externalId: string;
  sourceName: string;
  sourceText: string;
  sourcePublishedAt?: string;
  url: string;
}

export interface SyncResult {
  listings: ImportedListing[];
  warnings: string[];
}

export type Fetcher = typeof fetch;
