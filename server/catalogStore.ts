import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import {
  importAutomaticListings,
  updateListingStatus,
  type AutomaticImportResult,
} from "../src/domain/catalog.js";
import {
  categories,
  type Listing,
  type ListingDraft,
  type ListingStatus,
} from "../src/domain/listing.js";

const listingSchema = z.object({
  category: z.enum(categories),
  createdAt: z.string().datetime(),
  id: z.string().min(1),
  isGiveaway: z.boolean(),
  notes: z.string().optional(),
  score: z.number().int().min(0).max(100),
  sourceName: z.string(),
  sourceText: z.string(),
  status: z.enum(["nuovo", "da-contattare", "richiesto", "archiviato"]),
  title: z.string(),
  updatedAt: z.string().datetime(),
  url: z.string().url(),
});

export interface CatalogStore {
  list(): Promise<Listing[]>;
  importDrafts(drafts: ListingDraft[]): Promise<AutomaticImportResult>;
  updateStatus(id: string, status: ListingStatus): Promise<Listing | undefined>;
  remove(id: string): Promise<boolean>;
}

export class FileCatalogStore implements CatalogStore {
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async list(): Promise<Listing[]> {
    await this.queue;
    return this.readAll();
  }

  async importDrafts(drafts: ListingDraft[]): Promise<AutomaticImportResult> {
    return this.withLock(async () => {
      const current = await this.readAll();
      const result = importAutomaticListings(drafts, current);
      if (result.added > 0) await this.writeAll(result.listings);
      return result;
    });
  }

  async updateStatus(
    id: string,
    status: ListingStatus,
  ): Promise<Listing | undefined> {
    return this.withLock(async () => {
      const current = await this.readAll();
      const updated = updateListingStatus(current, id, status);
      const listing = updated.find((candidate) => candidate.id === id);
      if (!listing) return undefined;
      await this.writeAll(updated);
      return listing;
    });
  }

  async remove(id: string): Promise<boolean> {
    return this.withLock(async () => {
      const current = await this.readAll();
      const updated = current.filter((listing) => listing.id !== id);
      if (updated.length === current.length) return false;
      await this.writeAll(updated);
      return true;
    });
  }

  private async withLock<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.queue;
    let release: () => void;
    this.queue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;

    try {
      return await operation();
    } finally {
      release!();
    }
  }

  private async readAll(): Promise<Listing[]> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return listingSchema.array().parse(JSON.parse(raw)) as Listing[];
    } catch (error) {
      if (isMissingFile(error)) return [];
      if (error instanceof z.ZodError || error instanceof SyntaxError) {
        throw new Error(
          "Il catalogo locale e danneggiato. Ripristina .data/catalog.json da un backup.",
        );
      }
      throw error;
    }
  }

  private async writeAll(listings: Listing[]): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 });
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(listings), {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(temporaryPath, this.filePath);
  }
}

function isMissingFile(error: unknown): error is NodeJS.ErrnoException {
  return Boolean(
    error &&
    typeof error === "object" &&
    (error as NodeJS.ErrnoException).code === "ENOENT",
  );
}

export function localCatalogPath(projectRoot = process.cwd()): string {
  return join(projectRoot, ".data", "catalog.json");
}
