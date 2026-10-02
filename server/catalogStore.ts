import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import {
  importAutomaticListings,
  type AutomaticImportOptions,
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
  isMilanRelated: z.boolean().default(false),
  notes: z.string().optional(),
  score: z.number().int().min(0).max(100),
  sourceName: z.string(),
  sourcePublishedAt: z.string().datetime().optional(),
  sourceText: z.string(),
  status: z.enum(["nuovo", "da-contattare", "richiesto", "archiviato"]),
  title: z.string(),
  updatedAt: z.string().datetime(),
  url: z.string().url(),
});

export interface CatalogStore {
  list(): Promise<Listing[]>;
  importDrafts(
    drafts: ListingDraft[],
    options?: AutomaticImportOptions,
  ): Promise<AutomaticImportResult>;
  updateStatus(id: string, status: ListingStatus): Promise<Listing | undefined>;
  remove(id: string): Promise<boolean>;
}

export class FileCatalogStore implements CatalogStore {
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly filePath: string,
    private readonly reportPath = localCatalogReportPath(dirname(filePath)),
  ) {}

  async list(): Promise<Listing[]> {
    await this.queue;
    return this.readAll();
  }

  async importDrafts(
    drafts: ListingDraft[],
    options?: AutomaticImportOptions,
  ): Promise<AutomaticImportResult> {
    return this.withLock(async () => {
      const current = await this.readAll();
      const result = importAutomaticListings(drafts, current, options);
      await this.writeAll(result.listings);
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
    await this.writeAtomically(this.filePath, JSON.stringify(listings));
    await this.writeAtomically(this.reportPath, renderCatalogReport(listings));
  }

  private async writeAtomically(path: string, content: string): Promise<void> {
    const temporaryPath = `${path}.${process.pid}.tmp`;
    await writeFile(temporaryPath, content, {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(temporaryPath, path);
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

export function localCatalogReportPath(
  dataDirectory = join(process.cwd(), ".data"),
): string {
  return join(dataDirectory, "catalogo-regali.md");
}

function escapeMarkdownLinkText(value: string): string {
  return value.replace(/[\\[\]]/g, "\\$&");
}

function reportDate(listing: Listing): string {
  const value = listing.sourcePublishedAt ?? listing.createdAt;
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Rome",
    year: "numeric",
  }).format(new Date(value));
}

export function renderCatalogReport(listings: Listing[]): string {
  const header = [
    "# Catalogo regali Facebook",
    "",
    `Post catalogati: ${listings.length}`,
    "",
  ];

  if (!listings.length) {
    return [
      ...header,
      "Nessun post regalo trovato nelle fonti sincronizzate.",
      "",
    ].join("\n");
  }

  const links = listings.map(
    (listing) =>
      [
        `- [${escapeMarkdownLinkText(listing.title)}](${listing.url})`,
        `  - Fonte: ${listing.sourceName}`,
        `  - Data: ${reportDate(listing)}`,
        `  - Stato: ${listing.status}`,
      ].join("\n"),
  );
  return [...header, ...links, ""].join("\n");
}
