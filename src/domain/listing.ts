export const categories = [
  "Arredamento",
  "Elettronica",
  "Casa",
  "Bambini",
  "Abbigliamento",
  "Libri",
  "Altro",
] as const;

export type Category = (typeof categories)[number];

export type ListingStatus =
  | "nuovo"
  | "da-contattare"
  | "richiesto"
  | "archiviato";

export interface ListingDraft {
  url: string;
  sourceName: string;
  sourceText: string;
  notes?: string;
}

export interface Listing extends ListingDraft {
  id: string;
  title: string;
  category: Category;
  status: ListingStatus;
  isGiveaway: boolean;
  score: number;
  createdAt: string;
  updatedAt: string;
}

export interface Classification {
  title: string;
  category: Category;
  isGiveaway: boolean;
  score: number;
}
