# Regali vicini

Catalogo locale per organizzare post Facebook che offrono oggetti gratuitamente. L'app non accede a Facebook, non usa cookie, non esegue scraping e non tenta di aggirare controlli della piattaforma.

## Cosa fa l'MVP

- Importa un link Facebook e il testo visibile che l'utente sceglie di incollare.
- Verifica che il link appartenga a `facebook.com` o `fb.watch` e impedisce i duplicati.
- Riconosce parole chiave come `regalo`, `gratis`, `cedo` e `free`, poi assegna una categoria.
- Gestisce lo stato degli annunci, ricerca, note personali e l'esportazione in JSON.
- Conserva tutti i dati nel `localStorage` del browser: nessun dato viene inviato a un server.

## Limiti Meta e scelta progettuale

La documentazione ufficiale delle Pages API consente di leggere il feed di una Pagina solo con token, ruoli o funzionalita approvate appropriati. L'accesso ai post pubblici di Pagine non gestite richiede la feature `Page Public Content Access` approvata. Non viene fornita un'API generale per cercare tutti i post Facebook o leggere gruppi arbitrari.

Per questo l'MVP implementa il flusso conforme piu utile oggi: durante la normale consultazione di Facebook, copia il link di un post interessante e il suo testo visibile, poi incollali nell'app. La catalogazione, classificazione e gestione successive sono automatiche.

Un futuro connettore autorizzato puo essere aggiunto tramite il contratto `src/connectors/sourceConnector.ts`, esclusivamente per fonti, token, permessi e revisioni Meta effettivamente disponibili.

# Regali vicini

Applicazione locale che raccoglie automaticamente gli annunci Facebook di oggetti regalati, nei limiti consentiti dalle API ufficiali. I post riconosciuti vengono classificati, deduplicati e salvati in un catalogo locale persistente.

## Cosa automatizza

- **Pagine Facebook che gestisci:** usa Meta Pages API. Il flusso ufficiale ottiene un User Access Token, ricava i Page Access Token tramite `/me/accounts`, quindi legge il feed delle sole Pagine autorizzate.
- **Gruppi Facebook:** Meta non espone un'API per cercare o scaricare i post dei gruppi arbitrari. L'app importa automaticamente i link contenuti nelle notifiche email Facebook che autorizzi a leggere con Gmail.
- **Marketplace:** non esiste un'API pubblica per scandagliarlo. Le sue eventuali notifiche email Facebook possono essere trattate dallo stesso connettore Gmail.

L'app non usa scraping, automazione del browser, cookie personali, API private o credenziali Facebook nel browser.

## Prima configurazione

1. Installa Node.js `20.19` o superiore e npm `10` o superiore.
2. Installa le dipendenze:

   ```powershell
   npm install
   ```

3. Crea la configurazione locale:

   ```powershell
   Copy-Item .env.example .env.local
   ```

4. Genera il valore per `TOKEN_ENCRYPTION_KEY` e incollalo in `.env.local`:

   ```powershell
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
   ```

5. Avvia API locale e interfaccia insieme:

   ```powershell
   npm run dev:all
   ```

Apri `http://127.0.0.1:5173`. Se Vite indica un'altra porta, aggiorna `APP_ORIGIN` con quell'URL in `.env.local` e riavvia `npm run dev:all`.

Il server locale sincronizza immediatamente all'avvio e poi ogni `SYNC_INTERVAL_MINUTES` minuti. Il valore predefinito e `360` (6 ore). Il computer e il processo `npm run dev:all` devono rimanere attivi per consentire le sincronizzazioni pianificate.

## Callback HTTPS Meta in locale

Facebook Login richiede un redirect OAuth HTTPS. Per il test locale il progetto include un callback isolato sulla porta `META_CALLBACK_PROXY_PORT` (predefinita `8788`): non espone il catalogo o le API dell'app, ma inoltra soltanto `GET /api/auth/meta/callback` al server loopback.

1. Con API locale in esecuzione, avvia il tunnel di sviluppo:

   ```powershell
   npm run dev:meta-tunnel
   ```

2. Copia l'URL `https://...trycloudflare.com` mostrato dal comando e aggiungi `/api/auth/meta/callback`.
3. Inserisci l'URL completo sia in `META_REDIRECT_URI` di `.env.local`, sia in **Valid OAuth Redirect URIs** nelle impostazioni Facebook Login dell'app Meta.
4. Riavvia `npm run dev:api`, quindi usa **Collega Meta**.

I Quick Tunnel Cloudflare hanno URL casuali e sono soltanto per sviluppo. Se il tunnel viene riavviato, ripeti i punti 2-4. Per un utilizzo continuativo, usa un dominio HTTPS e un tunnel Cloudflare gestito.

## Dati Meta necessari

Non inviare password, cookie, token o secret in chat. Inserisci i segreti solo in `.env.local`, che e ignorato da Git.

