# Esercizio e pubblicazione

## Architettura

Browser → HTTPS / reverse proxy → singolo processo Node/Express → SQLite su disco persistente.
Il backend contatta Groq Chat Completions per impostazione iniziale; OpenAI Responses è disponibile solo scegliendo esplicitamente AI_PROVIDER=openai. Nessun fallback. Non c’è alcun collegamento al database PetNote e non è implementato un servizio di invio.

**Non distribuire questa applicazione come funzioni serverless con filesystem effimero, su GitHub Pages, o con più repliche che lavorano lo stesso archivio.** La coda e il budget sono pensati per una singola istanza. Non avviare cluster/PM2 multiprocess.

## Opzione Docker

1. Prepara dominio e certificato HTTPS sul tuo hosting/reverse proxy.
2. Crea sul server un file `.env.production` non versionato e con permessi `600`. Il file è escluso da Git.

```dotenv
NODE_ENV=production
PORT=3000
DATA_DIR=/app/data
APP_ORIGIN=https://agente.tuo-dominio.it
ADMIN_PASSWORD=
AI_PROVIDER=groq
GROQ_API_KEY=
GROQ_MODEL=openai/gpt-oss-20b
GROQ_SEARCH_ENABLED=false
DAILY_AI_LIMIT=10
DEV_AUTH_BYPASS=false
```

Sostituisci il dominio e valorizza password lunga casuale, chiave e modello **sul server**, non in chat o nei sorgenti. Il modello Groq per le bozze deve supportare Structured Outputs strict. Per la ricerca web opzionale è usato Compound Mini: vedi [GROQ.md](GROQ.md). Puoi rimandare il provider: archivio e impostazioni rimangono utilizzabili senza IA.

```bash
docker build -t petnote-agent .
docker volume create petnote-agent-data
docker run -d --name petnote-agent \
  --restart unless-stopped \
  --env-file .env.production \
  -p 127.0.0.1:3000:3000 \
  -v petnote-agent-data:/app/data \
  petnote-agent
```

Il processo nel container ascolta su `0.0.0.0:3000`; il binding **host** su `127.0.0.1` qui è intenzionale, per esporre il servizio pubblico soltanto tramite il reverse proxy locale. Per un hosting/container preview gestito che inoltra direttamente la porta, usa il mapping richiesto dalla piattaforma e l’origine HTTPS assegnata.

Configura il reverse proxy affinché inoltri tutte le richieste HTTP al backend, preservi `Origin`, termini HTTPS e non esponga il disco `/app/data`. Esempio minimale Caddy sullo stesso host:

```caddy
agente.tuo-dominio.it {
  reverse_proxy 127.0.0.1:3000
}
```

Non abilitare CORS generico. `APP_ORIGIN` è l’origine esatta, senza percorso o slash finale; una differenza di protocollo/host/porta produce correttamente un errore 403 per le scritture. Il backend non si fida di `X-Forwarded-*` per concedere l’accesso.

In produzione un bypass attivo, un’origine non HTTPS o una password mancante/corta impediscono l’avvio. Cookie Secure e policy anti-iframe sono intenzionali: apri il servizio protetto direttamente, non incorporarlo in un altro sito.

## Opzione Node diretto

```bash
npm ci
npm run build
# Predisponi le variabili nell’ambiente del servizio oppure nel file .env protetto.
npm start
```

Avvia con un gestore di servizi del server, **una sola istanza** e utente dedicato non root. `DATA_DIR` deve essere scrivibile e persistente. Pubblica con HTTPS come sopra. Il processo ascolta su `0.0.0.0`; limita l’accesso alla porta con firewall/reverse proxy.

## Database, backup e gestione dei dati

