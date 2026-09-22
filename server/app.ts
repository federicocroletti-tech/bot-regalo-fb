import express from "express";
import type { CatalogStore } from "./catalogStore.js";
import type { ServerConfig } from "./config.js";
import { createConnectorRouter } from "./connectorRoutes.js";
import { ProviderError } from "./connectors/providerError.js";
import type { ConnectorSyncService } from "./syncService.js";
import type { TokenStore } from "./tokenStore.js";

interface AppDependencies {
  catalogStore: CatalogStore;
  syncService: ConnectorSyncService;
  tokenStore?: TokenStore;
}

export function createApp(config: ServerConfig, dependencies: AppDependencies) {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "32kb" }));

  app.get("/api/health", (_request, response) => {
    response.json({ status: "ok" });
  });

  app.use("/api", createConnectorRouter({ config, ...dependencies }));

  app.use(
    (
      error: unknown,
      _request: express.Request,
      response: express.Response,
      next: express.NextFunction,
    ) => {
      if (response.headersSent) {
        next(error);
        return;
      }

      if (error instanceof ProviderError) {
        response.status(error.statusCode).json({ error: error.message });
        return;
      }

      console.error("Errore API locale", error);
      response
        .status(500)
        .json({ error: "Errore interno del servizio locale." });
    },
  );

  return app;
}