| Variabile              | Dove reperirla                                                                                                                                                                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `META_APP_ID`          | [Meta for Developers - My Apps](https://developers.facebook.com/apps/) → seleziona o crea l'app → **App settings** → **Basic** → App ID.                                                                                                                                                   |
| `META_APP_SECRET`      | Stessa schermata → App secret. Mostralo e copialo direttamente in `.env.local`; Meta non lo espone di nuovo in chiaro.                                                                                                                                                                     |
| `META_LOGIN_CONFIG_ID` | Consigliato: crea una **Business type app**, aggiungi **Facebook Login for Business**, poi **Configurations** → crea configurazione con i permessi minimi necessari. Copia il Configuration ID.                                                                                            |
| `META_REDIRECT_URI`    | URL HTTPS esatto del callback, per esempio `https://<tunnel>.trycloudflare.com/api/auth/meta/callback`. Aggiungi lo stesso valore alle **Valid OAuth Redirect URIs** nelle impostazioni del prodotto Facebook Login.                                                                       |
| `META_PAGE_IDS`        | Inserisci gli ID delle sole Pagine che amministri, separati da virgole. Puoi ricavarli dalla risposta `/me/accounts` nel [Graph API Explorer](https://developers.facebook.com/tools/explorer/) dopo aver ottenuto un token, oppure dalle informazioni della Pagina in Meta Business Suite. |

Per la lettura delle Pagine, la configurazione deve includere almeno le autorizzazioni necessarie al flusso di lettura, in particolare `pages_show_list` e `pages_read_engagement`. Meta richiede ruoli o task idonei sulla Pagina e App Review/Advanced Access quando l'app e live o serve persone esterne ai ruoli dell'app. Le Pagine esterne non gestite non sono supportate da questo connettore.

Dopo aver compilato le variabili Meta e riavviato il server, usa **Collega Meta** nell'app. Il consenso avviene sul sito Meta; l'access token viene cifrato localmente in `.data/connector-tokens.json` e non viene mostrato nell'interfaccia.

## Dati Gmail necessari

1. In [Google Cloud Console](https://console.cloud.google.com/), crea o seleziona un progetto.
2. In **APIs & Services** → **Library**, abilita **Gmail API**.
3. Configura la schermata del consenso OAuth.
4. In **Credentials** → **Create credentials** → **OAuth client ID**, scegli **Web application**.
5. Aggiungi esattamente `http://127.0.0.1:8787/api/auth/gmail/callback` come Authorized redirect URI.
6. Copia Client ID e Client Secret in `GMAIL_CLIENT_ID` e `GMAIL_CLIENT_SECRET` di `.env.local`.

Il connettore richiede esclusivamente lo scope `https://www.googleapis.com/auth/gmail.readonly` per leggere le email restituite da `GMAIL_QUERY`; non invia, modifica o elimina messaggi. Questo scope e classificato da Google come **restricted**: per un'app pubblica possono essere necessari verifica OAuth e requisiti aggiuntivi di sicurezza. Per uso personale locale, aggiungi il tuo account come test user nella schermata di consenso.

Attiva le notifiche email Facebook per i gruppi che vuoi seguire e, se disponibili, per gli avvisi Marketplace. In Facebook usa le impostazioni del gruppo per scegliere le notifiche di tutti i post e le impostazioni delle notifiche email dell'account per riceverle nella casella Gmail collegata. L'app analizza solo le notifiche identificate dalla query Gmail configurata.

Dopo aver compilato le variabili Google e riavviato il server, usa **Collega Gmail** nell'app. Il consenso avviene su Google; access token e refresh token restano cifrati nella cartella locale `.data`.

## Catalogo e sicurezza

- I risultati sono salvati in `.data/catalog.json`; il browser mantiene una cache locale per l'interfaccia.
- Token OAuth sono cifrati con AES-256-GCM in `.data/connector-tokens.json` usando `TOKEN_ENCRYPTION_KEY`.
- `.env.local` e `.data/` sono esclusi dal repository.
- Gli endpoint che cambiano dati accettano richieste solo dall'origine locale configurata.
- I post vengono riconosciuti con parole chiave quali `regalo`, `gratis`, `cedo` e `free`; i messaggi non pertinenti e i link duplicati vengono scartati.

## Architettura

- `src/domain`: modello e classificatore puro, condiviso tra UI e backend.
- `src/data`: cache del browser.
- `server/connectors`: connettori ufficiali Meta Pages e Gmail.
- `server/tokenStore.ts`: token OAuth cifrati.
- `server/catalogStore.ts`: archivio locale persistente con scritture atomiche.
- `server/syncService.ts` e `server/syncScheduler.ts`: import manuale e pianificato.
- `src/App.tsx`: dashboard React che visualizza il catalogo del server.

Per una futura pubblicazione web, il backend puo sostituire i file locali con un database e un secret manager; i token rimangono sempre lato server.

## Verifica

```powershell
npm run lint
npm test
npm run typecheck:server
npm run build
npm audit
```

Oppure:

```powershell
npm run verify
```

## Fonti ufficiali

- https://developers.facebook.com/documentation/pages-api/overview
- https://developers.facebook.com/docs/pages-api/posts
- https://developers.facebook.com/documentation/facebook-login/facebook-login-for-business
- https://developers.google.com/identity/protocols/oauth2/web-server
- https://developers.google.com/gmail/api/auth/scopes