- Database reale: `DATA_DIR/petnote.sqlite` (+ eventuali file WAL/SHM). Anteprima aperta: `DATA_DIR/preview-only.sqlite`, separato.
- Per un backup semplice e coerente: ferma il container/servizio, copia **tutta la directory dati**, riavvia. Non copiare solo il file `.sqlite` mentre SQLite è in WAL e il server è attivo. In alternativa usa una procedura SQLite di backup online collaudata.
- Cifra i backup e limitali agli amministratori autorizzati. Una copia contiene anche sessioni e informazioni commerciali.
- Per ripristinare: ferma il servizio, ripristina la directory mantenendo proprietà/permessi, elimina le sessioni archiviate prima di rendere di nuovo pubblico il servizio, riavvia e verifica conteggi e fonti.
- Alla rotazione della password, ferma il servizio, modifica il segreto ed elimina le sessioni esistenti dalla tabella `sessions` prima di riavviare; la sola modifica della password non revoca le sessioni già emesse.
- Definisci prima dell’uso reale un periodo di conservazione e una procedura per accesso, rettifica, cancellazione e opposizione. Le note e le evidenze non devono contenere dati sanitari o informazioni sui clienti dei partner.
- Usa `Non contattare` per un’opposizione: blocca bozze ed export del messaggio. Non cancellare indiscriminatamente le opposizioni per poi ricontattare la stessa struttura. Il CSV dell’archivio include tale stato, non è una lista autorizzata per campagne.
- Non sono presenti politiche di cancellazione automatica o un portale privacy. Un’eventuale cancellazione deve considerare strutture, bozze, snapshot nei lavori, registro e copie di backup, non soltanto una riga del CRM.

## Limiti, guasti e consumi

Coda massima 5 lavori, un solo worker. Il budget conteggia tentativi iniziati al provider, anche se falliscono, su giorno UTC. Ricerca max 5 strutture: con Groq Compound Mini un solo tool call; con OpenAI max 3. Completamento max 6.000 token per ricerca, 2.048 per bozze Groq; timeout 120 secondi. Il limite non garantisce una spesa massima in euro: configura anche i limiti dell’account del provider scelto.

`Sospendi agente` annulla coda e lavoro attivo; `Annulla` interrompe un singolo lavoro. Il risultato di un lavoro annullato non viene importato, anche se il provider lo restituisce dopo l’annullamento. Costi già maturati non sono rimborsabili automaticamente.

Un riavvio marca i lavori in coda/in corso come interrotti e **non li rilancia**. Anche i risultati incerti richiedono una nuova richiesta consapevole. Non vengono stampati token, password o risposte d’errore grezze del provider. Per HTTP 400 verifica compatibilità modello/formato/strumenti; per 401 ruota/verifica la chiave sul server; per 429 controlla quota e fatturazione.

## Checklist prima della messa in esercizio

- [ ] Hosting HTTPS e disco persistente, singola istanza; accesso diretto al backend limitato.
- [ ] Nessuna chiave in repository, build, log pubblici o chat; bypass disattivato.
- [ ] Login obbligatorio; richiesta senza sessione a `/api/state` restituisce 401.
- [ ] POST da origine estranea restituisce 403; cookie Secure/HttpOnly/SameSite Strict.
- [ ] Scheda PetNote verificata dal titolare, inclusi messaggi distinti per veterinari e pet shop.
- [ ] Condizioni provider, spesa, trattamento e conservazione valutati.
- [ ] Prova reale **una struttura**: lavoro concluso, fonte aperta e identità verificata manualmente. Nessuna connessione live è dimostrata dalla sola presenza delle variabili.
- [ ] Bozza verificata: approvazione bloccata senza qualifica e richiesta/consenso; opt-out blocca export.
- [ ] Riavvio verificato: archivio preservato, lavori non rilanciati; backup/ripristino provati.
- [ ] Procedura di privacy/opposizione e scadenza dati definita; nessun invio automatico aggiunto.

La pagina GitHub Pages è solo una comunicazione statica: non inserire in essa password, chiavi, database o contatti. Il lavoro precedente rimane recuperabile in Git.
