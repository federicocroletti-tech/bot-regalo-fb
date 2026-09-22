import { createApp } from "./app.js";
import { FileCatalogStore, localCatalogPath } from "./catalogStore.js";
import { readServerConfig } from "./config.js";
import { startMetaCallbackProxy } from "./metaCallbackProxy.js";
import { ConnectorSyncService } from "./syncService.js";
import { SyncScheduler } from "./syncScheduler.js";
import { EncryptedTokenStore, localTokenPath } from "./tokenStore.js";

const config = readServerConfig();
const catalogStore = new FileCatalogStore(localCatalogPath());
const tokenStore = config.tokenEncryptionKey
  ? new EncryptedTokenStore(localTokenPath(), config.tokenEncryptionKey)
  : undefined;
const syncService = new ConnectorSyncService(config, catalogStore, tokenStore);
const scheduler = new SyncScheduler(syncService, config.syncIntervalMinutes);
const app = createApp(config, { catalogStore, syncService, tokenStore });

app.listen(config.port, "127.0.0.1", () => {
  scheduler.start();
  startMetaCallbackProxy(config.metaCallbackProxyPort, config.port);
  console.log(
    `API locale pronta su http://127.0.0.1:${config.port}; sincronizzazione ogni ${config.syncIntervalMinutes} minuti.`,
  );
});
