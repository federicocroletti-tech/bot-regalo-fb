import { useDeferredValue, useEffect, useState } from "react";
import {
  CloudDownload,
  Download,
  ExternalLink,
  Inbox,
  Link2,
  Mail,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import "./App.css";
import { loadListings, saveListings } from "./data/listingRepository";
import { categories, type Listing, type ListingStatus } from "./domain/listing";

const statuses: Array<{ value: ListingStatus; label: string }> = [
  { value: "nuovo", label: "Nuovo" },
  { value: "da-contattare", label: "Da contattare" },
  { value: "richiesto", label: "Richiesto" },
  { value: "archiviato", label: "Archiviato" },
];

type ConnectorId = "meta-pages" | "gmail-notifications";

interface ConnectorState {
  id: ConnectorId;
  configured: boolean;
  connected: boolean;
  missing: string[];
}

interface SyncSummary {
  added: number;
  ignored: number;
  notGiveaway: number;
  warnings: string[];
}

interface SyncResponse {
  summary?: SyncSummary;
  error?: string;
}

interface ListingResponse {
  listing?: Listing;
  error?: string;
}

async function requestCatalog(): Promise<Listing[]> {
  const response = await fetch("/api/listings");
  const payload = (await response.json().catch(() => null)) as {
    listings?: Listing[];
    error?: string;
  } | null;

  if (!response.ok || !payload?.listings) {
    throw new Error(payload?.error ?? "Il catalogo locale non e disponibile.");
  }

  return payload.listings;
}

async function requestConnectorStates(): Promise<ConnectorState[]> {
  const response = await fetch("/api/connectors");
  const payload = (await response.json().catch(() => null)) as {
    connectors?: ConnectorState[];
    error?: string;
  } | null;

  if (!response.ok || !payload?.connectors) {
    throw new Error(
      payload?.error ?? "Il servizio locale delle fonti non e disponibile.",
    );
  }

  return payload.connectors;
}

function connectorStateText(connector: ConnectorState | undefined): string {
  if (!connector) return "Servizio non raggiungibile";
  if (connector.connected) return "Connesso";
  if (connector.configured) return "Pronto per il collegamento";
  return "Da configurare";
}

function App() {
  const [listings, setListings] = useState<Listing[]>(loadListings);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ListingStatus | "tutti">(
    "tutti",
  );
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [connectors, setConnectors] = useState<ConnectorState[]>([]);
  const [connectorError, setConnectorError] = useState<string | null>(null);
  const [syncingConnector, setSyncingConnector] = useState<ConnectorId | null>(
    null,
  );
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    try {
      saveListings(listings);
    } catch {
      setCatalogError(
        "Impossibile salvare i dati nel browser. Verifica lo spazio disponibile.",
      );
    }
  }, [listings]);

  useEffect(() => {
    let disposed = false;

    void requestConnectorStates()
      .then((states) => {
        if (!disposed) {
          setConnectors(states);
        }
      })
      .catch((caughtError) => {
        if (!disposed) {
          setConnectorError(
            caughtError instanceof Error
              ? caughtError.message
              : "Non e stato possibile leggere lo stato delle fonti.",
          );
        }
      });

    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    let disposed = false;

    async function refreshCatalog(): Promise<void> {
      try {
        const storedListings = await requestCatalog();
        if (!disposed) setListings(storedListings);
      } catch (caughtError) {
        if (!disposed) {
          setCatalogError(
            caughtError instanceof Error
              ? caughtError.message
              : "Non e stato possibile aggiornare il catalogo locale.",
          );
        }
      }
    }

    void refreshCatalog();
    const interval = window.setInterval(() => void refreshCatalog(), 60_000);

    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, []);

  const visibleListings = listings
    .filter(
      (listing) => statusFilter === "tutti" || listing.status === statusFilter,
    )
    .filter((listing) => {
      const query = deferredSearch.trim().toLowerCase();
      if (!query) return true;
      return [
        listing.title,
        listing.sourceName,
        listing.category,
        listing.sourceText,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    })
    .sort((first, second) => second.createdAt.localeCompare(first.createdAt));

  const giveawayCount = listings.filter(
    (listing) => listing.isGiveaway && listing.status !== "archiviato",
  ).length;
  const metaConnector = connectors.find(
    (connector) => connector.id === "meta-pages",
  );
  const gmailConnector = connectors.find(
    (connector) => connector.id === "gmail-notifications",
  );

  async function handleSync(connector: ConnectorId) {
    setConnectorError(null);
    setSyncMessage(null);
    setSyncingConnector(connector);

    try {
      const endpoint =
        connector === "meta-pages"
          ? "/api/sync/meta-pages"
          : "/api/sync/gmail-notifications";
      const response = await fetch(endpoint, { method: "POST" });
      const payload = (await response
        .json()
        .catch(() => null)) as SyncResponse | null;

      if (!response.ok || !payload?.summary) {
        throw new Error(
          payload?.error ?? "La sincronizzazione non e riuscita.",
        );
      }

      const summary = payload.summary;
      setListings(await requestCatalog());
      setSyncMessage(
        summary.added
          ? `Aggiunti ${summary.added} nuovi annunci in regalo.${summary.notGiveaway ? ` Esclusi ${summary.notGiveaway} messaggi non pertinenti.` : ""}${summary.ignored ? ` Ignorati ${summary.ignored} duplicati.` : ""}`
          : "Nessun nuovo annuncio in regalo trovato.",
      );

      setConnectors(await requestConnectorStates());
    } catch (caughtError) {
      setConnectorError(
        caughtError instanceof Error
          ? caughtError.message
          : "Sincronizzazione non riuscita.",
      );
    } finally {
      setSyncingConnector(null);
    }
  }

  async function handleStatusChange(id: string, status: ListingStatus) {
    setCatalogError(null);

    try {
      const response = await fetch(`/api/listings/${encodeURIComponent(id)}`, {
        body: JSON.stringify({ status }),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      });
      const payload = (await response
        .json()
        .catch(() => null)) as ListingResponse | null;
      if (!response.ok || !payload?.listing) {
        throw new Error(
          payload?.error ?? "Non e stato possibile aggiornare il post.",
        );
      }

      setListings((current) =>
        current.map((listing) =>
          listing.id === id ? payload.listing! : listing,
        ),
      );
    } catch (caughtError) {
      setCatalogError(
        caughtError instanceof Error
          ? caughtError.message
          : "Non e stato possibile aggiornare il post.",
      );
    }
  }

  async function handleDelete(id: string) {
    setCatalogError(null);

    try {
      const response = await fetch(`/api/listings/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(
          payload?.error ?? "Non e stato possibile eliminare il post.",
        );
      }

      setListings((current) => current.filter((listing) => listing.id !== id));
    } catch (caughtError) {
      setCatalogError(
        caughtError instanceof Error
          ? caughtError.message
          : "Non e stato possibile eliminare il post.",
      );
    }
  }

  function handleExport() {
    const exportData = JSON.stringify(listings, null, 2);
    const blob = new Blob([exportData], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = "catalogo-regali-facebook.json";
    link.click();
    URL.revokeObjectURL(href);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <Sparkles size={18} aria-hidden="true" />
          </span>
          <div>
            <p className="eyebrow">Catalogo locale</p>
            <h1>Regali vicini</h1>
          </div>
        </div>
        <button
          className="button button-secondary"
          type="button"
          onClick={handleExport}
          disabled={!listings.length}
        >
          <Download size={16} aria-hidden="true" /> Esporta dati
        </button>
      </header>

      <section className="workspace" aria-label="Catalogo post">
        <aside className="sidebar">
          <div className="metric">
            <span>Da valutare</span>
            <strong>{giveawayCount}</strong>
            <small>annunci con parole chiave regalo</small>
          </div>
          <div className="policy-note">
            <ShieldCheck size={18} aria-hidden="true" />
            <p>
              Importa solo fonti autorizzate tramite API Meta o notifiche Gmail
              che autorizzi. Non esegue scraping e non usa cookie Facebook.
            </p>
          </div>
          <div className="category-list" aria-label="Categorie rilevate">
            <p className="section-label">Categorie</p>
            {categories.map((category) => (
              <span key={category}>{category}</span>
            ))}
          </div>
        </aside>

        <div className="content">
          <section className="source-panel" aria-labelledby="sources-heading">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Fonti automatiche</p>
                <h2 id="sources-heading">Collega e sincronizza</h2>
              </div>
              <CloudDownload size={22} aria-hidden="true" />
            </div>
            <div className="connector-grid">
              <article className="connector-card">
                <div className="connector-card-heading">
                  <span className="connector-icon">
                    <Link2 size={19} aria-hidden="true" />
                  </span>
                  <div>
                    <h3>Pagine Meta</h3>
                    <p>
                      Legge le Pagine incluse nella configurazione autorizzata.
                    </p>
                  </div>
                </div>
                <p
                  className={`connector-state ${metaConnector?.connected ? "is-connected" : ""}`}
                >
                  <span aria-hidden="true" />
                  {connectorStateText(metaConnector)}
                </p>
                {!metaConnector?.configured && metaConnector?.missing.length ? (
                  <p className="connector-missing">
                    Mancano: {metaConnector.missing.join(", ")}
                  </p>
                ) : null}
                <div className="connector-actions">
                  {metaConnector?.configured ? (
                    <a
                      className="button button-secondary"
                      href="/api/auth/meta/start"
                    >
                      <Link2 size={16} aria-hidden="true" />{" "}
                      {metaConnector.connected ? "Ricollega" : "Collega Meta"}
                    </a>
                  ) : (
                    <a className="button button-secondary" href="#setup">
                      Configura Meta
                    </a>
                  )}
                  <button
                    className="button button-primary"
                    type="button"
                    onClick={() => void handleSync("meta-pages")}
                    disabled={
                      !metaConnector?.connected || syncingConnector !== null
                    }
                  >
                    <RefreshCw
                      className={
                        syncingConnector === "meta-pages" ? "is-spinning" : ""
                      }
                      size={16}
                      aria-hidden="true"
                    />
                    {syncingConnector === "meta-pages"
                      ? "Sincronizzo..."
                      : "Sincronizza"}
                  </button>
                </div>
              </article>

              <article className="connector-card">
                <div className="connector-card-heading">
                  <span className="connector-icon">
                    <Mail size={19} aria-hidden="true" />
                  </span>
                  <div>
                    <h3>Notifiche Gmail</h3>
                    <p>
                      Importa i link nelle notifiche Facebook ricevute via
                      email.
                    </p>
                  </div>
                </div>
                <p
                  className={`connector-state ${gmailConnector?.connected ? "is-connected" : ""}`}
                >
                  <span aria-hidden="true" />
                  {connectorStateText(gmailConnector)}
                </p>
                {!gmailConnector?.configured &&
                gmailConnector?.missing.length ? (
                  <p className="connector-missing">
                    Mancano: {gmailConnector.missing.join(", ")}
                  </p>
                ) : null}
                <div className="connector-actions">
                  {gmailConnector?.configured ? (
                    <a
                      className="button button-secondary"
                      href="/api/auth/gmail/start"
                    >
                      <Mail size={16} aria-hidden="true" />{" "}
                      {gmailConnector.connected ? "Ricollega" : "Collega Gmail"}
                    </a>
                  ) : (
                    <a className="button button-secondary" href="#setup">
                      Configura Gmail
                    </a>
                  )}
                  <button
                    className="button button-primary"
                    type="button"
                    onClick={() => void handleSync("gmail-notifications")}
                    disabled={
                      !gmailConnector?.connected || syncingConnector !== null
                    }
                  >
                    <RefreshCw
                      className={
                        syncingConnector === "gmail-notifications"
                          ? "is-spinning"
                          : ""
                      }
                      size={16}
                      aria-hidden="true"
                    />
                    {syncingConnector === "gmail-notifications"
                      ? "Sincronizzo..."
                      : "Importa notifiche"}
                  </button>
                </div>
              </article>
            </div>
            <div className="setup-guide" id="setup">
              <p>
                <strong>Gruppi e Marketplace:</strong> Meta non permette una
                scansione generale. Attiva le notifiche Facebook e collega
                Gmail: i link ricevuti verranno filtrati automaticamente.
              </p>
              <p>
                <strong>Pagine:</strong> configura la Meta App e gli ID Pagina
                in <code>.env.local</code>; i segreti restano nel server locale.
              </p>
            </div>
            {connectorError && (
              <p className="form-error" role="alert">
                {connectorError}
              </p>
            )}
            {syncMessage && (
              <p className="sync-message" role="status">
                {syncMessage}
              </p>
            )}
          </section>

          <section className="list-panel" aria-labelledby="catalog-heading">
            <div className="list-toolbar">
              <div>
                <p className="eyebrow">Archivio</p>
                <h2 id="catalog-heading">
                  Post catalogati <span>{visibleListings.length}</span>
                </h2>
              </div>
              <div className="filters">
                <label className="search-field">
                  <Search size={16} aria-hidden="true" />
                  <span className="sr-only">Cerca nel catalogo</span>
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Cerca"
                  />
                </label>
                <select
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(
                      event.target.value as ListingStatus | "tutti",
                    )
                  }
                  aria-label="Filtra per stato"
                >
                  <option value="tutti">Tutti gli stati</option>
                  {statuses.map((status) => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {visibleListings.length ? (
              <div className="listing-grid">
                {visibleListings.map((listing) => (
                  <article className="listing-card" key={listing.id}>
                    <div className="listing-topline">
                      <span
                        className={`confidence ${listing.isGiveaway ? "confirmed" : "review"}`}
                      >
                        {listing.isGiveaway
                          ? `Match ${listing.score}%`
                          : "Da verificare"}
                      </span>
                      <button
                        className="icon-button danger"
                        type="button"
                        title="Elimina post"
                        aria-label={`Elimina ${listing.title}`}
                        onClick={() => void handleDelete(listing.id)}
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    </div>
                    <h3>{listing.title}</h3>
                    <p className="listing-source">
                      {listing.sourceName} <span>{listing.category}</span>
                    </p>
                    {listing.notes && (
                      <p className="listing-note">{listing.notes}</p>
                    )}
                    <div className="listing-actions">
                      <select
                        value={listing.status}
                        aria-label={`Stato di ${listing.title}`}
                        onChange={(event) =>
                          void handleStatusChange(
                            listing.id,
                            event.target.value as ListingStatus,
                          )
                        }
                      >
                        {statuses.map((status) => (
                          <option key={status.value} value={status.value}>
                            {status.label}
                          </option>
                        ))}
                      </select>
                      <a
                        className="icon-button"
                        href={listing.url}
                        target="_blank"
                        rel="noreferrer"
                        title="Apri post Facebook"
                        aria-label={`Apri ${listing.title} su Facebook`}
                      >
                        <ExternalLink size={16} aria-hidden="true" />
                      </a>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <Inbox size={30} aria-hidden="true" />
                <h3>In attesa delle fonti automatiche</h3>
                <p>
                  Collega Meta o Gmail, poi avvia una sincronizzazione: saranno
                  salvati soltanto gli annunci riconosciuti come regali.
                </p>
                <a href="#sources-heading" className="text-link">
                  <Link2 size={15} aria-hidden="true" /> Configura le fonti
                </a>
              </div>
            )}
          </section>
          {catalogError && (
            <p className="form-error catalog-error" role="alert">
              {catalogError}
            </p>
          )}
        </div>
      </section>
    </main>
  );
}

export default App;
