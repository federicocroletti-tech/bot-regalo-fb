import type { CatalogStore } from "./catalogStore.js";
import type { ServerConfig } from "./config.js";
import {
  refreshGmailToken,
  syncGmailNotifications,
} from "./connectors/gmailNotifications.js";
import { syncMetaPagePosts } from "./connectors/metaPages.js";
import { ProviderError } from "./connectors/providerError.js";
import type { SyncResult } from "./connectors/types.js";
import type { OAuthProvider } from "./oauthState.js";
import type { TokenStore } from "./tokenStore.js";

export type SyncConnector = "meta-pages" | "gmail-notifications";

export interface SyncSummary {
  added: number;
  connector: SyncConnector;
  ignored: number;
  notGiveaway: number;
  syncedAt: string;
  warnings: string[];
}

export interface SyncStatus {
  connector: SyncConnector;
  lastError?: string;
  lastSuccessAt?: string;
  lastSummary?: SyncSummary;
}

function providerFor(connector: SyncConnector): OAuthProvider {
  return connector === "meta-pages" ? "meta" : "gmail";
}

function isExpired(expiresAt: string | undefined): boolean {
  return Boolean(expiresAt && Date.parse(expiresAt) <= Date.now());
}

export class ConnectorSyncService {
  private readonly statuses = new Map<SyncConnector, SyncStatus>();

  constructor(
    private readonly config: ServerConfig,
    private readonly catalogStore: CatalogStore,
    private readonly tokenStore: TokenStore | undefined,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async sync(connector: SyncConnector): Promise<SyncSummary> {
    const tokenStore = this.requireTokenStore();
    const provider = providerFor(connector);
    let token = await tokenStore.read(provider);
    if (!token) {
      throw new ProviderError(
        `Collega ${connector === "meta-pages" ? "Meta" : "Gmail"} prima di sincronizzare.`,
        401,
      );
    }

    if (connector === "meta-pages" && isExpired(token.expiresAt)) {
      await tokenStore.remove("meta");
      throw new ProviderError(
        "Il collegamento Meta e scaduto. Ricollega Meta per continuare.",
        401,
      );
    }

    if (connector === "gmail-notifications" && isExpired(token.expiresAt)) {
      token = await refreshGmailToken(this.config, token, this.fetcher);
      await tokenStore.write("gmail", token);
    }

    try {
      const sourceResult: SyncResult =
        connector === "meta-pages"
          ? await syncMetaPagePosts(
              this.config,
              token.accessToken,
              this.fetcher,
            )
          : await syncGmailNotifications(
              this.config,
              token.accessToken,
              this.fetcher,
            );
      const imported = await this.catalogStore.importDrafts(
        sourceResult.listings,
      );
      const summary: SyncSummary = {
        added: imported.added,
        connector,
        ignored: imported.ignored,
        notGiveaway: imported.notGiveaway,
        syncedAt: new Date().toISOString(),
        warnings: sourceResult.warnings,
      };
      this.statuses.set(connector, {
        connector,
        lastSuccessAt: summary.syncedAt,
        lastSummary: summary,
      });
      return summary;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Sincronizzazione non riuscita.";
      this.statuses.set(connector, { connector, lastError: message });
      throw error;
    }
  }

  async syncConnectedSources(): Promise<SyncSummary[]> {
    const summaries: SyncSummary[] = [];

    for (const connector of ["meta-pages", "gmail-notifications"] as const) {
      if (
        !this.isConfigured(connector) ||
        !(await this.hasUsableToken(connector))
      )
        continue;

      try {
        summaries.push(await this.sync(connector));
      } catch (error) {
        console.error(
          `Sincronizzazione automatica ${connector} non riuscita`,
          error,
        );
      }
    }

    return summaries;
  }

  getStatuses(): SyncStatus[] {
    return (["meta-pages", "gmail-notifications"] as const).map(
      (connector) => this.statuses.get(connector) ?? { connector },
    );
  }

  private requireTokenStore(): TokenStore {
    if (!this.tokenStore) {
      throw new ProviderError(
        "Configura TOKEN_ENCRYPTION_KEY prima di collegare un provider.",
        409,
      );
    }
    return this.tokenStore;
  }

  private async hasUsableToken(connector: SyncConnector): Promise<boolean> {
    if (!this.tokenStore) return false;
    const token = await this.tokenStore.read(providerFor(connector));
    return Boolean(
      token && !(connector === "meta-pages" && isExpired(token.expiresAt)),
    );
  }

  private isConfigured(connector: SyncConnector): boolean {
    if (connector === "meta-pages") {
      return Boolean(
        this.config.meta.appId &&
        this.config.meta.appSecret &&
        this.config.meta.redirectUri &&
        this.config.meta.pageIds.length &&
        this.config.tokenEncryptionKey,
      );
    }

    return Boolean(
      this.config.gmail.clientId &&
      this.config.gmail.clientSecret &&
      this.config.gmail.redirectUri &&
      this.config.tokenEncryptionKey,
    );
  }
}
