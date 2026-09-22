import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";
import type { CatalogStore } from "./catalogStore.js";
import type { ServerConfig } from "./config.js";
import { getConnectorStatuses } from "./config.js";
import {
  createGmailAuthorizationUrl,
  exchangeGmailAuthorizationCode,
} from "./connectors/gmailNotifications.js";
import {
  createMetaAuthorizationUrl,
  exchangeMetaAuthorizationCode,
} from "./connectors/metaPages.js";
import { ProviderError } from "./connectors/providerError.js";
import { OAuthStateStore, type OAuthProvider } from "./oauthState.js";
import type { ConnectorSyncService } from "./syncService.js";
import {
  EncryptedTokenStore,
  localTokenPath,
  type OAuthToken,
  type TokenStore,
} from "./tokenStore.js";

interface ConnectorRoutesOptions {
  catalogStore: CatalogStore;
  config: ServerConfig;
  fetcher?: typeof fetch;
  stateStore?: OAuthStateStore;
  syncService: ConnectorSyncService;
  tokenStore?: TokenStore;
}

const listingStatusSchema = z.object({
  status: z.enum(["nuovo", "da-contattare", "richiesto", "archiviato"]),
});

function redirectToApp(
  response: Response,
  origin: string,
  provider: OAuthProvider,
  state: "connected" | "denied" | "error",
): void {
  const destination = new URL(origin);
  destination.searchParams.set("connection", `${provider}-${state}`);
  response.redirect(destination.toString());
}

function requireTokenStore(options: ConnectorRoutesOptions): TokenStore {
  if (options.tokenStore) return options.tokenStore;
  if (!options.config.tokenEncryptionKey) {
    throw new ProviderError(
      "Configura TOKEN_ENCRYPTION_KEY prima di collegare un provider.",
      409,
    );
  }
  return new EncryptedTokenStore(
    localTokenPath(),
    options.config.tokenEncryptionKey,
  );
}

function assertCallbackState(
  stateStore: OAuthStateStore,
  provider: OAuthProvider,
  state: unknown,
): void {
  if (typeof state !== "string" || !stateStore.consume(provider, state)) {
    throw new ProviderError(
      "La richiesta di collegamento non e valida o e scaduta. Riprova.",
      400,
    );
  }
}

function isExpired(token: OAuthToken): boolean {
  return Boolean(token.expiresAt && Date.parse(token.expiresAt) <= Date.now());
}

function isConnected(
  provider: OAuthProvider,
  token: OAuthToken | undefined,
): boolean {
  if (!token) return false;
  if (!isExpired(token)) return true;
  return provider === "gmail" && Boolean(token.refreshToken);
}

function listingIdFromParameter(value: string | string[] | undefined): string {
  if (typeof value !== "string" || !value) {
    throw new ProviderError("L'identificatore del post non e valido.", 400);
  }
  return value;
}

function requireLocalOrigin(config: ServerConfig) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const origin = request.get("origin");
    if (origin && origin !== config.appOrigin) {
      response.status(403).json({ error: "Origine non autorizzata." });
      return;
    }
    next();
  };
}

export function createConnectorRouter(options: ConnectorRoutesOptions): Router {
  const router = Router();
  const fetcher = options.fetcher ?? fetch;
  const stateStore = options.stateStore ?? new OAuthStateStore();

  router.get("/listings", async (_request, response, next) => {
    try {
      response.json({ listings: await options.catalogStore.list() });
    } catch (error) {
      next(error);
    }
  });

  router.patch(
    "/listings/:id",
    requireLocalOrigin(options.config),
    async (request, response, next) => {
      try {
        const payload = listingStatusSchema.safeParse(request.body);
        if (!payload.success)
          throw new ProviderError("Lo stato richiesto non e valido.", 400);
        const listing = await options.catalogStore.updateStatus(
          listingIdFromParameter(request.params.id),
          payload.data.status,
        );
        if (!listing)
          throw new ProviderError("Post non trovato nel catalogo.", 404);
        response.json({ listing });
      } catch (error) {
        next(error);
      }
    },
  );

  router.delete(
    "/listings/:id",
    requireLocalOrigin(options.config),
    async (request, response, next) => {
      try {
        if (
          !(await options.catalogStore.remove(
            listingIdFromParameter(request.params.id),
          ))
        ) {
          throw new ProviderError("Post non trovato nel catalogo.", 404);
        }
        response.status(204).end();
      } catch (error) {
        next(error);
      }
    },
  );

  router.get("/connectors", async (_request, response, next) => {
    try {
      const tokenStore = options.config.tokenEncryptionKey
        ? requireTokenStore(options)
        : undefined;
      const statuses = getConnectorStatuses(options.config);
      const connectors = await Promise.all(
        statuses.map(async (connector) => {
          const provider = connector.id === "meta-pages" ? "meta" : "gmail";
          const token = tokenStore
            ? await tokenStore.read(provider)
            : undefined;
          return { ...connector, connected: isConnected(provider, token) };
        }),
      );
      response.json({ connectors });
    } catch (error) {
      next(error);
    }
  });

  router.get("/auth/meta/start", (_request, response, next) => {
    try {
      const state = stateStore.issue("meta");
      response.redirect(createMetaAuthorizationUrl(options.config, state));
    } catch (error) {
      next(error);
    }
  });

  router.get("/auth/meta/callback", async (request, response, next) => {
    try {
      assertCallbackState(stateStore, "meta", request.query.state);
      if (typeof request.query.error === "string") {
        redirectToApp(response, options.config.appOrigin, "meta", "denied");
        return;
      }
      if (typeof request.query.code !== "string")
        throw new ProviderError(
          "Meta non ha restituito un codice di autorizzazione.",
          400,
        );

      const token = await exchangeMetaAuthorizationCode(
        options.config,
        request.query.code,
        fetcher,
      );
      await requireTokenStore(options).write("meta", token);
      redirectToApp(response, options.config.appOrigin, "meta", "connected");
    } catch (error) {
      next(error);
    }
  });

  router.get("/auth/gmail/start", (_request, response, next) => {
    try {
      const state = stateStore.issue("gmail");
      response.redirect(createGmailAuthorizationUrl(options.config, state));
    } catch (error) {
      next(error);
    }
  });

  router.get("/auth/gmail/callback", async (request, response, next) => {
    try {
      assertCallbackState(stateStore, "gmail", request.query.state);
      if (typeof request.query.error === "string") {
        redirectToApp(response, options.config.appOrigin, "gmail", "denied");
        return;
      }
      if (typeof request.query.code !== "string")
        throw new ProviderError(
          "Google non ha restituito un codice di autorizzazione.",
          400,
        );

      const token = await exchangeGmailAuthorizationCode(
        options.config,
        request.query.code,
        fetcher,
      );
      await requireTokenStore(options).write("gmail", token);
      redirectToApp(response, options.config.appOrigin, "gmail", "connected");
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/sync/meta-pages",
    requireLocalOrigin(options.config),
    async (_request, response, next) => {
      try {
        response.json({
          summary: await options.syncService.sync("meta-pages"),
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/sync/gmail-notifications",
    requireLocalOrigin(options.config),
    async (_request, response, next) => {
      try {
        response.json({
          summary: await options.syncService.sync("gmail-notifications"),
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get("/sync/status", (_request, response) => {
    response.json({ sync: options.syncService.getStatuses() });
  });

  return router;
}
